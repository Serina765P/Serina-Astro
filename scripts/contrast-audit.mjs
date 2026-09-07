// 对比度审计：核算主题 token 的「文字 × 背景」配对是否达到 WCAG AA。
// 用法：node scripts/contrast-audit.mjs   （exit 1 = 有不达标项）
// 改动 global.css 色值后必须重跑；阈值：正文 4.5，大字（≥24px 或 ≥18.66px 粗体）3.0。

const LIGHT = {
  bg: '#edeae4',
  surface: '#faf8f4',
  surface2: '#f1ede5',
  ink: '#45403a',
  body: '#5c564d',
  sub: '#6f675b',
  onWash: '#2a2724',
  pinkDeep: '#835a58',
  clayDeep: '#7f574e',
  sageDeep: '#55675a',
  roseDeep: '#8f4a42',
  mistDeep: '#7f8a9b',
  codeBg: '#4a443c',
  codeInk: '#f1ebe1',
  accent100: '#f3e7e7',
  accent700: '#835a58',
  washPink: '#cbb3b5',
  washMist: '#a9b4c0',
  washSage: '#afc0b1',
  washSand: '#d6cbb8',
  washClay: '#c2a8a0',
  washRose: '#ce918a',
};

const DARK = {
  bg: '#262320',
  surface: '#302c27',
  surface2: '#3a352f',
  ink: '#eae4d9',
  body: '#cdc5b8',
  sub: '#a89f90',
  onWash: '#1e1b18',
  pinkDeep: '#c7a6a4',
  clayDeep: '#c8aba1',
  sageDeep: '#afc0b2',
  roseDeep: '#c49b94',
  mistDeep: '#a9b6c4',
  codeBg: '#1e1b18',
  codeInk: '#d8cfc0',
  // accent 阶为静态 token，不随 .dark 翻转（hover chip 在暗色下同为亮粉底）
  accent100: '#f3e7e7',
  accent700: '#835a58',
  washPink: '#b09395',
  washMist: '#93a0b0',
  washSage: '#9aab9e',
  washSand: '#b8ab94',
  washClay: '#b3968c',
  washRose: '#a97f79',
};

const hex2rgb = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const lum = (hex) => {
  const [r, g, b] = hex2rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};
// color-mix(in srgb, A p%, B)：gamma 空间逐通道线性插值
const mix = (a, b, pct) => {
  const ca = hex2rgb(a);
  const cb = hex2rgb(b);
  const out = ca.map((v, i) => Math.round(cb[i] * (1 - pct / 100) + v * (pct / 100)));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
};

let fails = 0;
function check(mode, name, fg, bg, min) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fails++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${mode}  ${name.padEnd(38)} ${r.toFixed(2)}  (需 ≥${min})  ${fg} on ${bg}`,
  );
}

for (const [mode, T] of Object.entries({ light: LIGHT, dark: DARK })) {
  // 基础文字
  check(mode, 'body / bg', T.body, T.bg, 4.5);
  check(mode, 'body / surface', T.body, T.surface, 4.5);
  check(mode, 'body / surface-2', T.body, T.surface2, 4.5);
  check(mode, 'ink / bg', T.ink, T.bg, 4.5);
  check(mode, 'ink / surface', T.ink, T.surface, 4.5);
  check(mode, 'sub / bg（meta/TOC/页脚）', T.sub, T.bg, 4.5);
  check(mode, 'sub / surface', T.sub, T.surface, 4.5);
  check(mode, 'sub / surface-2（标签 chip）', T.sub, T.surface2, 4.5);
  // 代码块
  check(mode, 'code-ink / code-bg', T.codeInk, T.codeBg, 4.5);
  // 分类胶囊 / .ico：on-wash 压每种 wash 底
  for (const w of ['washPink', 'washMist', 'washSage', 'washSand', 'washClay', 'washRose']) {
    check(mode, `on-wash / ${w}（分类胶囊）`, T.onWash, T[w], 4.5);
  }
  // deep 色作文字
  check(mode, 'pink-deep / bg（链接/强调文字）', T.pinkDeep, T.bg, 4.5);
  check(mode, 'pink-deep / surface（prose 链接）', T.pinkDeep, T.surface, 4.5);
  check(mode, 'pink-deep / surface-2', T.pinkDeep, T.surface2, 4.5);
  check(mode, 'clay-deep / surface-2（行内 code）', T.clayDeep, T.surface2, 4.5);
  // callout 前缀文字：deep 色压 color-mix(wash 12%, surface)（淡晕底，色相由 border-l 承担）
  check(mode, 'clay-deep / warning 底', T.clayDeep, mix(T.washClay, T.surface, 12), 4.5);
  check(mode, 'sage-deep / success 底', T.sageDeep, mix(T.washSage, T.surface, 12), 4.5);
  check(mode, 'rose-deep / danger 底', T.roseDeep, mix(T.washRose, T.surface, 12), 4.5);
  check(mode, 'rose-deep / bg（hover 文字）', T.roseDeep, T.bg, 4.5);
  check(mode, 'rose-deep / surface', T.roseDeep, T.surface, 4.5);
  // hover chip 配对（hover:bg-accent-100 + hover:text-accent-700）
  check(mode, 'accent-700 / accent-100（hover chip）', T.accent700, T.accent100, 4.5);
  // blockquote 边框为非文字 UI，3:1 即可
  check(mode, 'mist-deep / surface（blockquote 边）', T.mistDeep, T.surface, 3.0);
}

console.log(fails === 0 ? '\n全部通过 ✅' : `\n${fails} 项不达标 ❌`);
process.exit(fails === 0 ? 0 : 1);
