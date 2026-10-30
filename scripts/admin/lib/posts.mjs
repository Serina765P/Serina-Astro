import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Document, parseDocument } from 'yaml';
import { POST_FRONTMATTER_FIELDS, POST_SKINS } from '../../../src/lib/post-frontmatter.ts';
import { SLUG_PATTERN } from '../../../src/lib/taxonomy.ts';
import { writeFileAtomic, writeFileAtomicExclusive } from './atomic-write.mjs';
import {
  createPostSource,
  joinPostSource,
  splitPostSource,
  yamlOptionsFor,
} from './frontmatter.mjs';
import { HttpError } from './http.mjs';

export const POSTS_DIR = path.join('src', 'content', 'posts');

const POST_FILE_PATTERN = /\.(md|mdx)$/u;
const POST_FORMATS = ['md', 'mdx'];
const MAX_SLUG_LENGTH = 80;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_COVER_LENGTH = 512;
const MAX_NAMES = 200;
const MAX_NAME_LENGTH = 100;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/u;
const EDITABLE_FIELDS = [...POST_FRONTMATTER_FIELDS];
const REQUIRED_FIELDS = ['title', 'date'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(input, allowed, label) {
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new HttpError(400, `${label}包含未知字段：${unknown.join(', ')}`);
  }
}

/** 文章 slug 与分类/标签共用同一套 kebab-case 语法，禁止路径分隔符与中文。 */
export function requirePostSlug(value) {
  if (typeof value !== 'string') throw new HttpError(400, '文章 slug 必须是字符串');
  const slug = value.trim();
  if (!slug) throw new HttpError(400, '文章 slug 不能为空');
  if (slug.length > MAX_SLUG_LENGTH) throw new HttpError(400, '文章 slug 过长');
  if (!SLUG_PATTERN.test(slug)) {
    throw new HttpError(400, '文章 slug 只能使用小写 ASCII 字母、数字与连字符，例如 my-new-post');
  }
  return slug;
}

function requireDate(value, label) {
  if (typeof value !== 'string') throw new HttpError(400, `${label}必须是字符串`);
  const text = value.trim();
  if (!ISO_DATE.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new HttpError(400, `${label}格式无效，例如 2026-10-08 或 2026-10-08T12:00:00+08:00`);
  }
  return text;
}

function normalizeNames(value, label) {
  if (!Array.isArray(value)) throw new HttpError(400, `${label}必须是数组`);
  if (value.length > MAX_NAMES) throw new HttpError(400, `${label}最多 ${MAX_NAMES} 项`);
  const names = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string') throw new HttpError(400, `${label}的每一项都必须是字符串`);
    const name = item.trim();
    if (!name) throw new HttpError(400, `${label}不能包含空字符串`);
    if (name.length > MAX_NAME_LENGTH) throw new HttpError(400, `${label}「${name}」过长`);
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function normalizeCover(value) {
  if (typeof value !== 'string') throw new HttpError(400, '封面必须是字符串');
  const cover = value.trim();
  if (cover.length > MAX_COVER_LENGTH) throw new HttpError(400, '封面路径过长');
  const segments = cover.split('/');
  if (cover.startsWith('/') || cover.includes('\\') || segments.includes('..')) {
    throw new HttpError(400, '封面必须是文章目录内的相对路径，例如 cover.avif');
  }
  return cover;
}

/**
 * 只接受前台表单可编辑的字段；未知字段由已有 Document 原样保留，不经过这里。
 * `null` 表示删除可选字段，title / date / pinned / toc 不允许删除。
 */
export function normalizeFrontmatterPatch(
  input,
  { requireTitle = false, requireDateField = false } = {},
) {
  if (!isPlainObject(input)) throw new HttpError(400, 'frontmatter 必须是 JSON 对象');
  rejectUnknownKeys(input, EDITABLE_FIELDS, 'frontmatter');

  const patch = {};
  for (const field of EDITABLE_FIELDS) {
    if (!Object.hasOwn(input, field)) continue;
    const value = input[field];

    if (REQUIRED_FIELDS.includes(field) && value === null) {
      throw new HttpError(400, `${field === 'title' ? '标题' : '发布时间'}不能删除`);
    }
    if (field === 'title') {
      if (typeof value !== 'string' || !value.trim()) {
        throw new HttpError(400, '标题必须是字符串且不能为空');
      }
      const title = value.trim();
      if (title.length > MAX_TITLE_LENGTH) throw new HttpError(400, '标题过长');
      patch.title = title;
      continue;
    }
    if (field === 'date') {
      patch.date = requireDate(value, '发布时间');
      continue;
    }
    if (field === 'updated') {
      patch.updated =
        value === null || (typeof value === 'string' && !value.trim())
          ? null
          : requireDate(value, '更新时间');
      continue;
    }
    if (field === 'tags' || field === 'categories' || field === 'keywords') {
      patch[field] =
        value === null
          ? null
          : normalizeNames(
              value,
              field === 'tags' ? '标签' : field === 'categories' ? '分类' : '关键词',
            );
      continue;
    }
    if (field === 'description') {
      if (value === null) {
        patch.description = null;
        continue;
      }
      if (typeof value !== 'string') throw new HttpError(400, '摘要必须是字符串');
      const description = value.trim();
      if (description.length > MAX_DESCRIPTION_LENGTH) throw new HttpError(400, '摘要过长');
      patch.description = description || null;
      continue;
    }
    if (field === 'cover') {
      patch.cover =
        value === null || (typeof value === 'string' && !value.trim())
          ? null
          : normalizeCover(value);
      continue;
    }
    if (field === 'pinned' || field === 'toc') {
      if (typeof value !== 'boolean') {
        throw new HttpError(400, `${field === 'pinned' ? '置顶' : '目录'}开关必须是布尔值`);
      }
      patch[field] = value;
      continue;
    }
    if (field === 'skin') {
      if (value === null || (typeof value === 'string' && !value.trim())) {
        patch.skin = null;
        continue;
      }
      if (typeof value !== 'string' || !POST_SKINS.includes(value)) {
        throw new HttpError(400, `skin 只能是 ${POST_SKINS.join(' / ')} 或留空`);
      }
      patch.skin = value;
    }
  }

  if (requireTitle && !Object.hasOwn(patch, 'title')) {
    throw new HttpError(400, '新建文章必须填写标题');
  }
  if (requireDateField && !Object.hasOwn(patch, 'date')) {
    throw new HttpError(400, '新建文章必须填写发布时间');
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, '没有可保存的 frontmatter 字段');
  return patch;
}

function applyPatch(document, patch) {
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) document.delete(field);
    else document.set(field, value);
  }
}

function relativeFile(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function postExists(root, slug) {
  for (const format of POST_FORMATS) {
    try {
      await stat(path.join(root, POSTS_DIR, `${slug}.${format}`));
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new HttpError(500, '检查文章文件失败', { cause: error });
    }
  }
  return false;
}

async function hasAssetDir(root, slug) {
  try {
    return (await stat(path.join(root, POSTS_DIR, slug))).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new HttpError(500, '检查文章资源目录失败', { cause: error });
  }
}

async function locatePost(root, slug) {
  const matches = [];
  for (const format of POST_FORMATS) {
    const file = path.join(root, POSTS_DIR, `${slug}.${format}`);
    try {
      if ((await stat(file)).isFile()) matches.push({ file, format });
    } catch (error) {
      if (error.code !== 'ENOENT') throw new HttpError(500, '读取文章文件失败', { cause: error });
    }
  }
  if (matches.length === 0) throw new HttpError(404, `文章不存在：${slug}`);
  if (matches.length > 1) {
    throw new HttpError(409, `文章 slug 冲突：${slug} 同时存在 .md 与 .mdx`);
  }
  return matches[0];
}

async function readPostDocument(root, slug) {
  const { file, format } = await locatePost(root, slug);
  const raw = await readFile(file, 'utf8');
  const part = splitPostSource(raw);
  if (!part) throw new HttpError(500, `${relativeFile(root, file)} 缺少 frontmatter`);
  const document = parseDocument(part.yaml);
  if (document.errors.length > 0) {
    throw new HttpError(
      500,
      `解析 ${relativeFile(root, file)} 的 frontmatter 失败：${document.errors[0].message}`,
    );
  }
  let frontmatter;
  try {
    frontmatter = document.toJS() ?? {};
  } catch (error) {
    throw new HttpError(500, `解析 ${relativeFile(root, file)} 的 frontmatter 失败`, {
      cause: error,
    });
  }
  if (!isPlainObject(frontmatter)) {
    throw new HttpError(500, `${relativeFile(root, file)} 的 frontmatter 必须是对象`);
  }
  return {
    file,
    format,
    raw,
    part,
    document,
    frontmatter,
    relativeFile: relativeFile(root, file),
  };
}

function dateText(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

function summarize(post, hasAssets) {
  const data = post.frontmatter;
  return {
    slug: path.basename(post.file, `.${post.format}`),
    file: post.relativeFile,
    format: post.format,
    title: typeof data.title === 'string' && data.title.trim() ? data.title : '',
    date: dateText(data.date),
    updated: dateText(data.updated),
    tags: stringList(data.tags),
    categories: stringList(data.categories),
    keywords: stringList(data.keywords),
    description: typeof data.description === 'string' ? data.description : '',
    cover: typeof data.cover === 'string' ? data.cover : '',
    pinned: data.pinned === true,
    toc: data.toc !== false,
    skin: typeof data.skin === 'string' ? data.skin : null,
    hasAssets,
  };
}

async function listPostFiles(root) {
  const directory = path.join(root, POSTS_DIR);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new HttpError(500, '读取文章目录失败', { cause: error });
  }
  return entries
    .filter((entry) => entry.isFile() && POST_FILE_PATTERN.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

/** 列表按发布时间倒序；坏文件不拖垮整张表，只带上 error。 */
export async function listPosts(root) {
  const files = await listPostFiles(root);
  const posts = [];
  for (const file of files) {
    const slug = path.basename(file).replace(POST_FILE_PATTERN, '');
    try {
      const post = await readPostDocument(root, slug);
      posts.push(summarize(post, await hasAssetDir(root, slug)));
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      posts.push({
        slug,
        file: relativeFile(root, file),
        format: path.extname(file).slice(1),
        title: '',
        date: null,
        updated: null,
        tags: [],
        categories: [],
        keywords: [],
        description: '',
        cover: '',
        pinned: false,
        toc: true,
        skin: null,
        hasAssets: await hasAssetDir(root, slug),
        error: error.message,
      });
    }
  }
  return posts.sort((a, b) => {
    const aTime = a.date ? Date.parse(a.date) : Number.NaN;
    const bTime = b.date ? Date.parse(b.date) : Number.NaN;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
    if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
}

export async function getPost(root, slugInput) {
  const slug = requirePostSlug(slugInput);
  const post = await readPostDocument(root, slug);
  return {
    slug,
    file: post.relativeFile,
    format: post.format,
    lineEnding: post.part.lineEnding,
    hasAssets: await hasAssetDir(root, slug),
    frontmatter: post.frontmatter,
  };
}

/** 图片上传等旁路写入只要求文章文件存在，不解析 frontmatter。 */
export async function assertPostExists(root, slugInput) {
  const slug = requirePostSlug(slugInput);
  await locatePost(root, slug);
  return slug;
}

export async function createPost(root, payload) {
  if (!isPlainObject(payload)) throw new HttpError(400, '请求体必须是 JSON 对象');
  rejectUnknownKeys(payload, ['slug', 'frontmatter'], '请求体');
  const slug = requirePostSlug(payload.slug);
  const patch = normalizeFrontmatterPatch(payload.frontmatter, {
    requireTitle: true,
    requireDateField: true,
  });
  if (await postExists(root, slug)) throw new HttpError(409, `文章 slug 已存在：${slug}`);

  const document = new Document({});
  applyPatch(document, patch);
  const content = createPostSource(document.toString({ lineWidth: 0 }));
  try {
    await writeFileAtomicExclusive(path.join(root, POSTS_DIR, `${slug}.md`), content);
  } catch (error) {
    if (error.code === 'EEXIST') throw new HttpError(409, `文章 slug 已存在：${slug}`);
    throw new HttpError(500, '创建文章失败', { cause: error });
  }
  return getPost(root, slug);
}

export async function updatePost(root, slugInput, payload) {
  const slug = requirePostSlug(slugInput);
  if (!isPlainObject(payload)) throw new HttpError(400, '请求体必须是 JSON 对象');
  rejectUnknownKeys(payload, ['frontmatter'], '请求体');
  const patch = normalizeFrontmatterPatch(payload.frontmatter);
  const post = await readPostDocument(root, slug);

  applyPatch(post.document, patch);
  const content = joinPostSource(post.part, post.document.toString(yamlOptionsFor(post.part)));
  try {
    await writeFileAtomic(post.file, content);
  } catch (error) {
    throw new HttpError(500, '写入文章失败', { cause: error });
  }
  return getPost(root, slug);
}

export async function deletePost(root, slugInput, { removeAssets = false } = {}) {
  const slug = requirePostSlug(slugInput);
  const { file } = await locatePost(root, slug);
  try {
    await rm(file);
  } catch (error) {
    throw new HttpError(500, '删除文章失败', { cause: error });
  }
  let assetsRemoved = false;
  if (removeAssets) {
    const directory = path.join(root, POSTS_DIR, slug);
    assetsRemoved = await hasAssetDir(root, slug);
    if (assetsRemoved) {
      try {
        await rm(directory, { recursive: true, force: true });
      } catch (error) {
        throw new HttpError(500, '删除文章资源目录失败', { cause: error });
      }
    }
  }
  return { slug, removed: true, assetsRemoved };
}
