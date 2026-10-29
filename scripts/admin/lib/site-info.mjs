import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './atomic-write.mjs';
import { HttpError } from './http.mjs';

export const SITE_INFO_PATH = path.join('src', 'data', 'site-info.json');

const EDITABLE_FIELDS = ['description', 'social', 'friendLinks'];
const ICON_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LINKS = 200;
const MAX_NAME_LENGTH = 120;
const MAX_HREF_LENGTH = 2048;
const SOCIAL_PROTOCOLS = ['http:', 'https:', 'mailto:'];
const FRIEND_PROTOCOLS = ['http:', 'https:'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value, label, maxLength) {
  if (typeof value !== 'string') throw new HttpError(400, `${label}必须是字符串`);
  const trimmed = value.trim();
  if (!trimmed) throw new HttpError(400, `${label}不能为空`);
  if (trimmed.length > maxLength) throw new HttpError(400, `${label}过长`);
  return trimmed;
}

function requireHref(value, label, protocols) {
  const href = requireString(value, label, MAX_HREF_LENGTH);
  let url;
  try {
    url = new URL(href);
  } catch {
    throw new HttpError(400, `${label}不是合法链接`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new HttpError(400, `${label}只支持 ${protocols.join(' / ')} 协议`);
  }
  return href;
}

function rejectUnknownKeys(item, allowed, label) {
  const unknown = Object.keys(item).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new HttpError(400, `${label}包含未知字段：${unknown.join(', ')}`);
}

function requireLinkList(value, label, validateItem) {
  if (!Array.isArray(value)) throw new HttpError(400, `${label}必须是数组`);
  if (value.length > MAX_LINKS) throw new HttpError(400, `${label}最多 ${MAX_LINKS} 条`);
  return value.map((item, index) => {
    if (!isPlainObject(item)) throw new HttpError(400, `${label}第 ${index + 1} 项必须是对象`);
    return validateItem(item, index);
  });
}

function validateSocial(value) {
  return requireLinkList(value, '社交外链', (item, index) => {
    const label = `社交外链第 ${index + 1} 项`;
    rejectUnknownKeys(item, ['name', 'icon', 'href'], label);
    const icon = requireString(item.icon, `${label}的图标`, MAX_NAME_LENGTH);
    if (!ICON_PATTERN.test(icon)) {
      throw new HttpError(400, `${label}的图标必须是 Iconify 名称（如 simple-icons:github）`);
    }
    return {
      name: requireString(item.name, `${label}的名称`, MAX_NAME_LENGTH),
      icon,
      href: requireHref(item.href, `${label}的链接`, SOCIAL_PROTOCOLS),
    };
  });
}

function validateFriendLinks(value) {
  return requireLinkList(value, '友链', (item, index) => {
    const label = `友链第 ${index + 1} 项`;
    rejectUnknownKeys(item, ['name', 'href'], label);
    return {
      name: requireString(item.name, `${label}的名称`, MAX_NAME_LENGTH),
      href: requireHref(item.href, `${label}的链接`, FRIEND_PROTOCOLS),
    };
  });
}

/**
 * 只接受本面板负责的三个字段，其余顶层字段（heroTitle / heroMark）由服务端原样保留。
 * 返回规范化后的补丁，调用方与现有 JSON 合并后整体写回。
 */
export function validateSiteInfoPatch(input) {
  if (!isPlainObject(input)) throw new HttpError(400, '请求体必须是 JSON 对象');
  const keys = Object.keys(input);
  if (keys.length === 0) throw new HttpError(400, '没有可保存的字段');
  const unknown = keys.filter((key) => !EDITABLE_FIELDS.includes(key));
  if (unknown.length > 0) {
    throw new HttpError(400, `不支持修改字段：${unknown.join(', ')}`);
  }

  const patch = {};
  if ('description' in input) {
    const description = requireString(input.description, '简介', MAX_DESCRIPTION_LENGTH);
    patch.description = description;
  }
  if ('social' in input) patch.social = validateSocial(input.social);
  if ('friendLinks' in input) patch.friendLinks = validateFriendLinks(input.friendLinks);
  return patch;
}

export async function readSiteInfo(root) {
  const raw = await readFile(path.join(root, SITE_INFO_PATH), 'utf8');
  const data = JSON.parse(raw);
  if (!isPlainObject(data)) throw new Error('site-info.json 顶层必须是对象');
  return data;
}

export async function writeSiteInfo(root, data) {
  await writeFileAtomic(path.join(root, SITE_INFO_PATH), `${JSON.stringify(data, null, 2)}\n`);
}
