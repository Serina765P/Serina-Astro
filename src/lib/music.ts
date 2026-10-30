// 网易云音乐数据适配层（纯函数，无副作用）。
//
// 可替换点是这里 + 快照文件：歌单元数据来自 src/data/music/netease-playlist.json
// （scripts/fetch-netease-playlist.mjs 生成），音频地址不写进数据 —— 网易云的直链带
// 几分钟就失效的签名，必须在播放时由浏览器访问第一方跳转地址重新解析。
//
// 边界：本站不下载、不分发音频，只把浏览器的音频元素指向网易云自己的地址；曲目是否
// 可播由版权、地区、会员状态决定，因此任何「可播」判断都不属于适配层。

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
}

export interface MusicSnapshot {
  source: string;
  provider?: string;
  fetched_at: string;
  count: number;
  items: MusicTrack[];
}

/** 全站固定歌单（issue #8/#12） */
export const NETEASE_PLAYLIST_ID = '8562312822';

/** 歌单快照的静态端点路径（src/pages/music/netease-playlist.json.ts）；消费方自己拼 BASE_URL */
export const PLAYLIST_ENDPOINT_PATH = 'music/netease-playlist.json';

const OUTER_AUDIO_URL = 'https://music.163.com/song/media/outer/url';
const SONG_PAGE_URL = 'https://music.163.com/song';
const PLAYLIST_PAGE_URL = 'https://music.163.com/playlist';

const TRACK_ID_PATTERN = /^\d+$/;

/** 歌单里出现的 id 应当全是纯数字；任何其它形态都说明数据源变了 */
export function isTrackId(value: unknown): value is string {
  return typeof value === 'string' && TRACK_ID_PATTERN.test(value);
}

/**
 * 音频地址。网易云会 302 到带签名的 CDN 地址，所以这里只存跳转 URL，
 * 每次播放都重新解析，避免把过期链接写进 HTML。
 */
export function trackStreamUrl(id: string): string {
  return `${OUTER_AUDIO_URL}?id=${id}.mp3`;
}

/** 原平台回退：曲目页（失败态与列表项的「去网易云」指向它） */
export function trackPageUrl(id: string): string {
  return `${SONG_PAGE_URL}?id=${id}`;
}

/** 原平台回退：歌单页 */
export function playlistPageUrl(id: string = NETEASE_PLAYLIST_ID): string {
  return `${PLAYLIST_PAGE_URL}?id=${id}`;
}

export interface PlaybackFailure {
  /** 失败态的标题 */
  title: string;
  /** 说明边界，不再承诺「一定能播」 */
  hint: string;
}

/**
 * 把 MediaError.code 翻译成可行动文案。
 * 失败后永远由用户决定是否再试 —— 运行时不得自动重试或跳下一首。
 */
export function describePlaybackFailure(code: number | null | undefined): PlaybackFailure {
  switch (code) {
    case 1:
      return {
        title: '播放已取消',
        hint: '这次播放被浏览器中断了，可以重新点击播放。',
      };
    case 2:
      return {
        title: '音频加载失败',
        hint: '网络或网易云音频服务暂时不可用，可以稍后重试。',
      };
    case 3:
      return {
        title: '音频无法解码',
        hint: '当前浏览器播放不了这个音频，可以到网易云收听。',
      };
    case 4:
      return {
        title: '这首暂时不可播放',
        hint: '版权、地区或会员限制会让音频不可用，可以到网易云收听。',
      };
    default:
      return {
        title: '播放失败',
        hint: '可以重新点击播放，或到网易云收听。',
      };
  }
}

/** 歌单快照本身没拉到（静态端点不可用/被拦截）时的提示，与音频不可播放区分开 */
export function describePlaylistLoadFailure(): PlaybackFailure {
  return {
    title: '歌单载入失败',
    hint: '播放器没有拿到曲目数据；可以刷新页面再试，或到网易云打开歌单收听。',
  };
}

/** 歌单循环：末尾回到第一首；空歌单返回 0，调用方据此判空 */
export function nextTrackIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return (index + 1) % total;
}

/** 歌单循环：第一首回到末尾 */
export function previousTrackIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return (index - 1 + total) % total;
}
