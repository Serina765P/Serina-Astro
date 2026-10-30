// B 站官方播放器运行时：点击入口后才插入第三方 iframe。
//
// 为什么不是页面打开就渲染 iframe（issue #9）：
// · 跨源 iframe 的内部播放状态不可读，父页面拿不到「开始播放」事件，所以只能在用户
//   点击我们自己的入口时派发 music:interrupt；页面一打开就嵌入反而没有可观察的点击点。
// · 点击后才插入 → 页面打开时对 player.bilibili.com 的请求是 0 条，比 loading="lazy"
//   更彻底；iframe 自身仍带 loading="lazy" 属性。
// · BGM 暂停后不会自动恢复：music:interrupt 契约见 src/scripts/music-contract.ts。
//
// 失败判定只有超时一条路：iframe 的 load 事件在跨源导航（含错误页）上都会触发，
// 拿不到 HTTP 状态；而请求被阻断时 load 可能永远不来。超时后换成带原视频链接的
// 失败提示。已知不能识别的情况（播放器返回禁止嵌入页）在验收文档里注明。
//
// ClientRouter：事件委托挂在 document 上，导航后新增的组件照样可用。守卫挂在
// Document 对象上而不是 <html> 的 data 属性：Astro 换页时会清空 documentElement 的
// 全部属性（swap-functions 的 swapRootAttributes），dataset 守卫撑不过一次导航。

import { MUSIC_INTERRUPT_EVENT } from './music-contract';

const LOAD_TIMEOUT_MS = 10_000;

const TRIGGER_SELECTOR = '[data-bilibili-play]';
const ROOT_SELECTOR = '[data-bilibili-embed]';
const FRAME_CLASS = 'absolute inset-0 size-full border-0';

function mountEmbed(root: HTMLElement, trigger: HTMLElement): void {
  if (root.dataset.state !== 'facade') return;
  const src = root.dataset.bilibiliSrc;
  const title = root.dataset.bilibiliTitle;
  if (!src || !title) return;

  const stage = root.querySelector<HTMLElement>('[data-bilibili-stage]');
  if (!stage) return;

  root.dataset.state = 'loading';
  // 入口被播放器取代前先把焦点交给舞台，键盘用户不会掉回文档开头
  stage.focus({ preventScroll: true });
  trigger.remove();

  // issue #9 / #12：跨源 iframe 只能在点击的这一刻派发中断。
  // source 传自己的根节点，避免未来组件内自带播放器时停到自己。
  document.dispatchEvent(new CustomEvent(MUSIC_INTERRUPT_EVENT, { detail: { source: root } }));

  const status = root.querySelector<HTMLElement>('[data-bilibili-status]');
  const failure = root.querySelector<HTMLElement>('[data-bilibili-error]');
  if (status) status.textContent = `正在加载 ${title} 的播放器…`;

  const frame = document.createElement('iframe');
  frame.className = FRAME_CLASS;
  // 点击入口本身是用户手势：iframe 加载后直接播放。标记里的 URL 仍保持 autoplay=0
  // （语义是“页面打开不自动播”），只有用户主动点开时才换成 1。
  frame.src = src.replace('autoplay=0', 'autoplay=1');
  frame.title = title;
  frame.loading = 'lazy';
  frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';

  let settled = false;
  const timer = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    frame.remove();
    root.dataset.state = 'error';
    if (status) status.textContent = 'B 站播放器加载超时，请通过原视频链接前往 B 站观看。';
    if (failure) failure.hidden = false;
  }, LOAD_TIMEOUT_MS);

  frame.addEventListener('load', () => {
    // 超时后迟到的 load 不再把失败态翻回正常态
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    root.dataset.state = 'loaded';
    if (status) status.textContent = `B 站播放器已加载：${title}`;
  });

  stage.append(frame);
}

function onClick(event: MouseEvent): void {
  // 只接管普通左键点击：Ctrl/Cmd/Shift/Alt 点击与中键继续走原视频链接
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) return;
  const trigger = target.closest<HTMLElement>(TRIGGER_SELECTOR);
  const root = trigger?.closest<HTMLElement>(ROOT_SELECTOR);
  if (!trigger || !root) return;
  event.preventDefault();
  mountEmbed(root, trigger);
}

const guardedDocument = document as Document & { __bilibiliClickBound?: boolean };
if (!guardedDocument.__bilibiliClickBound) {
  guardedDocument.__bilibiliClickBound = true;
  document.addEventListener('click', onClick);
}
