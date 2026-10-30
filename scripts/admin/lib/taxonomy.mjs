import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { SLUG_PATTERN, WASH_VALUES } from '../../../src/lib/taxonomy.ts';
import { writeFileAtomic } from './atomic-write.mjs';
import { HttpError } from './http.mjs';

export const TAXONOMY_PATH = path.join('src', 'data', 'taxonomy.json');
export const POSTS_DIR = path.join('src', 'content', 'posts');

const MAP_FIELDS = ['categorySlugs', 'tagSlugs', 'categoryColors'];
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;
const POST_FILE_PATTERN = /\.(?:md|mdx)$/u;
const MAX_NAME_LENGTH = 100;
const MAX_SLUG_LENGTH = 64;
const MAX_ENTRIES = 500;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireName(value, label) {
  if (!value.trim()) throw new HttpError(400, `${label}名不能为空`);
  if (value.length > MAX_NAME_LENGTH) throw new HttpError(400, `${label}名过长`);
  return value;
}

function requireSlug(value, label) {
  if (typeof value !== 'string') throw new HttpError(400, `${label}的 slug 必须是字符串`);
  const slug = value.trim();
  if (!slug) throw new HttpError(400, `${label}的 slug 不能为空`);
  if (slug.length > MAX_SLUG_LENGTH) throw new HttpError(400, `${label}的 slug 过长`);
  if (!SLUG_PATTERN.test(slug)) {
    throw new HttpError(400, `${label}的 slug 只能使用小写字母、数字与连字符，例如 comic-book`);
  }
  return slug;
}

function normalizeSlugMap(value, label) {
  if (!isPlainObject(value)) throw new HttpError(400, `${label}映射必须是 JSON 对象`);
  const entries = Object.entries(value);
  if (entries.length > MAX_ENTRIES) throw new HttpError(400, `${label}映射最多 ${MAX_ENTRIES} 项`);

  const normalized = [];
  const seenNames = new Set();
  for (const [rawName, rawSlug] of entries) {
    const name = requireName(rawName, label);
    if (seenNames.has(name)) throw new HttpError(400, `${label}名重复：${name}`);
    seenNames.add(name);
    normalized.push([name, requireSlug(rawSlug, `${label}「${name}」`)]);
  }
  return Object.fromEntries(normalized);
}

function normalizeColorMap(value) {
  if (!isPlainObject(value)) throw new HttpError(400, '分类颜色映射必须是 JSON 对象');
  const entries = Object.entries(value);
  if (entries.length > MAX_ENTRIES) throw new HttpError(400, `分类颜色最多 ${MAX_ENTRIES} 项`);

  const normalized = [];
  const seenNames = new Set();
  for (const [rawName, rawColor] of entries) {
    const name = requireName(rawName, '分类');
    if (seenNames.has(name)) throw new HttpError(400, `分类名重复：${name}`);
    seenNames.add(name);
    if (typeof rawColor !== 'string') {
      throw new HttpError(400, `分类「${name}」的颜色必须是字符串`);
    }
    const color = rawColor.trim();
    if (!WASH_VALUES.includes(color)) {
      throw new HttpError(400, `分类「${name}」的颜色必须是莫兰迪 wash 变量`);
    }
    normalized.push([name, color]);
  }
  return Object.fromEntries(normalized);
}

function assertUniqueSlugs(map, label) {
  const seen = new Map();
  for (const [name, slug] of Object.entries(map)) {
    if (seen.has(slug)) {
      throw new HttpError(
        400,
        `${label}「${name}」与「${seen.get(slug)}」使用了相同的 slug：${slug}`,
      );
    }
    seen.set(slug, name);
  }
}

function assertColorsBelongToCategories(taxonomy) {
  for (const name of Object.keys(taxonomy.categoryColors)) {
    if (!Object.hasOwn(taxonomy.categorySlugs, name)) {
      throw new HttpError(400, `分类颜色「${name}」没有对应的分类映射`);
    }
  }
}

/** 新加的分类必须有配色；历史上缺色的分类保留原样，面板保存时会补成默认色。 */
function assertNewCategoriesHaveColors(current, next) {
  for (const name of Object.keys(next.categorySlugs)) {
    if (Object.hasOwn(current.categorySlugs, name)) continue;
    if (!Object.hasOwn(next.categoryColors, name)) {
      throw new HttpError(400, `分类「${name}」缺少莫兰迪配色`);
    }
  }
}

/** 结构校验与规范化；读取磁盘与提交补丁共用同一套约束。 */
export function normalizeTaxonomy(input) {
  if (!isPlainObject(input)) throw new HttpError(400, 'taxonomy 必须是 JSON 对象');
  const unknown = Object.keys(input).filter((key) => !MAP_FIELDS.includes(key));
  if (unknown.length > 0) {
    throw new HttpError(400, `taxonomy 包含未知字段：${unknown.join(', ')}`);
  }

  const taxonomy = {
    categorySlugs: normalizeSlugMap(input.categorySlugs, '分类'),
    tagSlugs: normalizeSlugMap(input.tagSlugs, '标签'),
    categoryColors: normalizeColorMap(input.categoryColors),
  };
  assertUniqueSlugs(taxonomy.categorySlugs, '分类');
  assertUniqueSlugs(taxonomy.tagSlugs, '标签');
  assertColorsBelongToCategories(taxonomy);
  return taxonomy;
}

export async function readTaxonomy(root) {
  let raw;
  try {
    raw = await readFile(path.join(root, TAXONOMY_PATH), 'utf8');
  } catch (error) {
    throw new HttpError(500, '读取 taxonomy.json 失败', { cause: error });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new HttpError(500, 'taxonomy.json 不是合法 JSON', { cause: error });
  }
  try {
    return normalizeTaxonomy(data);
  } catch (error) {
    throw new HttpError(500, `taxonomy.json 结构无效：${error.message}`, { cause: error });
  }
}

export async function writeTaxonomy(root, taxonomy) {
  await writeFileAtomic(path.join(root, TAXONOMY_PATH), `${JSON.stringify(taxonomy, null, 2)}\n`);
}

/**
 * 补丁语义：出现的映射整体替换，未出现的映射保持磁盘当前值。
 * 颜色必须落在合并后的分类集合里，删除分类时要在同一补丁里删除颜色。
 */
export function mergeTaxonomyPatch(current, patch) {
  if (!isPlainObject(patch)) throw new HttpError(400, '请求体必须是 JSON 对象');
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new HttpError(400, '没有可保存的映射');
  const unknown = keys.filter((key) => !MAP_FIELDS.includes(key));
  if (unknown.length > 0) {
    throw new HttpError(400, `不支持修改字段：${unknown.join(', ')}`);
  }
  const next = normalizeTaxonomy({ ...current, ...patch });
  assertNewCategoriesHaveColors(current, next);
  return next;
}

async function listPostFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new HttpError(500, '读取文章目录失败', { cause: error });
  }

  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPostFiles(filePath)));
    } else if (entry.isFile() && POST_FILE_PATTERN.test(entry.name)) {
      files.push(filePath);
    }
  }
  return files;
}

function frontmatterNames(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((name) => typeof name === 'string' && name.length > 0);
}

function increment(registry, names) {
  for (const name of names) registry.set(name, (registry.get(name) ?? 0) + 1);
}

function toEntries(registry) {
  return [...registry].map(([name, count]) => ({ name, count }));
}

/**
 * 递归扫描全部文章 frontmatter，按文件路径与数组顺序首次出现的次序统计。
 * 正文里出现的 `tags:` 不参与；没有 frontmatter 的文件直接跳过。
 */
export async function collectUsedTaxonomies(root) {
  const files = await listPostFiles(path.join(root, POSTS_DIR));
  const categories = new Map();
  const tags = new Map();

  for (const filePath of files) {
    let raw;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      throw new HttpError(500, '读取文章失败', { cause: error });
    }
    const match = FRONTMATTER_PATTERN.exec(raw.replace(/^\uFEFF/u, ''));
    if (!match) continue;

    let data;
    try {
      data = parseYaml(match[1]);
    } catch (error) {
      const relative = path.relative(root, filePath).split(path.sep).join('/');
      throw new HttpError(500, `解析文章 frontmatter 失败：${relative}`, { cause: error });
    }
    if (!isPlainObject(data)) continue;
    increment(categories, new Set(frontmatterNames(data.categories)));
    increment(tags, new Set(frontmatterNames(data.tags)));
  }

  return { categories: toEntries(categories), tags: toEntries(tags) };
}

export function buildTaxonomyState(taxonomy, used) {
  const unmapped = (entries, map) => entries.filter((entry) => !Object.hasOwn(map, entry.name));
  return {
    taxonomy,
    used,
    unmapped: {
      categories: unmapped(used.categories, taxonomy.categorySlugs),
      tags: unmapped(used.tags, taxonomy.tagSlugs),
    },
  };
}
