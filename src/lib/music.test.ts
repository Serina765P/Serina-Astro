import { describe, expect, it } from 'vitest';
import playlist from '../data/music/netease-playlist.json';
import {
  describePlaybackFailure,
  isTrackId,
  nextTrackIndex,
  playlistPageUrl,
  previousTrackIndex,
  trackPageUrl,
  trackStreamUrl,
} from './music.ts';

describe('网易云地址适配', () => {
  it('音频走第一方跳转地址，不在代码里拼接 CDN 直链或签名', () => {
    expect(trackStreamUrl('548650102')).toBe(
      'https://music.163.com/song/media/outer/url?id=548650102.mp3',
    );
  });

  it('曲目页与歌单页可回退到原平台', () => {
    expect(trackPageUrl('548650102')).toBe('https://music.163.com/song?id=548650102');
    expect(playlistPageUrl()).toBe('https://music.163.com/playlist?id=8562312822');
    expect(playlistPageUrl('123')).toBe('https://music.163.com/playlist?id=123');
  });

  it('只认纯数字曲目 id', () => {
    expect(isTrackId('548650102')).toBe(true);
    expect(isTrackId('8562312822')).toBe(true);
    expect(isTrackId('')).toBe(false);
    expect(isTrackId('548650102.mp3')).toBe(false);
    expect(isTrackId(548650102)).toBe(false);
  });
});

describe('播放失败文案', () => {
  it('不可播放（版权/地区/会员）说得明确，不承诺能播', () => {
    const failure = describePlaybackFailure(4);
    expect(failure.title).toBe('这首暂时不可播放');
    expect(failure.hint).toContain('版权');
    expect(failure.hint).toContain('网易云');
  });

  it('网络、解码、取消各有不同标题', () => {
    expect(describePlaybackFailure(2).title).toBe('音频加载失败');
    expect(describePlaybackFailure(3).title).toBe('音频无法解码');
    expect(describePlaybackFailure(1).title).toBe('播放已取消');
  });

  it('没有错误对象时仍给出可读的兜底', () => {
    expect(describePlaybackFailure(null).title).toBe('播放失败');
    expect(describePlaybackFailure(undefined).hint).toContain('网易云');
    expect(describePlaybackFailure(99).title).toBe('播放失败');
  });
});

describe('歌单顺序', () => {
  it('下一首循环回第一首', () => {
    expect(nextTrackIndex(0, 3)).toBe(1);
    expect(nextTrackIndex(2, 3)).toBe(0);
  });

  it('上一首从第一首回到末尾', () => {
    expect(previousTrackIndex(0, 3)).toBe(2);
    expect(previousTrackIndex(2, 3)).toBe(1);
  });

  it('空歌单不会产生负数或越界索引', () => {
    expect(nextTrackIndex(0, 0)).toBe(0);
    expect(previousTrackIndex(0, 0)).toBe(0);
  });
});

describe('歌单快照', () => {
  const tracks = playlist.items;

  it('条数与声明的 count 一致，且非空', () => {
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.length).toBe(playlist.count);
  });

  it('每首都有可用的 id、标题与第一方封面', () => {
    const broken = tracks.filter(
      (track) =>
        !isTrackId(track.id) ||
        track.title.trim() === '' ||
        !track.cover.startsWith('https://') ||
        track.cover.includes('api.i-meto.com'),
    );
    expect(broken).toEqual([]);
  });

  it('id 不重复，避免同一首歌在歌单里播两次', () => {
    const ids = tracks.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('来源指向固定歌单', () => {
    expect(playlist.source).toBe('https://music.163.com/playlist?id=8562312822');
  });
});
