import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.mjs';
import { readImageFile } from './image-files.mjs';

/** 素材注册表与公开资源目录的唯一映射；表情与贴纸是两套独立注册表。 */
const ASSET_KINDS = {
  emoji: {
    directory: path.join('public', 'emoji'),
    registry: path.join('src', 'data', 'emoji.json'),
  },
  sticker: {
    directory: path.join('public', 'sticker'),
    registry: path.join('src', 'data', 'stickers.json'),
  },
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

async function readRegistry(root, kind) {
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
  return data.map((record, index) => normalizeRecord(kind, record, index));
}

/** 短代码选择器一次拿到两套素材；字段与站点渲染保持同源。 */
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
