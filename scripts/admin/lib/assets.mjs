import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './atomic-write.mjs';
import { HttpError } from './http.mjs';
import { readImageFile } from './image-files.mjs';

/** 素材注册表与公开资源目录的唯一映射；表情与贴纸是两套独立注册表。 */
export const ASSET_KINDS = {
  emoji: {
    folder: 'emoji',
    directory: path.join('public', 'emoji'),
    registry: path.join('src', 'data', 'emoji.json'),
    suffixes: [''],
  },
  sticker: {
    folder: 'sticker',
    directory: path.join('public', 'sticker'),
    registry: path.join('src', 'data', 'stickers.json'),
    suffixes: ['', '-still'],
  },
};

const OTHER_KIND = {
  emoji: 'sticker',
  sticker: 'emoji',
};

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(500, `${label}缺失或不是字符串`);
  }
  return value;
}

function previewUrl(kind, src) {
  return `/api/assets/${kind}/${encodeURIComponent(path.posix.basename(src))}`;
}

export function assetSlug(label) {
  return label.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/gu, '');
}

export function deriveCode(set, label) {
  return `${set}_${assetSlug(label)}`;
}

/** 只有真正改动过的记录才重排关键词，未改动的保持原样，与原控制台行为一致。 */
export function mergeKeywords(record, label, setLabel, input) {
  const auto = new Set([record.label, record.setLabel, record.set]);
  const current = record.keywords.filter((word) => !auto.has(word));
  const sameInput =
    current.length === input.length && current.every((word, index) => word === input[index]);
  if (sameInput) {
    const replaced = record.keywords.map((word) => {
      if (word === record.label) return label;
      if (word === record.setLabel) return setLabel;
      return word;
    });
    return [...new Set(replaced)];
  }
  return [...new Set([label, setLabel, record.set, ...input])];
}

export function parseKeywords(value) {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value.map((word) => (typeof word === 'string' ? word.trim() : '')).filter(Boolean),
      ),
    ];
  }
  return [
    ...new Set(
      String(value ?? '')
        .split(/[,，、]+/u)
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeRecord(kind, record, index) {
  if (!isPlainObject(record)) throw new HttpError(500, `${kind} 第 ${index + 1} 项不是对象`);
  const src = requireString(record.src, `${kind} 第 ${index + 1} 项的 src`);
  return {
    code: requireString(record.code, `${kind} 第 ${index + 1} 项的 code`),
    label: requireString(record.label, `${kind} 第 ${index + 1} 项的 label`),
    set: requireString(record.set, `${kind} 第 ${index + 1} 项的 set`),
    setLabel: requireString(record.setLabel, `${kind} 第 ${index + 1} 项的 setLabel`),
    width: Number.isFinite(record.width) ? record.width : 0,
    height: Number.isFinite(record.height) ? record.height : 0,
    keywords: Array.isArray(record.keywords)
      ? record.keywords.filter((word) => typeof word === 'string')
      : [],
    previewUrl: previewUrl(kind, src),
    posterUrl:
      typeof record.poster === 'string' && record.poster ? previewUrl(kind, record.poster) : '',
  };
}

async function listFiles(dir, extensions) {
  if (!existsSync(dir)) return [];
  const files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listFiles(full, extensions)));
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  } catch {
    // 目录不可读时安全忽略
  }
  return files;
}

/** 扫描全站正文与说说对短代码的引用（:code: 形式）。 */
export async function scanAssetUsage(root) {
  const contentDir = path.join(root, 'src', 'content');
  const shuoshuoDir = path.join(root, 'src', 'data', 'shuoshuo');
  const [contentFiles, shuoshuoFiles] = await Promise.all([
    listFiles(contentDir, ['.md', '.mdx']),
    listFiles(shuoshuoDir, ['.json']),
  ]);
  const files = [...contentFiles, ...shuoshuoFiles];
  const usage = {};
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const lines = raw.split(/\r?\n/u);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/:([\p{L}\p{N}_-]+):/gu)) {
        const code = match[1];
        if (!usage[code]) usage[code] = [];
        usage[code].push(`${relative}:${index + 1}`);
      }
    });
  }
  return usage;
}

async function readRegistryRaw(root, kind) {
  const relative = ASSET_KINDS[kind].registry;
  let raw;
  try {
    raw = await readFile(path.join(root, relative), 'utf8');
  } catch (error) {
    throw new HttpError(500, `读取 ${relative} 失败`, { cause: error });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new HttpError(500, `${relative} 不是合法 JSON`, { cause: error });
  }
  if (!Array.isArray(data)) throw new HttpError(500, `${relative} 必须是数组`);
  return data;
}

async function readRegistry(root, kind) {
  const data = await readRegistryRaw(root, kind);
  return data.map((record, index) => normalizeRecord(kind, record, index));
}

/** 短代码选择器与素材管理接口：两套注册表。 */
export async function readAssetRegistries(root) {
  const [emoji, stickers] = await Promise.all([
    readRegistry(root, 'emoji'),
    readRegistry(root, 'sticker'),
  ]);
  return { emoji, stickers };
}

/** 只回读 public 下两套素材目录里的单段文件名，拒绝路径分隔符与未知扩展名。 */
export async function readAssetFile(root, kindInput, fileName) {
  const kind = Object.hasOwn(ASSET_KINDS, kindInput) ? ASSET_KINDS[kindInput] : null;
  if (!kind) throw new HttpError(404, `素材不存在：${kindInput}/${fileName}`);
  const image = await readImageFile(path.join(root, kind.directory), fileName, '素材');
  return { name: fileName, ...image };
}

function planMoves(root, kind, records, nextCodes) {
  const config = ASSET_KINDS[kind];
  const moves = [];
  for (const record of records) {
    const nextCode = nextCodes.get(record.code);
    if (!nextCode || nextCode === record.code) continue;
    for (const suffix of config.suffixes) {
      const from = path.join(root, config.directory, `${record.code}${suffix}.webp`);
      const to = path.join(root, config.directory, `${nextCode}${suffix}.webp`);
      if (!existsSync(from)) {
        throw new HttpError(400, `缺少文件：${path.basename(from)}`);
      }
      moves.push({ from, to, suffix });
    }
  }
  const sources = new Set(moves.map((move) => move.from));
  for (const move of moves) {
    if (existsSync(move.to) && !sources.has(move.to)) {
      throw new HttpError(400, `目标文件已存在：${path.basename(move.to)}`);
    }
  }
  return moves;
}

async function applyMoves(moves) {
  if (moves.length === 0) return;
  const stamps = moves.map(
    (move, index) => `${move.from}.__tmp-${index}-${Date.now()}-${randomUUID()}`,
  );
  const staged = [];
  try {
    for (let index = 0; index < moves.length; index += 1) {
      await rename(moves[index].from, stamps[index]);
      staged.push(index);
    }
  } catch (error) {
    for (const index of staged.reverse()) {
      try {
        await rename(stamps[index], moves[index].from);
      } catch {
        // 回滚尽最大努力
      }
    }
    throw new HttpError(500, `文件重命名临时暂存失败：${error.message}`, { cause: error });
  }

  const committed = [];
  try {
    for (let index = 0; index < moves.length; index += 1) {
      await rename(stamps[index], moves[index].to);
      committed.push(index);
    }
  } catch (error) {
    for (const index of committed.reverse()) {
      try {
        await rename(moves[index].to, stamps[index]);
      } catch {
        // 回滚尽最大努力
      }
    }
    for (let index = moves.length - 1; index >= 0; index -= 1) {
      try {
        await rename(stamps[index], moves[index].from);
      } catch {
        // 回滚尽最大努力
      }
    }
    throw new HttpError(500, `文件重命名写回目标失败：${error.message}`, { cause: error });
  }
}

/** 修改素材短代码、显示名与关键词，执行两阶段安全重命名与注册表写回。 */
export async function saveAssets(root, payload) {
  if (!isPlainObject(payload)) throw new HttpError(400, '请求体必须是 JSON 对象');
  const { kind, items, setLabels } = payload;
  if (!Object.hasOwn(ASSET_KINDS, kind)) throw new HttpError(400, '未知素材类型');
  if (!Array.isArray(items)) throw new HttpError(400, 'items 必须是数组');

  const [records, otherRecords] = await Promise.all([
    readRegistryRaw(root, kind),
    readRegistryRaw(root, OTHER_KIND[kind]),
  ]);

  const otherCodes = new Set(otherRecords.map((r) => r.code));
  const itemMap = new Map();
  for (const item of items) {
    if (!item?.code) throw new HttpError(400, '条目缺少 code');
    if (itemMap.has(item.code)) throw new HttpError(400, `重复提交短代码：${item.code}`);
    itemMap.set(item.code, item);
  }

  const planned = new Map();
  const taken = new Set();
  for (const record of records) {
    const item = itemMap.get(record.code);
    if (item) {
      const label = String(item.label ?? '').trim();
      if (!label) throw new HttpError(400, `名称不能为空：${record.code}`);
      if (label.length > 40) throw new HttpError(400, `名称过长（最多 40 字）：${label}`);
      const nextCode = String(item.nextCode ?? '').trim() || deriveCode(record.set, label);
      if (!/^[a-z0-9]+_[\p{L}\p{N}_-]+$/u.test(nextCode)) {
        throw new HttpError(400, `短代码格式无效：${nextCode}（套装前缀请用小写字母和数字）`);
      }
      if (!nextCode.startsWith(`${record.set}_`)) {
        throw new HttpError(400, `短代码必须以 ${record.set}_ 开头：${nextCode}`);
      }
      if (taken.has(nextCode) || otherCodes.has(nextCode)) {
        throw new HttpError(400, `短代码重复：${nextCode}`);
      }
      taken.add(nextCode);
      const rawKeywords =
        item.keywords !== undefined ? parseKeywords(item.keywords) : record.keywords;
      planned.set(record.code, { code: nextCode, label, keywords: rawKeywords });
    } else {
      if (taken.has(record.code) || otherCodes.has(record.code)) {
        throw new HttpError(400, `短代码重复：${record.code}`);
      }
      taken.add(record.code);
      planned.set(record.code, {
        code: record.code,
        label: record.label,
        keywords: record.keywords,
      });
    }
  }

  const labels = new Map();
  for (const record of records) {
    const value = String(setLabels?.[record.set] ?? '').trim();
    labels.set(record.set, value || record.setLabel);
  }

  const nextCodes = new Map([...planned].map(([code, plan]) => [code, plan.code]));
  const moves = planMoves(root, kind, records, nextCodes);
  if (moves.length > 0) await applyMoves(moves);

  const usage = await scanAssetUsage(root);
  const warnings = [];
  const next = records.map((record) => {
    const plan = planned.get(record.code);
    if (plan.code !== record.code) {
      const refs = usage[record.code];
      if (refs?.length) {
        warnings.push(
          `:${record.code}: → :${plan.code}:，以下位置仍引用旧短代码：${refs.join('、')}`,
        );
      }
    }
    const updated = {
      ...record,
      code: plan.code,
      label: plan.label,
      setLabel: labels.get(record.set) ?? record.setLabel,
      src: `/${ASSET_KINDS[kind].folder}/${plan.code}.webp`,
      keywords: mergeKeywords(
        record,
        plan.label,
        labels.get(record.set) ?? record.setLabel,
        plan.keywords,
      ),
    };
    if (record.poster) {
      updated.poster = `/${ASSET_KINDS[kind].folder}/${plan.code}-still.webp`;
    }
    return updated;
  });

  await writeFileAtomic(
    path.join(root, ASSET_KINDS[kind].registry),
    `${JSON.stringify(next, null, 2)}\n`,
  );

  return {
    records: next.map((r, i) => normalizeRecord(kind, r, i)),
    usage,
    warnings,
  };
}

/** 批量修改套装前缀，重命名所有相关文件并更新注册表。 */
export async function renameAssetPrefix(root, payload) {
  if (!isPlainObject(payload)) throw new HttpError(400, '请求体必须是 JSON 对象');
  const { kind, set, prefix } = payload;
  if (!Object.hasOwn(ASSET_KINDS, kind)) throw new HttpError(400, '未知素材类型');
  if (!prefix || !/^[a-z0-9]+$/u.test(prefix)) {
    throw new HttpError(400, '前缀只能使用小写英文字母和数字');
  }

  const [records, otherRecords] = await Promise.all([
    readRegistryRaw(root, kind),
    readRegistryRaw(root, OTHER_KIND[kind]),
  ]);

  const affected = records.filter((r) => r.set === set);
  if (affected.length === 0) {
    throw new HttpError(404, `没有代号为 ${set} 的套装`);
  }

  const otherCodes = new Set(otherRecords.map((r) => r.code));
  const nextCodes = new Map();
  const taken = new Set();
  for (const record of records) {
    if (record.set !== set) {
      taken.add(record.code);
      continue;
    }
    const nextCode = `${prefix}_${record.code.slice(set.length + 1)}`;
    if (!/^[a-z0-9]+_[\p{L}\p{N}_-]+$/u.test(nextCode)) {
      throw new HttpError(400, `短代码格式无效：${nextCode}`);
    }
    if (taken.has(nextCode) || otherCodes.has(nextCode)) {
      throw new HttpError(400, `短代码重复：${nextCode}`);
    }
    taken.add(nextCode);
    nextCodes.set(record.code, nextCode);
  }

  const moves = planMoves(root, kind, records, nextCodes);
  if (moves.length > 0) await applyMoves(moves);

  const usage = await scanAssetUsage(root);
  const warnings = [];
  const next = records.map((record) => {
    if (record.set !== set) return record;
    const nextCode = nextCodes.get(record.code);
    const refs = usage[record.code];
    if (refs?.length) {
      warnings.push(`:${record.code}: → :${nextCode}:，以下位置仍引用旧短代码：${refs.join('、')}`);
    }
    const updated = {
      ...record,
      set: prefix,
      code: nextCode,
      src: `/${ASSET_KINDS[kind].folder}/${nextCode}.webp`,
      keywords: record.keywords.map((word) => (word === set ? prefix : word)),
    };
    if (record.poster) {
      updated.poster = `/${ASSET_KINDS[kind].folder}/${nextCode}-still.webp`;
    }
    return updated;
  });

  await writeFileAtomic(
    path.join(root, ASSET_KINDS[kind].registry),
    `${JSON.stringify(next, null, 2)}\n`,
  );

  return {
    records: next.map((r, i) => normalizeRecord(kind, r, i)),
    usage,
    warnings,
  };
}
