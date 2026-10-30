import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomicExclusive } from './atomic-write.mjs';
import { HttpError } from './http.mjs';
import { readImageFile } from './image-files.mjs';
import { assertPostExists, POSTS_DIR } from './posts.mjs';

const MIME_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
]);
const MAX_BASE_LENGTH = 60;
const MAX_COLLISION_ATTEMPTS = 200;

function sanitizeBase(filename) {
  const basename = path.basename(filename.replace(/\\/gu, '/'));
  const rawBase = basename.replace(/\.[^.]*$/u, '');
  const hadNonAscii = /[^\p{ASCII}]/u.test(rawBase);
  let base = rawBase
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9_-]+/gu, '-')
    .replace(/^[-_]+|[-_]+$/gu, '')
    .slice(0, MAX_BASE_LENGTH)
    .toLowerCase();
  if (!base) return 'image';
  if (hadNonAscii) base = `image-${base}`;
  return base;
}

/** 文件名只由 MIME 决定扩展名，原文件名仅用于可读前缀。 */
export function imageFileName(filename, contentType) {
  const extension = MIME_EXTENSIONS.get(contentType);
  if (!extension) {
    throw new HttpError(
      415,
      `不支持的图片格式：${contentType || '未知'}；只接受 png / jpeg / webp / avif / gif`,
    );
  }
  if (!filename.trim()) throw new HttpError(400, '图片文件名不能为空');
  return { base: sanitizeBase(filename), extension };
}

async function writeUnique(directory, base, extension, data) {
  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const name = attempt === 0 ? `${base}.${extension}` : `${base}-${attempt}.${extension}`;
    try {
      await writeFileAtomicExclusive(path.join(directory, name), data);
      return name;
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw new HttpError(500, '写入图片失败', { cause: error });
    }
  }
  throw new HttpError(409, `同名图片过多，无法为 ${base}.${extension} 生成唯一文件名`);
}

/**
 * 图片落到 `src/content/posts/<slug>/`，返回可直接粘进 Markdown 的相对路径。
 * 目录与文章共用 slug 契约；调用方负责在写入队列里串行化。
 */
export async function uploadPostImage(root, slugInput, { filename, contentType, data }) {
  const slug = await assertPostExists(root, slugInput);
  if (data.length === 0) throw new HttpError(400, '图片文件为空');
  const { base, extension } = imageFileName(filename, contentType);
  const directory = path.join(root, POSTS_DIR, slug);
  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    throw new HttpError(500, '创建文章资源目录失败', { cause: error });
  }
  const name = await writeUnique(directory, base, extension, data);
  const relativePath = `${slug}/${name}`;
  return {
    slug,
    file: name,
    relativePath,
    markdown: `![](${relativePath})`,
    size: data.length,
  };
}

/**
 * 回读 `src/content/posts/<slug>/` 下的图片给编辑器预览。
 * 文件名只允许单段（无分隔符），扩展名必须落在上传白名单里。
 */
export async function readPostImage(root, slugInput, fileName) {
  const slug = await assertPostExists(root, slugInput);
  const image = await readImageFile(path.join(root, POSTS_DIR, slug), fileName, '图片');
  return { name: fileName, ...image };
}
