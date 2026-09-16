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
