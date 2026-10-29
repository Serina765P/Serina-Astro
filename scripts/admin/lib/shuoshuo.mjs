import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { yearInShanghai } from '../../../src/lib/utils.ts';
import { writeFileAtomic } from './atomic-write.mjs';
import { HttpError } from './http.mjs';

export const SHUOSHUO_DIR = path.join('src', 'data', 'shuoshuo');
export const SHUOSHUO_SOURCE = 'mail-to-github';

const SHARD_FILE = /^(\d{4})\.json$/u;
const MAX_ID_LENGTH = 512;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 20000;
const ISO_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const EDITABLE_FIELDS = ['title', 'content', 'published_at'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(input, allowed) {
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new HttpError(400, `包含未知字段：${unknown.join(', ')}`);
  }
}

function requireTitle(value) {
  if (typeof value !== 'string') throw new HttpError(400, '标题必须是字符串');
  const title = value.trim();
  if (title.length > MAX_TITLE_LENGTH) throw new HttpError(400, '标题过长');
  return title;
}

function requireContent(value) {
  if (typeof value !== 'string') throw new HttpError(400, '内容必须是字符串');
  const content = value.trim();
  if (!content) throw new HttpError(400, '内容不能为空');
  if (content.length > MAX_CONTENT_LENGTH) throw new HttpError(400, '内容过长');
  return content;
}

/**
 * 发布时间必须携带时区：后台界面传 +08:00，邮件管道传 Z。
 * 缺少时区时 Date.parse 会按服务器本地时区解释，跨年分片就会写错。
 */
export function normalizePublishedAt(value) {
  if (typeof value !== 'string') throw new HttpError(400, '发布时间必须是字符串');
  const text = value.trim();
  if (!ISO_WITH_ZONE.test(text)) {
    throw new HttpError(400, '发布时间必须是带时区的 ISO 时间，例如 2026-01-01T00:00:00+08:00');
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new HttpError(400, '发布时间不是合法日期');
  return new Date(timestamp).toISOString();
}

/** 时间倒序；同一时间保持原有相对顺序。 */
function sortItems(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const delta = Date.parse(b.item.published_at) - Date.parse(a.item.published_at);
      return Number.isNaN(delta) || delta === 0 ? a.index - b.index : delta;
    })
    .map(({ item }) => item);
}

async function readShardFile(root, file) {
  const filePath = path.join(root, SHUOSHUO_DIR, file);
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new HttpError(500, `读取说说分片 ${file} 失败`, { cause: error });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new HttpError(500, `说说分片 ${file} 不是合法 JSON`, { cause: error });
  }
  if (!isPlainObject(data) || !Array.isArray(data.items)) {
    throw new HttpError(500, `说说分片 ${file} 缺少 items 数组`);
  }
  return data;
}

/** 按年份升序读取所有分片；目录不存在时视为空集合。 */
async function readShards(root) {
  const directory = path.join(root, SHUOSHUO_DIR);
  let files;
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new HttpError(500, '读取说说目录失败', { cause: error });
  }
  const years = files
    .map((file) => SHARD_FILE.exec(file))
    .filter(Boolean)
    .map((match) => ({ file: match[0], year: Number(match[1]) }))
    .sort((a, b) => a.year - b.year);

  const shards = [];
  for (const entry of years) {
    const data = await readShardFile(root, entry.file);
    if (data) shards.push({ ...entry, data });
  }
  return shards;
}

function envelope(source, items, now) {
  return {
    source: typeof source === 'string' && source.trim() ? source : SHUOSHUO_SOURCE,
    fetched_at: now.toISOString(),
    count: items.length,
    items,
  };
}

async function writeShard(root, { year, source, items }, now) {
  const file = `${year}.json`;
  try {
    await writeFileAtomic(
      path.join(root, SHUOSHUO_DIR, file),
      `${JSON.stringify(envelope(source, items, now), null, 2)}\n`,
    );
  } catch (error) {
    throw new HttpError(500, `写入说说分片 ${file} 失败`, { cause: error });
  }
}

function nextLocalId(taken, now) {
  let timestamp = now.getTime();
  let id;
  do {
    id = `local_${timestamp}`;
    timestamp += 1;
  } while (taken.has(id));
  return id;
}

/** 同 ID 跨分片只保留最高年份那份，与站点 loader 的覆盖顺序一致。 */
export async function listShuoshuo(root) {
  const shards = await readShards(root);
  const byId = new Map();
  for (const shard of shards) {
    for (const item of shard.data.items) {
      if (isPlainObject(item) && typeof item.id === 'string' && item.id) byId.set(item.id, item);
    }
  }
  const items = sortItems([...byId.values()]);
  return { count: items.length, items };
}

export async function createShuoshuo(root, input, now = new Date()) {
  if (!isPlainObject(input)) throw new HttpError(400, '请求体必须是 JSON 对象');
  rejectUnknownKeys(input, EDITABLE_FIELDS);
  const title = input.title === undefined ? '' : requireTitle(input.title);
  const content = requireContent(input.content);
  const publishedAt =
    input.published_at === undefined ? now.toISOString() : normalizePublishedAt(input.published_at);

  const shards = await readShards(root);
  const taken = new Set(
    shards.flatMap((shard) =>
      shard.data.items.filter((item) => isPlainObject(item)).map((item) => item.id),
    ),
  );
  const item = {
    id: nextLocalId(taken, now),
    title,
    type: 'MAIL',
    content,
    images: [],
    link: '',
    like: 0,
    published_at: publishedAt,
  };
  const year = yearInShanghai(new Date(publishedAt));
  const target = shards.find((shard) => shard.year === year);

  await writeShard(
    root,
    { year, source: target?.data.source, items: [item, ...(target?.data.items ?? [])] },
    now,
  );
  return { item, year };
}

function requireId(id) {
  if (typeof id !== 'string' || !id.trim()) throw new HttpError(400, '说说 ID 无效');
  if (id.length > MAX_ID_LENGTH) throw new HttpError(400, '说说 ID 过长');
  return id;
}

function validateUpdatePatch(input) {
  if (!isPlainObject(input)) throw new HttpError(400, '请求体必须是 JSON 对象');
  rejectUnknownKeys(input, EDITABLE_FIELDS);
  const keys = Object.keys(input);
  if (keys.length === 0) throw new HttpError(400, '没有可保存的字段');
  const patch = {};
  if ('title' in input) patch.title = requireTitle(input.title);
  if ('content' in input) patch.content = requireContent(input.content);
  if ('published_at' in input) patch.published_at = normalizePublishedAt(input.published_at);
  return patch;
}

/**
 * 编辑条目：时间跨年时先从所有旧分片移除，再插入目标年份分片。
 * 目标分片先落盘再清理旧分片，最坏情况是短暂重复，而不是条目丢失。
 */
export async function updateShuoshuo(root, id, patch, now = new Date()) {
  const itemId = requireId(id);
  const changes = validateUpdatePatch(patch);
  const shards = await readShards(root);

  const occurrences = [];
  for (const shard of shards) {
    for (const item of shard.data.items) {
      if (isPlainObject(item) && item.id === itemId) occurrences.push({ shard, item });
    }
  }
  if (occurrences.length === 0) throw new HttpError(404, '说说不存在');

  const current = occurrences[occurrences.length - 1].item;
  const fromYear = occurrences[occurrences.length - 1].shard.year;
  const next = { ...current, ...changes };
  const targetYear = yearInShanghai(new Date(next.published_at));
  const remaining = new Map(
    shards.map((shard) => [
      shard.year,
      {
        source: shard.data.source,
        items: shard.data.items.filter((item) => !isPlainObject(item) || item.id !== itemId),
      },
    ]),
  );
  const target = remaining.get(targetYear);
  if (target) {
    target.items = sortItems([...target.items, next]);
  } else {
    remaining.set(targetYear, { source: undefined, items: [next] });
  }

  const writes = [{ year: targetYear, ...remaining.get(targetYear) }];
  for (const shard of shards) {
    if (shard.year === targetYear) continue;
    if (!shard.data.items.some((item) => isPlainObject(item) && item.id === itemId)) continue;
    writes.push({ year: shard.year, ...remaining.get(shard.year) });
  }
  for (const write of writes) await writeShard(root, write, now);

  return { item: next, year: targetYear, fromYear: fromYear === targetYear ? null : fromYear };
}

export async function deleteShuoshuo(root, id, now = new Date()) {
  const itemId = requireId(id);
  const shards = await readShards(root);
  const affected = [];

  for (const shard of shards) {
    const items = shard.data.items.filter((item) => !isPlainObject(item) || item.id !== itemId);
    if (items.length !== shard.data.items.length) {
      affected.push({ year: shard.year, source: shard.data.source, items });
    }
  }
  if (affected.length === 0) throw new HttpError(404, '说说不存在');

  for (const write of affected) await writeShard(root, write, now);
  return { id: itemId, years: affected.map((entry) => entry.year) };
}
