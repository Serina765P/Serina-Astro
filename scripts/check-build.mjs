// 构建产物断言：本环境的 astro build 会偶发静默丢弃 CSS 产物 —— 退出码 0、页面齐全，
// 但 dist/_astro 里没有 .css，或 HTML 干脆不引用 CSS（资产没产出时 <link> 跟着消失）。
// 两种症状同源，而后者会让 CI 在"构建成功"之后发布一个无样式站点。
// 所以在 pagefind 之前做硬断言：没有 CSS 就直接失败，不许发布。
//
// 用法：node scripts/check-build.mjs（已接入 npm run build）
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = await walk(dist).catch(() => null);
if (!files) {
  console.error('check-build FAIL：dist 不存在（先跑 astro build）');
  process.exit(1);
}

const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const cssFiles = files.filter((f) => f.endsWith('.css'));
if (cssFiles.length === 0) {
  console.error('check-build FAIL：dist 没有任何 CSS 产物 —— 构建静默丢包，禁止发布');
  process.exit(1);
}
const present = new Set(files.map(rel));

const htmlFiles = files.filter((f) => f.endsWith('.html'));
let refs = 0;
const missing = [];
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  for (const m of html.matchAll(/["'](\/_astro\/[^"']+\.css)["']/g)) {
    refs += 1;
    if (!present.has(`dist${m[1]}`)) missing.push(`${rel(file)} → ${m[1]}`);
  }
}

if (refs === 0 || missing.length > 0) {
  console.error(
    refs === 0
      ? 'check-build FAIL：HTML 未引用任何 CSS（资产缺失时 Astro 会省略 <link>）'
      : `check-build FAIL：引用了不存在的 CSS 产物\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}

console.log(
  `check-build OK：${cssFiles.length} 个 CSS 产物，${htmlFiles.length} 个页面共 ${refs} 处引用全部存在`,
);
