import emojiData from '../data/emoji.json';

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
export const EMOJI_BY_CODE = new Map(EMOJI.map((emoji) => [emoji.code, emoji]));

const shortcodePattern = /:([\p{L}\p{N}_-]+):/gu;
const urlPattern = /https?:\/\/[^\s<]+/gu;

export type EmojiTextSegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; emoji: CustomEmoji };

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
    const emoji = EMOJI_BY_CODE.get(match[1]);
    if (!emoji || urls.some((url) => index >= url.start && index < url.end)) continue;
    if (index > cursor) segments.push({ type: 'text', value: value.slice(cursor, index) });
    segments.push({ type: 'emoji', emoji });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) segments.push({ type: 'text', value: value.slice(cursor) });
  if (!segments.length) segments.push({ type: 'text', value });
  return segments;
}

function emojiImageHtml(emoji: CustomEmoji): string {
  return `<img class="custom-emoji" src="${emoji.src}" alt=":${emoji.code}:" title="${escapeHtml(emoji.label)}" width="${emoji.width}" height="${emoji.height}" loading="lazy" decoding="async" draggable="false" data-custom-emoji="${emoji.code}" />`;
}

/** Escape user text and expand registered shortcodes. Unknown codes stay literal. */
export function renderEmojiText(value: string): string {
  return splitEmojiText(value)
    .map((segment) =>
      segment.type === 'text' ? escapeHtml(segment.value) : emojiImageHtml(segment.emoji),
    )
    .join('');
}

/** Same escaped text, shortcode and link rendering for SSR and client-side shuoshuo results. */
export function renderShuoshuoContent(value: string): string {
  let output = '';
  let cursor = 0;
  for (const match of value.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    output += renderEmojiText(value.slice(cursor, index));
    const url = match[0];
    const safeUrl = escapeHtml(url);
    output += `<a href="${safeUrl}" target="_blank" rel="noopener nofollow" class="text-wash-pink-deep underline decoration-wash-pink-deep/50 underline-offset-2 hover:text-wash-rose-deep">${safeUrl}</a>`;
    cursor = index + url.length;
  }
  return output + renderEmojiText(value.slice(cursor));
}
