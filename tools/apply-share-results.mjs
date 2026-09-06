import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePath, parseResourcesCsv, serializeResourcesCsv } from '../src/lib/resource-data.js';

/**
 * Apply bulk Baidu share results JSON onto src/data/resources.csv
 *
 * Usage:
 *   node tools/apply-share-results.mjs [results.json] [resources.csv]
 *
 * JSON item shape:
 *   { "文件名": "...rar", "分享链接": "https://pan.baidu.com/...", "提取码": "imas", "状态": "分享完成" }
 */

function basename(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .at(-1) || '';
}

function stripArchiveExt(name) {
  return String(name || '').replace(/\.(rar|zip|7z|iso)$/i, '');
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeShareUrl(url) {
  return String(url || '').trim();
}

function isShareDone(status) {
  return /分享完成|成功|完成|可用/.test(String(status || ''));
}

function indexRows(rows) {
  const byBase = new Map();
  const byName = new Map();

  for (const row of rows) {
    const base = basename(row.网盘路径);
    if (base) {
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(row);
    }
    if (row.名称) {
      if (!byName.has(row.名称)) byName.set(row.名称, []);
      byName.get(row.名称).push(row);
    }
  }

  return { byBase, byName };
}

function findRow(indexes, fileName) {
  const name = String(fileName || '').trim();
  if (!name) return { row: null, reason: 'empty-name' };

  let hits = indexes.byBase.get(name) || [];
  if (hits.length === 1) return { row: hits[0], reason: 'basename' };
  if (hits.length > 1) return { row: null, reason: 'ambiguous-basename', hits };

  const noExt = stripArchiveExt(name);
  hits = indexes.byName.get(noExt) || [];
  if (hits.length === 1) return { row: hits[0], reason: 'name' };
  if (hits.length > 1) return { row: null, reason: 'ambiguous-name', hits };

  hits = indexes.byName.get(name) || [];
  if (hits.length === 1) return { row: hits[0], reason: 'name-exact' };
  if (hits.length > 1) return { row: null, reason: 'ambiguous-name-exact', hits };

  return { row: null, reason: 'not-found' };
}

function applyShareResults(rows, shares, options = {}) {
  const indexes = indexRows(rows);
  const updateDate = options.date || today();
  const stats = {
    total: shares.length,
    updated: 0,
    skipped: 0,
    already: 0,
    unmatched: [],
    ambiguous: [],
    invalid: [],
  };

  for (const share of shares) {
    const fileName = share.文件名;
    const link = normalizeShareUrl(share.分享链接);
    const code = String(share.提取码 || '').trim();
    const done = isShareDone(share.状态);

    if (!done) {
      stats.skipped += 1;
      continue;
    }
    if (!/^https:\/\/pan\.baidu\.com\//i.test(link)) {
      stats.invalid.push({ fileName, link, reason: 'bad-url' });
      continue;
    }

    const found = findRow(indexes, fileName);
    if (!found.row) {
      if (String(found.reason).startsWith('ambiguous')) {
        stats.ambiguous.push({
          fileName,
          reason: found.reason,
          paths: (found.hits || []).map((row) => row.网盘路径),
        });
      } else {
        stats.unmatched.push(fileName);
      }
      continue;
    }

    const row = found.row;
    const sameLink = row.分享链接 === link;
    const sameCode = !code || row.提取码 === code;
    const alreadyAvailable = row.状态 === '可用' && sameLink && sameCode;

    if (alreadyAvailable) {
      stats.already += 1;
      continue;
    }

    row.分享链接 = link;
    if (code) row.提取码 = code;
    row.状态 = '可用';
    row.更新时间 = updateDate;
    if (!row.有效期) row.有效期 = '永久';
    // keep path normalized for consistency
    row.网盘路径 = normalizePath(row.网盘路径);
    stats.updated += 1;
  }

  return stats;
}

function run() {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const resultsPath = path.resolve(root, process.argv[2] || '批量分享结果.json');
  const csvPath = path.resolve(root, process.argv[3] || 'src/data/resources.csv');

  if (!fs.existsSync(resultsPath)) {
    throw new Error(`找不到分享结果：${resultsPath}`);
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`找不到资源表：${csvPath}`);
  }

  const shares = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  if (!Array.isArray(shares)) {
    throw new Error('分享结果必须是数组');
  }

  const rows = parseResourcesCsv(fs.readFileSync(csvPath, 'utf8'));
  const stats = applyShareResults(rows, shares);

  if (stats.unmatched.length || stats.ambiguous.length || stats.invalid.length) {
    process.stderr.write(
      `匹配问题：未匹配 ${stats.unmatched.length}，歧义 ${stats.ambiguous.length}，无效 ${stats.invalid.length}\n`,
    );
    if (stats.unmatched.length) {
      process.stderr.write(`未匹配示例：${stats.unmatched.slice(0, 10).join(' | ')}\n`);
    }
  }

  fs.writeFileSync(csvPath, serializeResourcesCsv(rows), 'utf8');

  process.stdout.write(
    [
      `分享结果：${resultsPath}`,
      `资源表：${csvPath}`,
      `总计 ${stats.total}，更新 ${stats.updated}，已是最新 ${stats.already}，跳过 ${stats.skipped}`,
      `未匹配 ${stats.unmatched.length}，歧义 ${stats.ambiguous.length}，无效链接 ${stats.invalid.length}`,
    ].join('\n') + '\n',
  );

  if (stats.unmatched.length || stats.ambiguous.length || stats.invalid.length) {
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    process.exit(1);
  }
}

export { applyShareResults, findRow, indexRows };
