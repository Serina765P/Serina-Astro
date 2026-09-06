import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { createHash } from 'node:crypto';

/**
 * @typedef {'id'|'企划'|'资源类型'|'系列'|'名称'|'别名'|'年份'|'格式'|'大小'|'网盘路径'|'分享链接'|'提取码'|'有效期'|'状态'|'更新时间'|'排序值'} ResourceField
 * @typedef {Record<ResourceField, string>} ResourceRecord
 */

export const RESOURCE_FIELDS = [
  'id',
  '企划',
  '资源类型',
  '系列',
  '名称',
  '别名',
  '年份',
  '格式',
  '大小',
  '网盘路径',
  '分享链接',
  '提取码',
  '有效期',
  '状态',
  '更新时间',
  '排序值',
];

export const RESOURCE_STATUSES = ['可用', '待分享', '更新中', '已失效'];

/** @param {string | undefined} value */
export function normalizePath(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
  if (!normalized) return '';
  return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
}

/** @param {string} path */
export function createResourceId(path) {
  return `resource-${createHash('sha1').update(normalizePath(path)).digest('hex').slice(0, 12)}`;
}

/** @param {string} text @returns {ResourceRecord[]} */
export function parseResourcesCsv(text) {
  if (!String(text ?? '').trim()) return [];

  const rows = /** @type {ResourceRecord[]} */ (
    parse(text, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    })
  );

  validateResources(rows);
  return rows;
}

/** @param {ResourceRecord[]} rows @returns {string} */
export function serializeResourcesCsv(rows) {
  validateResources(rows);
  return stringify(rows, {
    bom: true,
    header: true,
    columns: RESOURCE_FIELDS,
    record_delimiter: 'windows',
  });
}

/** @param {ResourceRecord[]} rows */
export function validateResources(rows) {
  const ids = new Set();
  const paths = new Set();

  rows.forEach((row, index) => {
    const line = index + 2;
    const missing = RESOURCE_FIELDS.filter((field) => !(field in row));
    if (missing.length) {
      throw new Error(`resources.csv 第 ${line} 行缺少字段：${missing.join('、')}`);
    }
    if (!row.id) throw new Error(`resources.csv 第 ${line} 行缺少 id`);
    if (!RESOURCE_STATUSES.includes(row.状态)) {
      throw new Error(`resources.csv 第 ${line} 行状态无效：${row.状态}`);
    }
    if (!row.网盘路径) throw new Error(`resources.csv 第 ${line} 行缺少网盘路径`);
    if (row.状态 === '可用' && !/^https:\/\/pan\.baidu\.com\//i.test(row.分享链接)) {
      throw new Error(`resources.csv 第 ${line} 行标记为可用，但分享链接不是百度网盘地址`);
    }
    if (ids.has(row.id)) throw new Error(`resources.csv 存在重复 id：${row.id}`);

    const normalizedPath = normalizePath(row.网盘路径);
    if (paths.has(normalizedPath)) {
      throw new Error(`resources.csv 存在重复网盘路径：${normalizedPath}`);
    }
    ids.add(row.id);
    paths.add(normalizedPath);
  });
}
