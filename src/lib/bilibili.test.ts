import { describe, expect, it } from 'vitest';
import { bilibiliEmbed, bilibiliPlayerUrl, bilibiliVideoUrl, isBvid } from './bilibili';

const BVID = 'BV1aYxg6DEXb';

describe('isBvid', () => {
  it('accepts a 12-character BV id', () => {
    expect(isBvid(BVID)).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(isBvid('bv1aYxg6DEXb')).toBe(false);
    expect(isBvid('BV1aYxg6DEX')).toBe(false);
    expect(isBvid('BV1aYxg6DEXbb')).toBe(false);
    expect(isBvid('BV1aYxg6DEX-')).toBe(false);
    expect(isBvid(undefined)).toBe(false);
    expect(isBvid(123)).toBe(false);
  });
});

describe('bilibiliPlayerUrl', () => {
  it('generates the official player URL with autoplay off', () => {
    expect(bilibiliPlayerUrl(BVID, 1)).toBe(
      'https://player.bilibili.com/player.html?bvid=BV1aYxg6DEXb&p=1&autoplay=0',
    );
  });

  it('keeps the requested page', () => {
    expect(bilibiliPlayerUrl(BVID, 7)).toContain('&p=7&');
  });
});

describe('bilibiliVideoUrl', () => {
  it('links the original video at the same page', () => {
    expect(bilibiliVideoUrl(BVID, 3)).toBe('https://www.bilibili.com/video/BV1aYxg6DEXb?p=3');
  });
});

describe('bilibiliEmbed', () => {
  it('defaults to page 1 and derives an accessible title', () => {
    const embed = bilibiliEmbed({ bvid: BVID });
    expect(embed.page).toBe(1);
    expect(embed.playerUrl).toBe(bilibiliPlayerUrl(BVID, 1));
    expect(embed.videoUrl).toBe(bilibiliVideoUrl(BVID, 1));
    expect(embed.title).toContain(BVID);
    expect(embed.title).toContain('第 1 P');
  });

  it('accepts numeric and string pages', () => {
    expect(bilibiliEmbed({ bvid: BVID, p: 2 }).page).toBe(2);
    expect(bilibiliEmbed({ bvid: BVID, p: '2' }).page).toBe(2);
    expect(bilibiliEmbed({ bvid: BVID, p: ' 2 ' }).page).toBe(2);
  });

  it('uses an explicit title, trimmed', () => {
    expect(bilibiliEmbed({ bvid: BVID, title: ' 演唱会切片 ' }).title).toBe('演唱会切片');
  });

  it('falls back to the derived title for blank titles', () => {
    expect(bilibiliEmbed({ bvid: BVID, title: '   ' }).title).toContain(BVID);
  });

  it('rejects invalid BV ids', () => {
    expect(() => bilibiliEmbed({ bvid: 'BV123' })).toThrow(/bvid/i);
  });

  it('rejects non-positive or non-integer pages', () => {
    for (const p of [0, -1, 1.5, '1.5', 'abc', '', true]) {
      expect(() => bilibiliEmbed({ bvid: BVID, p })).toThrow(/p/i);
    }
  });
});
