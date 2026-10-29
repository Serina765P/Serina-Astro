import { describe, expect, it } from 'vitest';
import { formatCount, readingTime, wordcount, yearInShanghai } from './utils';

describe('yearInShanghai', () => {
  it('把 UTC 年尾那 8 小时算进上海的下一年', () => {
    // 2025-12-31T16:00Z == 2026-01-01 00:00 +08:00
    expect(yearInShanghai(new Date('2025-12-31T15:59:59Z'))).toBe(2025);
    expect(yearInShanghai(new Date('2025-12-31T16:00:00Z'))).toBe(2026);
  });
});

describe('wordcount', () => {
  it('中文按字、英文按词计数', () => {
    expect(wordcount('今天喝了咖啡')).toBe(6);
    expect(wordcount('drink coffee now')).toBe(3);
  });

  it('代码、图片与 HTML 标签不计入', () => {
    expect(wordcount('`code` ![图](./a.png) <b>正文</b>')).toBe(2);
  });
});

describe('readingTime', () => {
  it('空文本也至少 1 分钟', () => {
    expect(readingTime('')).toBe(1);
  });

  it('按每分钟 250 字向上取整', () => {
    expect(readingTime('字'.repeat(251))).toBe(2);
  });
});

describe('formatCount', () => {
  it('四位以内原样输出，过万折算成一位小数', () => {
    expect(formatCount(9999)).toBe('9999');
    expect(formatCount(10000)).toBe('1.0 万');
    expect(formatCount(12345)).toBe('1.2 万');
  });
});
