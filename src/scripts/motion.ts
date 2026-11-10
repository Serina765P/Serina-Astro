// 动效层（slice 2）：分区入场 + 两个签名效果（hero 视差、文章行 tilt）。
//
// 与 ClientRouter 的关系：换页会清空 <html> 上的全部属性（见 src/scripts/bilibili.ts 的注释），
// 幂等标记不能挂 documentElement。这里不设全局哨兵，改用模块级的 teardown 闭包：
// 每次 astro:page-load 先拆掉上一轮的 IntersectionObserver / 指针与滚动监听，再按当前 DOM
// 重建。首次加载与每次换页因此走同一条路径，监听器不会随换页累积。
//
// 渐进增强：CSS 默认没有隐藏态。脚本确认 IntersectionObserver 可用后，才给 <html> 加
// data-motion="on"，隐藏初态才生效；脚本没跑（报错 / 被禁用）时页面保持完整可读。
//
// 所有效果只写 transform / opacity；prefers-reduced-motion: reduce 下隐藏态与位移全部关闭。

const SECTION_SELECTOR = '[data-motion]';
const ITEM_SELECTOR = '[data-motion-item]';
/** 同一分区内相邻条目的错位时长；封顶后并行，避免长列表末尾的条目等一秒才入场 */
const STAGGER_MS = 70;
const STAGGER_STEPS = 6;
const PARALLAX_LIMIT = 24;
const TILT_LIMIT = 4;

type Teardown = () => void;

let teardown: Teardown | null = null;

/**
 * 入场：分区内 heading → 文本 → 媒体（DOM 顺序），进入视口后只播一次。
 * 已经在视口里的条目直接标记为已入场 —— 脚本在 load 之后才跑，这时再隐藏一次就是可见的闪烁。
 */
function initReveal(): Teardown {
  const items = [...document.querySelectorAll<HTMLElement>(`${SECTION_SELECTOR} ${ITEM_SELECTOR}`)];
  if (items.length === 0) return () => {};

  for (const section of document.querySelectorAll<HTMLElement>(SECTION_SELECTOR)) {
    const sectionItems = [...section.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
    sectionItems.forEach((item, index) => {
      const step = Math.min(index, STAGGER_STEPS);
      item.style.setProperty('--motion-delay', `${step * STAGGER_MS}ms`);
    });
  }

  const viewport = window.innerHeight;
  for (const item of items) {
    if (item.getBoundingClientRect().top < viewport) item.classList.add('is-revealed');
  }

  const root = document.documentElement;
  root.dataset.motion = 'on';
  // 读一次布局，把隐藏初态先算出来；否则「隐藏 → 显示」在同一帧内完成，CSS 过渡不会启动
  void root.offsetHeight;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target as HTMLElement);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
  );

  function reveal(item: HTMLElement): void {
    item.classList.add('is-revealed');
    observer.unobserve(item);
  }

  for (const item of items) {
    if (!item.classList.contains('is-revealed')) observer.observe(item);
  }

  // 键盘 Tab 到还没入场的链接时先把它显形：opacity: 0 不脱离 tab 顺序，
  // 否则焦点会落在看不见的元素上（滚动本身也会触发 IO，但那是异步的下一帧）。
  const onFocus = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLElement>(ITEM_SELECTOR);
    if (item?.closest(SECTION_SELECTOR)) reveal(item);
  };
  document.addEventListener('focusin', onFocus);

  return () => {
    observer.disconnect();
    document.removeEventListener('focusin', onFocus);
    root.removeAttribute('data-motion');
  };
}

/** hero 视差：人像随首屏位置平移，上限 ±24px；55rem 以下（与容器断点一致）关闭。 */
function initParallax(): Teardown {
  const portrait = document.querySelector<HTMLElement>('[data-parallax]');
  const hero = portrait?.closest<HTMLElement>('section');
  if (!portrait || !hero) return () => {};

  const narrow = window.matchMedia('(max-width: 55rem)');
  let frame = 0;
  let applied = Number.NaN;

  const update = (): void => {
    frame = 0;
    if (narrow.matches) {
      if (applied !== 0) {
        portrait.style.removeProperty('transform');
        applied = 0;
      }
      return;
    }
    // 量首屏而不是人像本身：人像带着上一帧的 transform，拿它自己的矩形会形成反馈回路
    const rect = hero.getBoundingClientRect();
    const progress = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
    const offset = Math.max(
      -PARALLAX_LIMIT,
      Math.min(PARALLAX_LIMIT, -progress * PARALLAX_LIMIT * 2),
    );
    const next = Math.round(offset * 10) / 10;
    if (next === applied) return;
    applied = next;
    portrait.style.transform = `translate3d(0, ${next}px, 0)`;
  };

  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  return () => {
    if (frame !== 0) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    portrait.style.removeProperty('transform');
  };
}

/** 文章行 tilt：真实指针设备上随指针位置 rotateX / rotateY，上限 4°；(hover: none) 关闭。 */
function initTilt(): Teardown {
  if (window.matchMedia('(hover: none)').matches) return () => {};
  const rows = [...document.querySelectorAll<HTMLElement>('[data-tilt]')];
  if (rows.length === 0) return () => {};

  const cleanups: Teardown[] = [];

  for (const row of rows) {
    let frame = 0;
    let next = '';

    const apply = (): void => {
      frame = 0;
      row.style.transform = next;
    };

    const onMove = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;
      const rect = row.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      next =
        `perspective(900px) rotateX(${(-y * 2 * TILT_LIMIT).toFixed(2)}deg) ` +
        `rotateY(${(x * 2 * TILT_LIMIT).toFixed(2)}deg)`;
      if (frame === 0) frame = requestAnimationFrame(apply);
    };

    const reset = (): void => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      row.style.removeProperty('transform');
    };

    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerleave', reset);
    row.addEventListener('pointercancel', reset);

    cleanups.push(() => {
      if (frame !== 0) cancelAnimationFrame(frame);
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerleave', reset);
      row.removeEventListener('pointercancel', reset);
      row.style.removeProperty('transform');
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

function boot(): void {
  teardown?.();
  teardown = null;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  // 关掉动效时既不加隐藏态，也不注册指针 / 滚动效果
  if (reduce.matches || typeof IntersectionObserver === 'undefined') return;

  const cleanups = [initReveal(), initParallax(), initTilt()];
  teardown = () => {
    for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]();
  };
}

// 换页瞬间就拆掉旧监听：不等到 page-load，旧页面的 window 监听不会在新页面上多跑几百毫秒。
document.addEventListener('astro:before-swap', () => {
  teardown?.();
  teardown = null;
});

// 首次加载与每次换页后都只走这一条重建路径（ClientRouter 在 window load 时派发首次事件）
document.addEventListener('astro:page-load', boot);

// 这个文件没有 import/export，TypeScript 会把它当全局脚本，与 src/scripts/toc.ts 的
// 顶层 `teardown` 撞名（ts2451）。导出一个空对象把它钉成模块作用域 —— 不要删。
export {};
