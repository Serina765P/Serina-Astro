// 文章标题字体子集生成。
//
// 为什么需要它：文章 h1 / h2 用思源宋体（Noto Serif SC 700），但 Windows 默认没有
// 思源宋体，系统栈会回退到 SimSun，观感明显变差。这里在构建期把正文标题真正用到的
// 字形抽出来，生成一个只含这些字的 woff2（当前 12 篇文章约 363 字 / 70KB），
// 由 BaseLayout 以 /fonts/heading-serif.css 引入；生成失败时该文件不存在，
// --font-serif 继续回退系统衬线，不影响构建。
//
// 字符来源：src/content/posts/**/*.{md,mdx} 的 frontmatter title + 正文 `##` 标题，
// 以及 src/content/pages/*.md 的 `##` 标题（about 页的 h2 也走 .prose h2）。
// 取字集宁可多收几个标点，也不要漏字形：多收的字符只让子集大几百字节。
//
// 字体通过 Google Fonts 的 text= 子集接口获取（OFL-1.1，仅构建期使用，运行时自托管）；
// 字符集每 400 字一块，避免 URL 过长。字符集不变时复用 .cache/heading-serif/ 的缓存。

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');
const PAGES_DIR = path.join(ROOT, 'src', 'content', 'pages');
const CACHE_DIR = path.join(ROOT, '.cache', 'heading-serif');
const OUT_DIR = path.join(ROOT, 'public', 'fonts', 'heading-serif');
const OUT_CSS = path.join(ROOT, 'public', 'fonts', 'heading-serif.css');
const FAMILY = 'Noto Serif SC';
const CHUNK_SIZE = 400;
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700&display=swap';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const log = (message) => console.log(`[heading-font] ${message}`);

/** 递归收集目录下的 md / mdx 文件 */
async function collectMarkdown(dir, extensions) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectMarkdown(full, extensions)));
    else if (extensions.some((ext) => entry.name.endsWith(ext))) files.push(full);
  }
  return files;
}

/** 取 frontmatter 的 title；没有 frontmatter 时返回空串 */
function readTitle(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) return '';
  try {
    const data = parseYaml(match[1]);
    return typeof data?.title === 'string' ? data.title : '';
  } catch {
    return '';
  }
}

/** 去掉行内 Markdown / HTML 修饰，保留真正会渲染出来的字符 */
function cleanHeading(raw) {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .trim();
}

/** 去掉围栏代码块，避免把示例里的 ## / <h2> 当成标题 */
function stripFences(body) {
  const lines = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0].repeat(3);
      else if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fence === null) lines.push(line);
  }
  return lines.join('\n');
}

/** 收集正文 h2 文本：Markdown 的 `##` 与手写 HTML 的 <h2>（imas-hires 用后者做资源分组） */
function readH2s(source) {
  const body = stripFences(source.replace(/^---\r?\n[\s\S]*?\r?\n---/, ''));
  const headings = [];
  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) headings.push(cleanHeading(heading[1]));
  }
  for (const match of body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) {
    headings.push(cleanHeading(match[1]));
  }
  return headings;
}

async function collectCharacters() {
  const chars = new Set();
  const files = [
    ...(await collectMarkdown(POSTS_DIR, ['.md', '.mdx'])),
    ...(await collectMarkdown(PAGES_DIR, ['.md'])),
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const texts = [readTitle(source), ...readH2s(source)];
    for (const text of texts) {
      for (const ch of text) {
        if (!/\s/u.test(ch)) chars.add(ch);
      }
    }
  }
  return [...chars].sort();
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** 从 Google Fonts 的 CSS 响应里取第一个 woff2 地址 */
function woff2Url(css) {
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
  return urls.find((url) => url.includes('woff2') || url.includes('font?kit=')) ?? urls[0] ?? null;
}

async function fetchChunk(chunkChars) {
  const text = chunkChars.join('');
  const hash = createHash('sha1').update(text).digest('hex').slice(0, 12);
  const cacheFile = path.join(CACHE_DIR, `${hash}.woff2`);
  if (existsSync(cacheFile)) return readFile(cacheFile);

  const url = `${CSS_URL}&text=${encodeURIComponent(text)}`;
  const cssResponse = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!cssResponse.ok) throw new Error(`Google Fonts CSS 返回 ${cssResponse.status}`);
  const css = await cssResponse.text();
  const fontUrl = woff2Url(css);
  if (!fontUrl) throw new Error('Google Fonts CSS 里没有 woff2 地址');

  const fontResponse = await fetch(fontUrl, { signal: AbortSignal.timeout(30_000) });
  if (!fontResponse.ok) throw new Error(`字体文件返回 ${fontResponse.status}`);
  const buffer = Buffer.from(await fontResponse.arrayBuffer());
  if (buffer.length === 0) throw new Error('字体文件为空');

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile, buffer);
  return buffer;
}

function unicodeRange(chars) {
  return chars
    .map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(', ');
}

async function main() {
  const chars = await collectCharacters();
  if (chars.length === 0) throw new Error('没有从文章中收集到标题字符');
  const groups = chunk(chars, CHUNK_SIZE);
  log(`收集到 ${chars.length} 个字形，分 ${groups.length} 块`);

  const outputs = [];
  for (const [index, group] of groups.entries()) {
    const buffer = await fetchChunk(group);
    outputs.push({ index, group, buffer });
  }

  // 全部成功后才动产物目录：中途失败时保留上一版，不至于把可用结果删掉
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const rules = [];
  let total = 0;
  for (const { index, group, buffer } of outputs) {
    const name = `${index}.woff2`;
    await writeFile(path.join(OUT_DIR, name), buffer);
    total += buffer.length;
    rules.push(
      [
        '@font-face {',
        `  font-family: '${FAMILY}';`,
        `  src: url('./heading-serif/${name}') format('woff2');`,
        '  font-weight: 700;',
        '  font-style: normal;',
        '  font-display: swap;',
        `  unicode-range: ${unicodeRange(group)};`,
        '}',
      ].join('\n'),
    );
  }

  await writeFile(
    OUT_CSS,
    [
      '/* 自动生成，请勿手改：npm run heading:font（predev / prebuild 会先跑一次）。',
      '   只包含文章 h1 / h2 用到的字形；改标题后重新构建即可。 */',
      ...rules,
      '',
    ].join('\n'),
  );

  log(
    `共 ${outputs.length} 个分片，合计 ${(total / 1024).toFixed(1)} KB → public/fonts/heading-serif.css`,
  );
}

try {
  await main();
} catch (error) {
  // 不中断构建：BaseLayout 检测不到 heading-serif.css 时不输出 link，标题回退系统衬线
  console.warn(`[heading-font] 生成失败，回退系统衬线：${error.message}`);
}
