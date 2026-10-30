import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.mjs';

const EXTENSION_MIME = new Map([
  ['webp', 'image/webp'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['avif', 'image/avif'],
  ['gif', 'image/gif'],
]);
const IMAGE_NAME_PATTERN = /^[^/\\]+\.(?:webp|png|jpe?g|avif|gif)$/iu;

/** 正则里写控制范围会被 Biome 拒绝，这里按码点判定 NUL 与其它控制字符。 */
function hasControlCharacter(value) {
  return [...value].some((char) => char.codePointAt(0) < 0x20);
}

/** 单段图片文件名 → MIME；含分隔符、控制字符或未知扩展名时返回 null。 */
function imageContentType(fileName) {
  if (!IMAGE_NAME_PATTERN.test(fileName) || hasControlCharacter(fileName)) return null;
  return EXTENSION_MIME.get(path.extname(fileName).slice(1).toLowerCase()) ?? null;
}

/**
 * 读取一个目录下的单段图片文件。调用方负责把 directory 限定在帖子/素材根内；
 * 不存在与非法文件名统一 404，避免通过错误信息探测目录结构。
 */
export async function readImageFile(directory, fileName, label) {
  const contentType = imageContentType(fileName);
  if (!contentType) throw new HttpError(404, `${label}不存在：${fileName}`);
  try {
    return { contentType, data: await readFile(path.join(directory, fileName)) };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      throw new HttpError(404, `${label}不存在：${fileName}`);
    }
    throw new HttpError(500, `读取${label}失败`, { cause: error });
  }
}
