// 首页标题字体子集生成。
//
// 为什么需要它：--font-hero 用的 ZeoSeven item 2101 是一份按 unicode-range 切成
// 385 片的 CSS（result.css 202KB）。首页标题「芹菜P的部落阁」+ 竖排「せりな」
// 共 10 个字，实测会触发 10 个 woff2 分片、合计 325KB —— 首屏为一行字付这个代价。
//
// 这个脚本把流程反过来：先读文案 → 算出真正需要的码点 → 找出覆盖它们的分片 →
// 逐片再子集化成只含那几个字的小 woff2。产物落在 public/fonts/（不进版本库）。
//
// 文案唯一来源是 src/data/site-info.json 的 heroTitle / heroMark（工作台可改写），
// 所以「改字 → 重新构建」即可，不需要动代码，也不会漏掉新字符的分片。
//
// 失败策略：网络不可用或分片解析失败时只告警、不中断构建；BaseLayout 检测不到
// 生成产物时会自动回退到 CDN 上的完整 CSS（旧行为），页面不会因此变成系统衬线。

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import subsetFont from 'subset-font';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE_INFO = path.join(ROOT, 'src', 'data', 'site-info.json');
const CSS_URL = 'https://fontsapi.zeoseven.com/2101/main/result.css';
const CACHE_DIR = path.join(ROOT, '.cache', 'hero-mincho');
const OUT_DIR = path.join(ROOT, 'public', 'fonts', 'hero-mincho');
const OUT_CSS = path.join(ROOT, 'public', 'fonts', 'hero-mincho.css');
const FAMILY = 'ZhaohuaMinA Bold';

const log = (message) => console.log(`[hero-font] ${message}`);

/** 把 `U+4E00-4E0F` / `U+30??` 这类 token 解析成 [start, end] */
function parseRange(token) {
  const match = /^U\+([0-9A-Fa-f?]{1,6})(?:-([0-9A-Fa-f?]{1,6}))?$/.exec(token.trim());
  if (!match) return null;
  const toCode = (raw) => Number.parseInt(raw.replace(/\?/g, '0'), 16);
  const toEnd = (raw) => Number.parseInt(raw.replace(/\?/g, 'F'), 16);
  const start = toCode(match[1]);
  const end = match[2] ? toEnd(match[2]) : toEnd(match[1]);
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

/** result.css 里每条 @font-face 都是「一个分片 + 它覆盖的码点区间」 */
function parseFaces(css) {
  const faces = [];
  for (const block of css.matchAll(/@font-face\{[^}]*\}/g)) {
    const text = block[0];
    const url = /url\("?\.\/([^")]+)"?\)/.exec(text)?.[1];
    const rangeText = /unicode-range:([^;]+);/.exec(text)?.[1];
    if (!url || !rangeText) continue;
    const ranges = rangeText.split(',').map(parseRange).filter(Boolean);
    if (ranges.length === 0) continue;
    faces.push({ url, ranges });
  }
  return faces;
}

function faceFor(faces, code) {
  return faces.find((face) => face.ranges.some((r) => code >= r.start && code <= r.end));
}

async function readIfExists(file) {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

async function cachedFetch(url, cacheFile) {
  const cached = await readIfExists(cacheFile);
  if (cached) return cached;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} 返回 ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(cacheFile, buffer);
  return buffer;
}

async function main() {
  const info = JSON.parse(await readFile(SITE_INFO, 'utf8'));
  const texts = [info.heroTitle, info.heroMark].filter((v) => typeof v === 'string' && v.length);
  if (texts.length === 0) throw new Error('site-info.json 缺少 heroTitle / heroMark');

  // 空白字符不需要字体，交给系统衬线即可
  const codes = [
    ...new Set(
      [...texts.join('')]
        .map((ch) => ch.codePointAt(0))
        .filter((code) => !/^\s$/u.test(String.fromCodePoint(code))),
    ),
  ].sort((a, b) => a - b);
  log(`需要 ${codes.length} 个字形：${codes.map((c) => String.fromCodePoint(c)).join('')}`);

  await mkdir(CACHE_DIR, { recursive: true });
  const cssCache = path.join(CACHE_DIR, 'result.css');
  let faces = parseFaces((await readIfExists(cssCache))?.toString('utf8') ?? '');

  // 缓存里能覆盖全部码点就不必回源；否则拉一次最新 CSS（字体更新 / 文案新增生僻字）
  if (!codes.every((code) => faceFor(faces, code))) {
    const css = await (await fetch(CSS_URL, { signal: AbortSignal.timeout(30_000) })).text();
    await writeFile(cssCache, css);
    faces = parseFaces(css);
  }

  // 按分片归组：同一个分片里的字合并成一次子集化，产物数量 = 用到的分片数
  const groups = new Map();
  const missing = [];
  for (const code of codes) {
    const face = faceFor(faces, code);
    if (!face) {
      missing.push(String.fromCodePoint(code));
      continue;
    }
    const group = groups.get(face.url) ?? { chars: [], ranges: [] };
    group.chars.push(String.fromCodePoint(code));
    group.ranges.push(`U+${code.toString(16).toUpperCase()}`);
    groups.set(face.url, group);
  }
  if (missing.length) log(`警告：${missing.join('')} 不在该字体的码表内，将回退系统衬线`);

  const outputs = [];
  for (const [url, group] of groups) {
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
    const shard = await cachedFetch(
      new URL(url, CSS_URL).href,
      path.join(CACHE_DIR, `${hash}.woff2`),
    );
    const subset = await subsetFont(shard, group.chars.join(''), { targetFormat: 'woff2' });
    outputs.push({ subset, ranges: group.ranges.join(','), chars: group.chars.join('') });
  }

  // 全部成功后才动产物目录：中途失败时保留上一版，不至于把可用结果删掉
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const rules = [];
  let total = 0;
  for (const [index, output] of outputs.entries()) {
    const name = `${index}.woff2`;
    await writeFile(path.join(OUT_DIR, name), output.subset);
    total += output.subset.length;
    rules.push(
      [
        '@font-face {',
        `  font-family: '${FAMILY}';`,
        `  src: url('./hero-mincho/${name}') format('woff2');`,
        '  font-weight: 700;',
        '  font-style: normal;',
        '  font-display: swap;',
        `  unicode-range: ${output.ranges};`,
        '}',
      ].join('\n'),
    );
    log(`  ${name}  ${output.subset.length} B  ${output.chars}`);
  }

  await writeFile(
    OUT_CSS,
    [
      '/* 自动生成，请勿手改：npm run hero:font（predev / prebuild 会先跑一次）。',
      '   只包含首页标题与竖排标记用到的字形，改文案后重新构建即可。 */',
      ...rules,
      '',
    ].join('\n'),
  );

  log(
    `共 ${outputs.length} 个分片，合计 ${(total / 1024).toFixed(1)} KB → public/fonts/hero-mincho.css`,
  );
}

try {
  await main();
} catch (error) {
  // 不中断构建：BaseLayout 检测不到 hero-mincho.css 时会回退到 CDN 完整 CSS
  console.warn(`[hero-font] 生成失败，回退 CDN 字体：${error.message}`);
}
