import emojiData from '../data/emoji.json';
import { STICKER } from './sticker';

export interface CustomEmoji {
  code: string;
  label: string;
  set: string;
  setLabel: string;
  src: string;
  width: number;
  height: number;
  keywords: string[];
}

export const EMOJI = emojiData as CustomEmoji[];

/** 短代码渲染只需要这几项；贴纸与表情共用同一条管线。 */
export interface Shortcode {
  code: string;
  label: string;
  src: string;
  width: number;
  height: number;
  kind: 'emoji' | 'sticker';
}

const SHORTCODES: Shortcode[] = [
  ...EMOJI.map((emoji) => ({
    code: emoji.code,
    label: emoji.label,
    src: emoji.src,
    width: emoji.width,
    height: emoji.height,
    kind: 'emoji' as const,
  })),
  ...STICKER.map((sticker) => ({
    code: sticker.code,
    label: sticker.label,
    src: sticker.src,
    width: sticker.width,
    height: sticker.height,
    kind: 'sticker' as const,
  })),
];

const SHORTCODE_BY_CODE = new Map(SHORTCODES.map((shortcode) => [shortcode.code, shortcode]));

const shortcodePattern = /:([\p{L}\p{N}_-]+):/gu;
const urlPattern = /https?:\/\/[^\s<]+/gu;

export type EmojiTextSegment =
  | { type: 'text'; value: string }
  | { type: 'shortcode'; shortcode: Shortcode };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function splitEmojiText(value: string): EmojiTextSegment[] {
  const segments: EmojiTextSegment[] = [];
  const urls = [...value.matchAll(urlPattern)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  let cursor = 0;
  for (const match of value.matchAll(shortcodePattern)) {
    const index = match.index ?? 0;
    const shortcode = SHORTCODE_BY_CODE.get(match[1]);
    if (!shortcode || urls.some((url) => index >= url.start && index < url.end)) continue;
    if (index > cursor) segments.push({ type: 'text', value: value.slice(cursor, index) });
    segments.push({ type: 'shortcode', shortcode });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) segments.push({ type: 'text', value: value.slice(cursor) });
  if (!segments.length) segments.push({ type: 'text', value });
  return segments;
}

export function shortcodeImageHtml(shortcode: Shortcode): string {
  const sticker = shortcode.kind === 'sticker';
  const className = sticker ? 'custom-sticker' : 'custom-emoji';
  const dataAttribute = sticker ? 'data-custom-sticker' : 'data-custom-emoji';
  return `<img class="${className}" src="${shortcode.src}" alt=":${shortcode.code}:" title="${escapeHtml(shortcode.label)}" width="${shortcode.width}" height="${shortcode.height}" loading="lazy" decoding="async" draggable="false" ${dataAttribute}="${shortcode.code}" />`;
}

/** Escape user text and expand registered shortcodes. Unknown codes stay literal. */
export function renderShortcodeText(value: string): string {
  return splitEmojiText(value)
    .map((segment) =>
      segment.type === 'text' ? escapeHtml(segment.value) : shortcodeImageHtml(segment.shortcode),
    )
    .join('');
}

/** Same escaped text, shortcode and link rendering for SSR and client-side shuoshuo results. */
export function renderShuoshuoContent(value: string): string {
  let output = '';
  let cursor = 0;
  for (const match of value.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    output += renderShortcodeText(value.slice(cursor, index));
    const url = match[0];
    const safeUrl = escapeHtml(url);
    output += `<a href="${safeUrl}" target="_blank" rel="noopener nofollow" class="text-wash-pink-deep underline decoration-wash-pink-deep/50 underline-offset-2 hover:text-wash-rose-deep">${safeUrl}</a>`;
    cursor = index + url.length;
  }
  return output + renderShortcodeText(value.slice(cursor));
}
