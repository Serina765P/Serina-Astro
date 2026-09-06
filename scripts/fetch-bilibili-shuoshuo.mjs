// 从 B 站抓取指定 UP 的图文动态（opus feed），写入 src/data/shuoshuo.json 供说说页构建时渲染。
// 移植自旧站 scripts/fetch-bilibili-shuoshuo.js，逻辑保持一致，数据文件收敛为单份。
import fs from 'node:fs/promises';
import path from 'node:path';

const HOST_MID = '1726354044';
const API_URL = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space';
const DETAIL_API_URL = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail';
const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'shuoshuo.json');
const MAX_PAGES = Number.parseInt(process.env.SHUOSHUO_MAX_PAGES || '6', 10);
const REQUEST_DELAY = Number.parseInt(process.env.SHUOSHUO_REQUEST_DELAY || '800', 10);
const DETAIL_REQUEST_DELAY = Number.parseInt(process.env.SHUOSHUO_DETAIL_REQUEST_DELAY || '250', 10);

const BLOCKED_TYPES = new Set([
  'DYNAMIC_TYPE_AV',
  'DYNAMIC_TYPE_PGC',
  'DYNAMIC_TYPE_UGC_SEASON',
  'DYNAMIC_TYPE_LIVE',
  'DYNAMIC_TYPE_LIVE_RCMD',
  'DYNAMIC_TYPE_ARTICLE',
  'DYNAMIC_TYPE_ARTICLE_UP',
]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return url.replace(/^http:\/\//, 'https://');
  return url;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function normalizeImage(image) {
  if (!image) return null;
  const url = normalizeUrl(image.url || image.src || image.img_src || image.image_url);
  if (!url) return null;

  return {
    url,
    width: toNumber(image.width || image.w),
    height: toNumber(image.height || image.h),
  };
}

function collectImages(item) {
  const images = [];
  const addImage = (image) => {
    const normalized = normalizeImage(image);
    if (normalized && !images.some((existing) => existing.url === normalized.url)) {
      images.push(normalized);
    }
  };

  addImage(item.cover);
  (item.pictures || item.pics || []).forEach(addImage);

  const major = item.modules && item.modules.module_dynamic && item.modules.module_dynamic.major;
  if (major) {
    (major.draw && major.draw.items ? major.draw.items : []).forEach(addImage);
    (major.opus && major.opus.pics ? major.opus.pics : []).forEach(addImage);
  }

  return images;
}

function extractRichText(desc) {
  if (!desc) return '';
  if (typeof desc.text === 'string') return sanitizeText(desc.text);
  if (!Array.isArray(desc.rich_text_nodes)) return '';

  return sanitizeText(desc.rich_text_nodes.map((node) => {
    if (!node) return '';
    if (typeof node.orig_text === 'string') return node.orig_text;
    if (typeof node.text === 'string') return node.text;
    if (node.word && typeof node.word.words === 'string') return node.word.words;
    if (node.rich && typeof node.rich.orig_text === 'string') return node.rich.orig_text;
    if (node.rich && typeof node.rich.text === 'string') return node.rich.text;
    if (node.emoji && typeof node.emoji.text === 'string') return node.emoji.text;
    if (node.user && typeof node.user.name === 'string') return `@${node.user.name}`;
    return '';
  }).join(''));
}

function extractContent(item) {
  if (typeof item.content === 'string') return sanitizeText(item.content);

  const dynamic = item.modules && item.modules.module_dynamic;
  const desc = dynamic && dynamic.desc;
  const richText = extractRichText(desc);
  if (richText) return richText;

  const opus = dynamic && dynamic.major && dynamic.major.opus;
  if (opus && typeof opus.summary === 'string') return sanitizeText(opus.summary);

  return '';
}

function extractLink(item) {
  return normalizeUrl(
    item.jump_url ||
    item.jump_url_for_app ||
    (item.basic && item.basic.jump_url) ||
    (item.opus_id ? `https://www.bilibili.com/opus/${item.opus_id}` : '') ||
    (item.id_str ? `https://t.bilibili.com/${item.id_str}` : '')
  );
}

function extractLike(item) {
  if (item.stat && item.stat.like != null) return toNumber(item.stat.like);
  const moduleStat = item.modules && item.modules.module_stat;
  if (moduleStat && moduleStat.like && moduleStat.like.count != null) {
    return toNumber(moduleStat.like.count);
  }
  return 0;
}

function extractPublishedAt(item) {
  const author = item.modules && item.modules.module_author;
  const pubTs = author && author.pub_ts;
  if (pubTs) return new Date(toNumber(pubTs) * 1000).toISOString();
  return '';
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.type && BLOCKED_TYPES.has(item.type)) return null;

  const content = extractContent(item);
  const images = collectImages(item);

  if (!content && images.length === 0) return null;

  const id = String(item.opus_id || item.id_str || item.id || '');
  const link = extractLink(item);

  return {
    id,
    title: '',
    type: item.type || 'OPUS',
    content,
    images,
    link,
    like: extractLike(item),
    published_at: extractPublishedAt(item),
  };
}

function mergeImages(baseImages, extraImages) {
  const images = [];
  for (const image of [...(baseImages || []), ...(extraImages || [])]) {
    const normalized = normalizeImage(image);
    if (normalized && !images.some((existing) => existing.url === normalized.url)) {
      images.push(normalized);
    }
  }
  return images;
}

function textFromContentNode(node) {
  if (!node) return '';
  if (node.word && typeof node.word.words === 'string') return node.word.words;
  if (node.rich && typeof node.rich.orig_text === 'string') return node.rich.orig_text;
  if (node.rich && typeof node.rich.text === 'string') return node.rich.text;
  if (node.user && typeof node.user.name === 'string') return `@${node.user.name}`;
  if (node.formula && typeof node.formula.text === 'string') return node.formula.text;
  return '';
}

function extractHtmlInitialState(html) {
  const marker = 'window.__INITIAL_STATE__=';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const jsonStart = start + marker.length;
  let jsonEnd = html.indexOf(';(function()', jsonStart);
  if (jsonEnd === -1) jsonEnd = html.indexOf('</script>', jsonStart);
  if (jsonEnd === -1) return null;

  return JSON.parse(html.slice(jsonStart, jsonEnd).trim().replace(/;$/, ''));
}

function parseHtmlDetail(html) {
  const state = extractHtmlInitialState(html);
  const modules = state && state.detail && Array.isArray(state.detail.modules)
    ? state.detail.modules
    : [];
  const result = {
    title: '',
    content: '',
    images: [],
    like: 0,
    published_at: '',
  };
  const paragraphs = [];

  for (const module of modules) {
    if (module.module_title && module.module_title.text) {
      result.title = sanitizeText(module.module_title.text);
    }

    if (module.module_author && module.module_author.pub_ts) {
      result.published_at = new Date(toNumber(module.module_author.pub_ts) * 1000).toISOString();
    }

    if (module.module_stat && module.module_stat.like) {
      result.like = toNumber(module.module_stat.like.count);
    }

    const content = module.module_content;
    if (content && Array.isArray(content.paragraphs)) {
      for (const paragraph of content.paragraphs) {
        if (paragraph.text && Array.isArray(paragraph.text.nodes)) {
          const text = sanitizeText(paragraph.text.nodes.map(textFromContentNode).join(''));
          if (text) paragraphs.push(text);
        }

        if (paragraph.pic && Array.isArray(paragraph.pic.pics)) {
          result.images = mergeImages(result.images, paragraph.pic.pics);
        }
      }
    }
  }

  result.content = paragraphs.join('\n');
  return result;
}

async function fetchDetail(id) {
  const url = new URL(DETAIL_API_URL);
  url.searchParams.set('id', id);

  const response = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      referer: `https://www.bilibili.com/opus/${id}`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`detail HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0 || !payload.data || !payload.data.item) {
    throw new Error(`detail code ${payload.code}: ${payload.message || 'unknown error'}`);
  }

  const item = payload.data.item;
  if (item.type && BLOCKED_TYPES.has(item.type)) return { blocked: true };

  return {
    type: item.type || '',
    content: extractContent(item),
    images: collectImages(item),
    link: extractLink(item),
    like: extractLike(item),
    published_at: extractPublishedAt(item),
  };
}

async function fetchHtmlDetail(id) {
  const response = await fetch(`https://www.bilibili.com/opus/${id}`, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      referer: 'https://www.bilibili.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`opus HTML HTTP ${response.status}`);
  return parseHtmlDetail(await response.text());
}

function mergeDetail(base, detail, htmlDetail) {
  if (!base) return null;
  if (detail && detail.blocked) return null;

  const result = {
    ...base,
    ...(detail && detail.type ? { type: detail.type } : {}),
  };
  const detailContent = sanitizeText(htmlDetail && htmlDetail.content ? htmlDetail.content : detail && detail.content);
  const htmlTitle = sanitizeText(htmlDetail && htmlDetail.title);

  if (htmlTitle) {
    result.title = htmlTitle;
    result.content = detailContent;
  } else if (detailContent && detailContent !== base.content) {
    result.title = base.content;
    result.content = detailContent;
  } else {
    result.title = '';
    result.content = detailContent || base.content;
  }

  result.images = mergeImages(base.images, [
    ...((detail && detail.images) || []),
    ...((htmlDetail && htmlDetail.images) || []),
  ]);
  result.link = base.link || (detail && detail.link);
  result.like = (htmlDetail && htmlDetail.like) || (detail && detail.like) || base.like;
  result.published_at = (htmlDetail && htmlDetail.published_at) || (detail && detail.published_at) || base.published_at;

  return result.content || result.title || result.images.length > 0 ? result : null;
}

async function resolveItem(base) {
  if (!base.id) return base;

  let detail = null;
  let htmlDetail = null;
  let detailError = null;

  try {
    detail = await fetchDetail(base.id);
  } catch (error) {
    detailError = error;
  }

  if (detail && detail.blocked) return null;

  if (!detail || !detail.content) {
    try {
      htmlDetail = await fetchHtmlDetail(base.id);
    } catch (error) {
      const detailMessage = detailError ? ` Detail API: ${detailError.message}.` : '';
      console.warn(`Failed to enrich ${base.id}.${detailMessage} Opus HTML: ${error.message}`);
    }
  }

  return mergeDetail(base, detail, htmlDetail);
}

async function fetchPage(offset) {
  const url = new URL(API_URL);
  url.searchParams.set('host_mid', HOST_MID);
  if (offset) url.searchParams.set('offset', offset);

  const response = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      referer: `https://space.bilibili.com/${HOST_MID}/dynamic`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Bilibili API responded with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.code !== 0) {
    throw new Error(`Bilibili API responded with code ${payload.code}: ${payload.message || 'unknown error'}`);
  }
  if (!payload.data || !Array.isArray(payload.data.items)) {
    throw new Error('Bilibili API response does not contain data.items');
  }

  return payload.data;
}

async function readExisting() {
  try {
    return await fs.readFile(DATA_FILE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return '';
}

async function writeJson(data) {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, content, 'utf8');
}

async function main() {
  const baseItems = [];
  const seen = new Set();
  let offset = '';
  let hasMore = true;

  for (let page = 1; page <= MAX_PAGES && hasMore; page += 1) {
    const data = await fetchPage(offset);

    for (const rawItem of data.items) {
      const item = normalizeItem(rawItem);
      if (!item) continue;

      const key = item.id || item.link || item.content;
      if (seen.has(key)) continue;
      seen.add(key);
      baseItems.push(item);
    }

    hasMore = Boolean(data.has_more && data.offset && data.offset !== offset);
    offset = data.offset || '';

    if (hasMore && page < MAX_PAGES) await delay(REQUEST_DELAY);
  }

  const items = [];
  for (let index = 0; index < baseItems.length; index += 1) {
    const item = await resolveItem(baseItems[index]);
    if (item) items.push(item);
    if (index < baseItems.length - 1) await delay(DETAIL_REQUEST_DELAY);
  }

  const output = {
    host_mid: HOST_MID,
    source: API_URL,
    fetched_at: new Date().toISOString(),
    count: items.length,
    items,
  };

  await writeJson(output);
  console.log(`Fetched ${items.length} shuoshuo items from Bilibili.`);
}

async function handleError(error) {
  console.warn(`Failed to fetch Bilibili shuoshuo: ${error.message}`);

  const existing = await readExisting();
  if (existing) {
    console.warn(`Keeping existing data at ${path.relative(process.cwd(), DATA_FILE)}.`);
    return;
  }

  await writeJson({
    host_mid: HOST_MID,
    source: API_URL,
    fetched_at: '',
    count: 0,
    items: [],
    error: error.message,
  });
  console.warn(`Wrote empty data to ${path.relative(process.cwd(), DATA_FILE)}.`);
}

main().catch(handleError);
