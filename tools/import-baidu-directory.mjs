import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createResourceId, normalizePath, parseResourcesCsv, serializeResourcesCsv } from '../src/lib/resource-data.js';

const RESOURCE_EXTENSION = /\.(flac|wav|mp3|m4a|aac|ape|tak|dsf|dff|cue|mkv|mp4|avi|mov|webm|ts|m2ts|rar|zip|7z|iso)$/i;
const PACKAGE_EXTENSION = /\.(rar|zip|7z|iso)$/i;
const GENERIC_DISC_FOLDER = /^(?:disc|disk|cd)[\s._-]*\d+$/i;
const GENERIC_FORMAT_FOLDER = /^(?:flac|wav|mp3|m4a|aac|ape|hi[\s._-]?res|lossless|无损)$/i;
const SOURCE_WRAPPER = /^(?:\[?天使动漫\]?.*hi[\s._-]?res|\[?hi[\s._-]?res\]?)/i;

const FRANCHISES = {
  '1-765AS': '765AS',
  '2-灰姑娘女孩': '灰姑娘女孩',
  '3-百万现场': '百万现场',
  '4-SideM': 'SideM',
  '5-闪耀色彩': '闪耀色彩',
  '6-学园偶像大师': '学园偶像大师',
  '7-vα-liv': 'vα-liv',
};

const FRANCHISE_ORDER = new Map(Object.values(FRANCHISES).map((name, index) => [name, index + 1]));

function dirname(value) {
  return value.replace(/\/[^/]+$/, '') || '/';
}

function basename(value) {
  return value.split('/').filter(Boolean).at(-1) || '';
}

function collapseAlbumPath(parentPath) {
  let current = parentPath;
  let name = basename(current);

  if (GENERIC_DISC_FOLDER.test(name) || GENERIC_FORMAT_FOLDER.test(name) || SOURCE_WRAPPER.test(name)) {
    current = dirname(current);
    name = basename(current);
  }

  if (GENERIC_FORMAT_FOLDER.test(name)) current = dirname(current);
  return current;
}

function inferResourceType(section, fullPath) {
  if (/live|演唱会/i.test(section)) return '演唱会';
  if (/动画/i.test(section)) return '动画';
  if (/游戏/i.test(section)) return '游戏音源';
  if (/sacd|dsd/i.test(section)) return 'SACD';
  if (/hi[\s._-]?res|高解析度/i.test(section)) return 'Hi-Res';
  if (/cd|音乐/i.test(section)) {
    return /hi[\s._-]?res|96khz|192khz|24bit/i.test(fullPath) ? 'Hi-Res' : 'CD';
  }
  return '待整理';
}

function inferYear(name) {
  const fullYear = name.match(/(?:^|[\[(\s])((?:19|20)\d{2})(?:[.\-/年\]]|$)/);
  if (fullYear) return fullYear[1];

  const shortDate = name.match(/(?:^|\[)(\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:\]|\s|$)/);
  if (!shortDate) return '';
  const year = Number(shortDate[1]);
  return String(year >= 80 ? 1900 + year : 2000 + year);
}

function inferFormat(extensions, fullPath) {
  const formats = [...extensions].map((value) => value.toUpperCase()).sort();
  if (/dsf|dff/i.test(formats.join(' ')) || /sacd|dsd/i.test(fullPath)) return 'DSD';
  const base = formats.join(' / ');
  return /hi[\s._-]?res|96khz|192khz|24bit|高解析度/i.test(fullPath) && base
    ? `${base} Hi-Res`
    : base;
}

function inferSeries(albumPath, section) {
  const parentName = basename(dirname(albumPath));
  if (!parentName || parentName === section || FRANCHISES[parentName]) return '其他';
  if (GENERIC_FORMAT_FOLDER.test(parentName)) {
    const grandparent = basename(dirname(dirname(albumPath)));
    return grandparent && grandparent !== section ? grandparent : '其他';
  }
  return parentName;
}

function buildResources(directoryText, existingRows = []) {
  const paths = [...new Set(String(directoryText || '')
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean))];
  const existingByPath = new Map(existingRows.map((row) => [normalizePath(row.网盘路径), row]));
  const albums = new Map();

  paths.filter((item) => RESOURCE_EXTENSION.test(item)).forEach((filePath) => {
    const directParent = dirname(filePath);
    const albumPath = PACKAGE_EXTENSION.test(filePath) ? filePath : collapseAlbumPath(directParent);
    if (!albums.has(albumPath)) albums.set(albumPath, new Set());
    const extension = filePath.match(RESOURCE_EXTENSION)?.[1];
    if (extension) albums.get(albumPath).add(extension);
  });

  const rows = [...albums.entries()].map(([albumPath, extensions]) => {
    const segments = albumPath.split('/').filter(Boolean);
    const franchise = FRANCHISES[segments[1]] || '待整理';
    const section = segments[2] || '';
    const title = basename(albumPath).replace(PACKAGE_EXTENSION, '');
    const existing = existingByPath.get(albumPath) || {};

    return {
      id: existing.id || createResourceId(albumPath),
      企划: existing.企划 || franchise,
      资源类型: existing.资源类型 || inferResourceType(section, albumPath),
      系列: existing.系列 || inferSeries(albumPath, section),
      名称: existing.名称 || title,
      别名: existing.别名 || '',
      年份: existing.年份 || inferYear(title),
      格式: existing.格式 || inferFormat(extensions, albumPath),
      大小: existing.大小 || '',
      网盘路径: albumPath,
      分享链接: existing.分享链接 || '',
      提取码: existing.提取码 || 'imas',
      有效期: existing.有效期 || '永久',
      状态: existing.状态 || '待分享',
      更新时间: existing.更新时间 || '',
      排序值: existing.排序值 || '',
    };
  });

  rows.sort((a, b) => {
    const franchiseDiff = (FRANCHISE_ORDER.get(a.企划) || 99) - (FRANCHISE_ORDER.get(b.企划) || 99);
    return franchiseDiff || a.网盘路径.localeCompare(b.网盘路径, 'zh-CN', { numeric: true });
  });

  const explicitSortValues = rows.map((row) => row.排序值).filter(Boolean);
  const hasDuplicateSortValues = new Set(explicitSortValues).size !== explicitSortValues.length;
  if (hasDuplicateSortValues) {
    rows.forEach((row, index) => {
      row.排序值 = String((index + 1) * 10);
    });
  } else {
    let nextSortValue = Math.max(0, ...explicitSortValues.map(Number).filter(Number.isFinite)) + 10;
    rows.forEach((row) => {
      if (row.排序值) return;
      row.排序值 = String(nextSortValue);
      nextSortValue += 10;
    });
  }
  return rows;
}

function run() {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const inputPath = path.resolve(root, process.argv[2] || '文件目录.txt');
  const outputPath = path.resolve(root, process.argv[3] || 'src/data/resources.csv');
  const input = fs.readFileSync(inputPath, 'utf8');
  const existing = fs.existsSync(outputPath)
    ? parseResourcesCsv(fs.readFileSync(outputPath, 'utf8'))
    : [];
  const rows = buildResources(input, existing);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serializeResourcesCsv(rows), 'utf8');
  process.stdout.write(`已生成 ${rows.length} 个资源条目：${outputPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();

export { buildResources, collapseAlbumPath, inferFormat, inferResourceType, inferSeries, inferYear };
