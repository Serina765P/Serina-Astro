import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseResourcesCsv } from '../src/lib/resource-data.js';

function getShareQueue(rows, limit = 10) {
  const safeLimit = Math.min(10, Math.max(1, Number.parseInt(limit, 10) || 10));
  return rows
    .filter((row) => row.状态 === '待分享' && !row.分享链接)
    .sort((a, b) => Number(a.排序值 || 0) - Number(b.排序值 || 0))
    .slice(0, safeLimit);
}

function run() {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const csvPath = path.resolve(root, process.argv[2] || 'src/data/resources.csv');
  const limit = process.argv[3] || '10';
  const rows = parseResourcesCsv(fs.readFileSync(csvPath, 'utf8'));
  const queue = getShareQueue(rows, limit);

  process.stdout.write(`待分享队列（前 ${queue.length} 条，按排序值）：\n`);
  for (const row of queue) {
    process.stdout.write(`- [${row.排序值}] ${row.网盘路径}（${row.企划} / ${row.资源类型}）\n`);
  }
  if (queue.length === 0) process.stdout.write('（队列为空）\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();

export { getShareQueue };
