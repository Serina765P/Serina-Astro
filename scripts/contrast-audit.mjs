// 对比度审计：核算主题 token 的「文字 × 背景」配对是否达到 WCAG AA。
// 用法：node scripts/contrast-audit.mjs   （exit 1 = 有不达标项，或 global.css 缺 token）
//
// 色值不在这里维护第二份 —— 直接从 src/styles/global.css 读 :root / :root.dark / @theme，
// 并解析 var() 别名链与 color-mix()。改了 CSS 忘记同步审计时会直接报错退出，
// 而不是拿着过期色值给出绿灯。阈值：正文 4.5，大字（≥24px 或 ≥18.66px 粗体）3.0。

import { readFileSync } from 'node:fs';
import path from 'node:path';

// 相对脚本自身定位而非 cwd：npm run contrast 与 CI 在任何工作目录下结果一致
const CSS_FILE = path.join(import.meta.dirname, '..', 'src', 'styles', 'global.css');

/* ── 取值层：解析 global.css ── */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 把声明块拆成 `--x: value` 对（值内换行折叠为单空格） */
function parseDeclarations(body) {
  const out = {};
  for (const chunk of body.split(';')) {
    const m = /^\s*(--[A-Za-z0-9-]+)\s*:\s*([\s\S]*?)\s*$/.exec(chunk);
    if (m) out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  }
  return out;
}

/**
 * 按源码顺序收集匹配选择器的自定义属性，后者覆盖前者。
 * 用括号配对而非正则贪婪匹配 —— `@layer base` 里嵌着 :root，必须精确切块。
 */
function collectDeclarations(css, accept) {
  const declarations = {};
  const re = /(@theme\s+inline|@theme|:root\.dark|:root)\s*\{/g;
  for (const match of css.matchAll(re)) {
    if (!accept(match[1])) continue;
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    Object.assign(declarations, parseDeclarations(css.slice(start, i - 1)));
  }
  return declarations;
}

const css = stripComments(readFileSync(CSS_FILE, 'utf8'));

// @theme / @theme inline 是模式无关的基准；:root 是亮色；:root.dark 只写差异，
// 未在暗色重定义的 token（如静态 accent 阶）继承亮色值 —— 与浏览器层叠行为一致
const shared = collectDeclarations(css, (s) => s.startsWith('@theme'));
const lightOnly = collectDeclarations(css, (s) => s === ':root');
const darkOnly = collectDeclarations(css, (s) => s === ':root.dark');

const vars = {
  light: { ...shared, ...lightOnly },
  dark: { ...shared, ...lightOnly, ...darkOnly },
};

/* ── 值解析：var() / color-mix() / 字面色值 → #rrggbb ── */

/** 按顶层逗号切分，忽略括号内的逗号（color-mix 的参数本身可能带函数） */
function splitTopLevel(input) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const normalizeHex = (hex) => {
  let s = hex.slice(1).toLowerCase();
  if (s.length === 3)
    s = s
      .split('')
      .map((c) => c + c)
      .join('');
  return `#${s}`;
};

const rgbToHex = ([r, g, b]) =>
  '#' +
  [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** 递归解析一个颜色值；token 缺失或循环引用一律抛错，绝不静默返回错值 */
function resolveColor(raw, table, stack = []) {
  const value = raw.trim();

  const varMatch = /^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(value);
  if (varMatch) {
    const [, name, fallback] = varMatch;
    if (stack.includes(name)) throw new Error(`token 循环引用：${[...stack, name].join(' → ')}`);
    const next = table[name];
    if (next === undefined) {
      if (fallback === undefined) throw new Error(`global.css 缺少 token ${name}`);
      return resolveColor(fallback, table, stack);
    }
    return resolveColor(next, table, [...stack, name]);
  }

  const mixMatch = /^color-mix\(\s*in\s+srgb\s*,\s*([\s\S]+)\)$/i.exec(value);
  if (mixMatch) {
    // 上面的正则已经把色彩空间 `in srgb,` 吃掉了，捕获组里就是纯颜色列表（不要再去 slice）
    const colorArgs = splitTopLevel(mixMatch[1]);
    if (colorArgs.length !== 2) throw new Error(`color-mix 参数不是 2 个颜色：${value}`);
    const parsed = colorArgs.map((arg) => {
      const pct = /^([\s\S]*?)\s+([\d.]+)%$/.exec(arg);
      return pct ? { color: pct[1], pct: Number(pct[2]) } : { color: arg, pct: null };
    });
    const shareA = parsed[0].pct ?? (parsed[1].pct === null ? 50 : 100 - parsed[1].pct);
    const a = resolveColor(parsed[0].color, table, stack);
    const b = resolveColor(parsed[1].color, table, stack);
    return mix(a, b, shareA);
  }

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return normalizeHex(value);

  const rgbMatch = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/i.exec(value);
  if (rgbMatch) {
    const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
    if (alpha < 1) throw new Error(`半透明色需给定背景才能核算对比度：${value}`);
    return rgbToHex([Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])]);
  }

  throw new Error(`无法解析的颜色值：${value}`);
}

/* ── 计算层（沿用原算法，保证结果口径不变） ── */

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
  return rgbToHex(out);
};

/* ── 语义名 → token 名。配对表只认这里，改 global.css 不需要动本文件 ── */

const TOKENS = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  ink: '--ink',
  body: '--body',
  sub: '--sub',
  onWash: '--on-wash',
  pinkDeep: '--wash-pink-deep',
  clayDeep: '--wash-clay-deep',
  sageDeep: '--wash-sage-deep',
  roseDeep: '--wash-rose-deep',
  mistDeep: '--wash-mist-deep',
  codeBg: '--code-bg',
  codeInk: '--code-ink',
  chipBgHover: '--chip-bg-hover',
  chipFgHover: '--chip-fg-hover',
  catOn: '--cat-on',
  catFillPink: '--cat-fill-pink',
  catFillMist: '--cat-fill-mist',
  catFillSage: '--cat-fill-sage',
  catFillSand: '--cat-fill-sand',
  catFillClay: '--cat-fill-clay',
  catFillRose: '--cat-fill-rose',
  washPink: '--wash-pink',
  washMist: '--wash-mist',
  washSage: '--wash-sage',
  washSand: '--wash-sand',
  washClay: '--wash-clay',
  washRose: '--wash-rose',
};

const tables = {};
try {
  for (const mode of ['light', 'dark']) {
    tables[mode] = Object.fromEntries(
      Object.entries(TOKENS).map(([key, name]) => [key, resolveColor(`var(${name})`, vars[mode])]),
    );
  }
} catch (err) {
  // CLI 边界：缺 token / 无法解析就明确退出，不打印半截结果让人误以为审计通过
  console.error(`审计无法进行：${err.message}`);
  process.exit(1);
}

/* ── 审计 ── */

let fails = 0;
function check(mode, name, fg, bg, min) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fails++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${mode}  ${name.padEnd(38)} ${r.toFixed(2)}  (需 ≥${min})  ${fg} on ${bg}`,
  );
}

for (const [mode, T] of Object.entries(tables)) {
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
  // bento 小方块 .ico：on-wash 压每种 wash 底（分类胶囊已改走 cat-on / cat-fill-*，见下）
  for (const w of ['washPink', 'washMist', 'washSage', 'washSand', 'washClay', 'washRose']) {
    check(mode, `on-wash / ${w}（bento 图标底）`, T.onWash, T[w], 4.5);
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
  // hover chip 配对（亮色 = accent-100/700；暗色 = wash 揉进 surface / ink）——
  // 取代旧的静态 accent-100/accent-700 直配（S4 后已无消费点）
  check(mode, 'chip-fg-hover / chip-bg-hover（hover chip）', T.chipFgHover, T.chipBgHover, 4.5);
  // 分类胶囊：cat-on 压每种 wash 底（亮色 = wash 原色；暗色 = wash 揉进 surface）
  for (const w of ['catFillPink', 'catFillMist', 'catFillSage', 'catFillSand', 'catFillClay', 'catFillRose']) {
    check(mode, `cat-on / ${w}（分类胶囊）`, T.catOn, T[w], 4.5);
  }
  // blockquote 边框为非文字 UI，3:1 即可
  check(mode, 'mist-deep / surface（blockquote 边）', T.mistDeep, T.surface, 3.0);
}

console.log(fails === 0 ? '\n全部通过 ✅' : `\n${fails} 项不达标 ❌`);
process.exit(fails === 0 ? 0 : 1);
