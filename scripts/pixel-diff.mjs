// 像素级定位：两张同尺寸全页 PNG 的差异「在哪儿」。
//
// 为什么需要它：shots.mjs 只回答「变了没有」（SHA-256），而阶段一的改动本就允许局部变化
// （例如暗色分类胶囊）。这时需要的是「差异是否只落在预期的那个元素上」——本脚本把差异行
// 聚成带（band）并打出 y/x 范围，一条带就是一处独立改动。实测 P0-3 的差异带是 6 处 72x20px
// 的矩形，正好对应 6 张卡片的分类胶囊。
//
// 用法：node scripts/pixel-diff.mjs <目录A> <目录B> <图名>
//   例：node scripts/pixel-diff.mjs baseline final category-tech.dark.png
//   目录相对于 .shots/；先跑 node scripts/shots.mjs <label> 生成对应目录。
//
// 依赖 sharp（astro 的图像管线自带，不必另装）。

import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [dirA = 'baseline', dirB = 'current', file] = process.argv.slice(2);
if (!file) {
  console.error('用法：node scripts/pixel-diff.mjs <目录A> <目录B> <图名>');
  process.exit(2);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const resolveShot = (dir) => path.join(ROOT, '.shots', dir, file);
const A = resolveShot(dirA);
const B = resolveShot(dirB);
for (const p of [A, B]) {
  if (!existsSync(p)) {
    console.error(`缺图：${p}`);
    process.exit(2);
  }
}

const load = async (p) => {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
};

const a = await load(A);
const b = await load(B);
if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
  console.error(`尺寸不同：${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}`);
  process.exit(1);
}
const { width: W, height: H, channels: C } = a.info;

const rows = [];
for (let y = 0; y < H; y++) {
  let count = 0;
  let minX = Infinity;
  let maxX = -1;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2]
    ) {
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (count) rows.push({ y, count, minX, maxX });
}

const total = rows.reduce((s, r) => s + r.count, 0);
const px = W * H;
console.log(`\n${file}   ${W}x${H}`);
console.log(`差异像素 ${total} / ${px} = ${((total / px) * 100).toFixed(4)}%`);

// 连续行聚成带：一条带 = 一处独立改动
const bands = [];
for (const r of rows) {
  const last = bands[bands.length - 1];
  if (last && r.y === last.y2 + 1) {
    last.y2 = r.y;
    last.count += r.count;
    last.minX = Math.min(last.minX, r.minX);
    last.maxX = Math.max(last.maxX, r.maxX);
  } else {
    bands.push({ y1: r.y, y2: r.y, count: r.count, minX: r.minX, maxX: r.maxX });
  }
}
console.log(`差异带 ${bands.length} 处：`);
for (const bd of bands) {
  console.log(
    `  y ${bd.y1}–${bd.y2} (高 ${bd.y2 - bd.y1 + 1}px)  x ${bd.minX}–${bd.maxX} (宽 ${bd.maxX - bd.minX + 1}px)  差异像素 ${bd.count}`,
  );
}
console.log(`\n对比：.shots/${dirA}/${file}  ←→  .shots/${dirB}/${file}`);
