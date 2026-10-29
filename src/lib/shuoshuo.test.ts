import { describe, expect, it } from 'vitest';
import {
  extractShuoshuoTags,
  formatShuoshuoTime,
  monthInShanghai,
  shuoshuoDayKey,
  shuoshuoDayNumber,
  shuoshuoYear,
  sortShuoshuo,
  stripShuoshuoTags,
} from './shuoshuo';

describe('extractShuoshuoTags', () => {
  it('取空白或行首起头的 #标签并去重', () => {
    expect(extractShuoshuoTags('今天 #咖啡 和 #咖啡 都不错')).toEqual(['咖啡']);
    expect(extractShuoshuoTags('#咖啡\n好喝')).toEqual(['咖啡']);
  });

  it('不误伤 Markdown 标题、C# 和普通井号', () => {
    expect(extractShuoshuoTags('# 标题')).toEqual([]);
    expect(extractShuoshuoTags('在看 C# 语言')).toEqual([]);
    expect(extractShuoshuoTags('价格 # 待定')).toEqual([]);
  });

  it('中文标点可以作为标签边界', () => {
    expect(extractShuoshuoTags('#标签，后面是正文')).toEqual(['标签']);
  });
});

describe('stripShuoshuoTags', () => {
  it('展示层去掉标签，源文本不动', () => {
    expect(stripShuoshuoTags('#咖啡\n正文')).toBe('正文');
  });

  it('去掉标签后不留行尾空格', () => {
    const stripped = stripShuoshuoTags('今天 #咖啡 好喝');
    expect(stripped).not.toContain('咖啡');
    expect(stripped.replace(/\s+/g, ' ')).toBe('今天 好喝');
  });
});

describe('sortShuoshuo', () => {
  it('按发布时间倒序且不改原数组', () => {
    const items = [
      { id: 'old', published_at: '2026-01-01T00:00:00+08:00' },
      { id: 'new', published_at: '2026-03-01T00:00:00+08:00' },
    ];

    expect(sortShuoshuo(items).map((item) => item.id)).toEqual(['new', 'old']);
    expect(items.map((item) => item.id)).toEqual(['old', 'new']);
  });
});

describe('东八区展示口径', () => {
  it('UTC 跨年时间归到上海的下一年、下一月、下一天', () => {
    expect(shuoshuoYear({ published_at: '2025-12-31T16:00:00Z' })).toBe(2026);
    expect(monthInShanghai(new Date('2025-12-31T16:00:00Z'))).toBe('2026-01');
    expect(shuoshuoDayKey('2025-12-31T16:30:00Z')).toBe('2026-01-01');
  });

  it('日号去掉前导零，时间按 24 小时制', () => {
    expect(shuoshuoDayNumber('2026-03-05T09:00:00+08:00')).toBe('5');
    expect(formatShuoshuoTime('2026-03-05T23:05:00+08:00')).toBe('23:05');
  });
});
