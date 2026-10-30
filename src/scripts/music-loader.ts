// 音乐播放器的懒加载外壳：只做一件事 —— 首次点击播放类按钮时再拉运行时。
//
// 为什么：Video.js 运行时（含本地化）≈ 26KB gzip，全站每页都加载不值得；BGM 又是
// 「手动启动」的产品约束，第一次点击之前不需要它。这里不碰 UI，只做事件委托 +
// 一次性 import，然后把用户本来点的那一下交给运行时补执行。
import { MUSIC_TRIGGER_SELECTOR } from './music-contract';

function bindLoader(): void {
  const html = document.documentElement;
  if (html.dataset.musicLoaderBound === 'true') return;
  html.dataset.musicLoaderBound = 'true';

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest<HTMLElement>(MUSIC_TRIGGER_SELECTOR);
    if (!trigger) return;
    const player = trigger.closest<HTMLElement>('[data-music-player]');
    if (!player || player.dataset.musicReady === 'true') return;

    event.preventDefault();
    void import('./music').then((module) => module.activate(player, trigger));
  });

  // 展开 BGM 面板本身就是使用意图：这时就把运行时拉起来，面板里的时间轴/静音才是活的。
  // toggle 不冒泡，只能在捕获阶段监听。
  document.addEventListener(
    'toggle',
    (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const player = details.closest<HTMLElement>('[data-music-player]');
      if (!player || player.dataset.musicReady === 'true') return;
      void import('./music').then((module) => module.activate(player, null));
    },
    true,
  );
}

bindLoader();
document.addEventListener('astro:page-load', bindLoader);
