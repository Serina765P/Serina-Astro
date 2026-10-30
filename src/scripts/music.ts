// 音乐播放运行时：每个播放器一个 <audio>，两套 UI（BGM 悬浮条 / 文章卡片）共用。
//
// 设计边界（issue #12）：
// · 手动启动：本模块由 scripts/music-loader.ts 在首次交互后动态 import，
//   在此之前页面里没有任何 Video.js 代码，也不会请求音频或歌单。
// · 失败一次就停：error 事件只展示失败态与原平台链接，不自动重试、不自动跳下一首；
//   再试必须来自用户的再次点击。只有播放自然结束才推进队列（单曲不循环）。
// · 播放互斥：任一播放器开始播放都会派发 music:interrupt，其余播放器暂停；
//   暂停/结束不会自动恢复（BGM 不会因为文章播放器停了就重新响起）。
// · 数据只有两个来源：构建期内联快照（文章组件）与同源静态端点（BGM），
//   音频地址由 lib/music.ts 拼成网易云第一方跳转 URL，运行时不访问任何第三方 API。
import '@videojs/html/i18n';
import '@videojs/html/audio/player';
import '@videojs/html/ui/time-slider';
import '@videojs/html/ui/slider-track';
import '@videojs/html/ui/slider-fill';
import '@videojs/html/ui/slider-thumb';
import '@videojs/html/ui/time-group';
import '@videojs/html/ui/time';
import '@videojs/html/ui/time-separator';
import '@videojs/html/ui/mute-button';
import {
  describePlaybackFailure,
  describePlaylistLoadFailure,
  isTrackId,
  type MusicTrack,
  nextTrackIndex,
  type PlaybackFailure,
  previousTrackIndex,
  trackStreamUrl,
} from '../lib/music';
import { MUSIC_TRIGGER_SELECTOR } from './music-contract';

const INTERRUPT_EVENT = 'music:interrupt';

interface MusicState {
  audio: HTMLAudioElement;
  tracks: MusicTrack[];
  index: number;
  /** 上一次播放失败后保持 true，直到用户再次点击播放 */
  failed: boolean;
  /** 快照就绪：内联 JSON 立即完成，静态端点则是一次同源 fetch（首次使用时才发起） */
  ready: Promise<void> | null;
}

type MusicRoot = HTMLElement & { __music?: MusicState };

/** 快照条目的形状校验：宁可不播，也不拿坏数据去拼音频地址 */
function parseTracks(value: unknown): MusicTrack[] {
  if (!Array.isArray(value)) return [];
  return value.filter((track): track is MusicTrack => {
    if (typeof track !== 'object' || track === null) return false;
    const { id, title, artist, cover } = track as Record<string, unknown>;
    return (
      isTrackId(id) &&
      typeof title === 'string' &&
      typeof artist === 'string' &&
      typeof cover === 'string'
    );
  });
}

function readInlineTracks(root: MusicRoot): MusicTrack[] {
  const script = root.querySelector<HTMLScriptElement>('script[data-music-tracks]');
  if (!script?.textContent) return [];
  try {
    return parseTracks(JSON.parse(script.textContent));
  } catch {
    return [];
  }
}

function stateOf(root: MusicRoot): MusicState {
  if (!root.__music) throw new Error('音乐播放器尚未绑定');
  return root.__music;
}

/** 同一份快照只下载一次：一页里 BGM 与文章歌单共用同一个静态端点 */
const playlistCache = new Map<string, Promise<MusicTrack[]>>();

function fetchTracks(source: string): Promise<MusicTrack[]> {
  const cached = playlistCache.get(source);
  if (cached) return cached;
  const pending = fetch(source, { credentials: 'omit' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    })
    .then((data) => parseTracks(data));
  playlistCache.set(source, pending);
  // 失败不留在缓存里：下一次用户点击应当真的重新请求
  pending.catch(() => playlistCache.delete(source));
  return pending;
}

/** 歌单快照只在真正要用时才拉；失败不缓存，用户下次点击会重新请求 */
function readyOf(root: MusicRoot): Promise<void> {
  const state = stateOf(root);
  if (state.ready) return state.ready;
  const source = root.dataset.musicSrc;
  state.ready = (source ? fetchTracks(source) : Promise.resolve([]))
    .then((tracks) => {
      state.tracks = tracks;
    })
    .catch(() => {
      state.tracks = [];
      state.ready = null;
    });
  return state.ready;
}

function setState(root: MusicRoot, state: string): void {
  root.dataset.state = state;
  const playing = state === 'playing';
  for (const button of root.querySelectorAll<HTMLElement>('[data-music-play]')) {
    if (button.dataset.musicIndex !== undefined) continue;
    const suffix = button.dataset.musicLabel ?? '';
    button.setAttribute('aria-label', `${playing ? '暂停' : '播放'}${suffix}`);
  }
}

function announce(root: MusicRoot, message: string): void {
  const status = root.querySelector<HTMLElement>('[data-music-status]');
  if (status) status.textContent = message;
}

function showMeta(root: MusicRoot, track: MusicTrack): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-music-title]')) {
    element.textContent = track.title;
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-music-artist]')) {
    element.textContent = track.artist;
  }
  for (const image of root.querySelectorAll<HTMLImageElement>('[data-music-cover]')) {
    if (image.getAttribute('src') !== track.cover) image.src = track.cover;
    image.hidden = false;
  }
  const current = String(stateOf(root).index);
  for (const row of root.querySelectorAll<HTMLElement>('[data-music-row]')) {
    if (row.dataset.musicRowIndex === current) row.setAttribute('data-current', '');
    else row.removeAttribute('data-current');
  }
}

function showFailure(root: MusicRoot, failure: PlaybackFailure): void {
  const box = root.querySelector<HTMLElement>('[data-music-error]');
  if (box) {
    box.textContent = `${failure.title}。${failure.hint}`;
    box.hidden = false;
    // 失败提示落在折叠面板里时必须展开，否则用户点完播放只得到静音，看不到原因与回退链接
    const panel = box.closest('details');
    if (panel) panel.open = true;
  }
  setState(root, 'error');
  announce(root, `${failure.title}。${failure.hint}`);
}

function clearFailure(root: MusicRoot): void {
  const box = root.querySelector<HTMLElement>('[data-music-error]');
  if (!box) return;
  box.hidden = true;
  box.textContent = '';
}

/** 载入并播放指定曲目；失败只标记状态，不重试也不推进队列 */
async function playIndex(root: MusicRoot, index: number): Promise<void> {
  const state = stateOf(root);
  await readyOf(root);
  const track = state.tracks[index];
  if (!track) {
    showFailure(root, describePlaylistLoadFailure());
    return;
  }
  state.index = index;
  state.failed = false;
  clearFailure(root);
  state.audio.preload = 'auto';
  state.audio.src = trackStreamUrl(track.id);
  showMeta(root, track);
  setState(root, 'loading');
  state.audio.play().catch((error: unknown) => {
    if (state.failed) return; // error 事件已经给出失败态
    const name = error instanceof DOMException ? error.name : '';
    // 换源会中止上一次 play()，这不是失败
    if (name === 'AbortError') return;
    // 自动播放被拦截不属于媒体错误：回到静止态，等用户点击
    if (name === 'NotAllowedError') {
      setState(root, 'paused');
      announce(root, '浏览器拦下了这次自动播放，点击播放按钮继续。');
      return;
    }
    showFailure(root, describePlaybackFailure(state.audio.error?.code));
  });
}

async function toggle(root: MusicRoot): Promise<void> {
  const state = stateOf(root);
  await readyOf(root);
  if (state.tracks.length === 0) {
    showFailure(root, describePlaylistLoadFailure());
    return;
  }
  if (state.failed) {
    await playIndex(root, state.index);
    return;
  }
  if (!state.audio.getAttribute('src')) {
    await playIndex(root, state.index);
    return;
  }
  if (state.audio.paused) {
    setState(root, 'loading');
    state.audio
      .play()
      .catch(() => showFailure(root, describePlaybackFailure(state.audio.error?.code)));
  } else {
    state.audio.pause();
  }
}

async function step(root: MusicRoot, direction: 1 | -1): Promise<void> {
  const state = stateOf(root);
  await readyOf(root);
  const total = state.tracks.length;
  if (total === 0) {
    showFailure(root, describePlaylistLoadFailure());
    return;
  }
  const index =
    direction === 1 ? nextTrackIndex(state.index, total) : previousTrackIndex(state.index, total);
  await playIndex(root, index);
}

function bind(root: MusicRoot): void {
  if (root.dataset.musicReady === 'true') return;
  const audio = root.querySelector<HTMLAudioElement>('audio[data-music-audio]');
  if (!audio) return;

  const inline = readInlineTracks(root);
  const state: MusicState = {
    audio,
    tracks: inline,
    index: 0,
    failed: false,
    ready: inline.length > 0 ? Promise.resolve() : null,
  };

  root.__music = state;
  root.dataset.musicReady = 'true';

  audio.addEventListener('play', () => {
    const current = state.tracks[state.index];
    setState(root, 'playing');
    if (!current) return;
    announce(root, `正在播放 ${current.title} — ${current.artist}`);
    document.dispatchEvent(new CustomEvent(INTERRUPT_EVENT, { detail: { source: root } }));
  });

  audio.addEventListener('pause', () => {
    if (state.failed) return;
    setState(root, 'paused');
  });

  audio.addEventListener('loadedmetadata', () => {
    root.dataset.musicLoaded = 'true';
  });

  audio.addEventListener('ended', () => {
    // 单曲不循环；歌单按顺序推进。失败过的曲目不走这条路 —— 失败只等人来点。
    if (state.tracks.length <= 1) {
      setState(root, 'paused');
      return;
    }
    void playIndex(root, nextTrackIndex(state.index, state.tracks.length));
  });

  audio.addEventListener('error', () => {
    state.failed = true;
    showFailure(root, describePlaybackFailure(audio.error?.code));
  });

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest<HTMLElement>(MUSIC_TRIGGER_SELECTOR);
    if (trigger) void runTrigger(root, trigger);
  });
}

/** 控件 → 动作的唯一一张表：下拉懒加载补的动作与运行时自己的点击都走这里 */
function runTrigger(root: MusicRoot, trigger: HTMLElement): Promise<void> {
  if (trigger.dataset.musicIndex !== undefined) {
    const index = Number(trigger.dataset.musicIndex);
    if (!Number.isInteger(index)) return Promise.resolve();
    return playIndex(root, index);
  }
  if (trigger.matches('[data-music-next]')) return step(root, 1);
  if (trigger.matches('[data-music-prev]')) return step(root, -1);
  return toggle(root);
}

/** 首次交互后绑定页面上所有播放器：互斥逻辑只关心已绑定的那些 */
function bindAll(): void {
  for (const root of document.querySelectorAll<MusicRoot>('[data-music-player]')) {
    bind(root);
  }
}

/**
 * 懒加载入口：先绑定，再补上用户本来点的那一下。
 * 事件的默认行为已在 loader 里取消，这里补动作，避免「点一下没反应」。
 * trigger 为 null 表示只是提前绑定（例如展开 BGM 面板），不改变播放状态。
 */
export function activate(root: MusicRoot, trigger: HTMLElement | null): void {
  bindAll();
  if (!root.dataset.musicReady || !trigger) return;
  void runTrigger(root, trigger);
}

// 播放互斥：谁开始播放，谁让其它播放器停。暂停不派发事件，所以不会来回抖动。
document.addEventListener(INTERRUPT_EVENT, (event) => {
  const source = (event as CustomEvent<{ source?: Element }>).detail?.source;
  for (const root of document.querySelectorAll<MusicRoot>(
    '[data-music-player][data-music-ready="true"]',
  )) {
    if (root === source) continue;
    const state = root.__music;
    if (state && !state.audio.paused) state.audio.pause();
  }
});

bindAll();
document.addEventListener('astro:page-load', bindAll);
