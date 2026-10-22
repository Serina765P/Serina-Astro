import { TZ, yearInShanghai } from './utils';

export interface ShuoshuoImage {
  url: string;
  width: number;
  height: number;
}

export interface ShuoshuoItem {
  id: string;
  title: string;
  type: string;
  content: string;
  tags: string[];
  images: ShuoshuoImage[];
  link: string;
  like: number;
  published_at: string;
}

const tagPattern = /(^|[\s\n])#([\p{L}\p{N}_-]+)(?=$|[\s\n]|[，。！？,.!?])/gu;

/** 只解析行首或正文中以空白分隔的 #标签，避免误伤普通井号和 Markdown 标题。 */
export function extractShuoshuoTags(content: string): string[] {
  return [...new Set([...content.matchAll(tagPattern)].map((match) => match[2]))];
}

/** 展示层移除标签；源 JSON 和原始 Markdown 永远保持不变。 */
export function stripShuoshuoTags(content: string): string {
  return content
    .replace(tagPattern, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function monthInShanghai(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export function serializeShuoshuo(item: {
  id: string;
  data: {
    title: string;
    type: string;
    content: string;
    images: ShuoshuoImage[];
    link: string;
    like: number;
    published_at: Date;
  };
}): ShuoshuoItem {
  return {
    id: item.id,
    title: item.data.title,
    type: item.data.type,
    content: item.data.content,
    tags: extractShuoshuoTags(item.data.content),
    images: item.data.images,
    link: item.data.link,
    like: item.data.like,
    published_at: item.data.published_at.toISOString(),
  };
}

export function sortShuoshuo<T extends { published_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

export function shuoshuoYear(item: Pick<ShuoshuoItem, 'published_at'>): number {
  return yearInShanghai(new Date(item.published_at));
}

/* ── 展示层日期格式化：SSR 模板与客户端脚本共用同一实现 ──
   这两个消费方此前各写一份 dateParts / dateKey / dayNumber / formatTime，
   改时区或改格式必须同步两处，否则首屏与筛选后的时间线会呈现两套分组。 */

function datePartsInShanghai(publishedAt: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(publishedAt));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** 东八区日期键（YYYY-MM-DD），用于「同日只显示一次日期」的判定 */
export function shuoshuoDayKey(publishedAt: string): string {
  const parts = datePartsInShanghai(publishedAt);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 日号（去掉前导零），时间线左侧大字用 */
export function shuoshuoDayNumber(publishedAt: string): string {
  return String(Number(datePartsInShanghai(publishedAt).day));
}

/** 东八区 HH:mm */
export function formatShuoshuoTime(publishedAt: string): string {
  return new Date(publishedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  });
}
