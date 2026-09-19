// 目录（TOC）的滚动联动运行时。
//
// 机制移植自 mediawiki-skins-Citizen（resources/skins.citizen.toc/），去掉了它依赖的
// MediaWiki 运行时（mw.util.* / mustache / VE 钩子）——那部分是 wiki 平台胶水，静态站不需要。
// 保留下来的判定逻辑与那边同口径：
//
// · sectionObserver：scroll 事件只负责节流触发，矩形计算交给 IntersectionObserver
//   （离主线程、不强制同步布局）；每次只求「视口覆盖的标题区间」，且与上次的激活集合
//   完全一致时不回调。视口内有多根标题时是**区间**而不是单点，长节里高亮才不会僵住。
// · 指示条：在当前激活区间首尾两个链接之间拉一条线，走 translateY + scaleY 合成到 GPU，
//   所以它既不触发重排，过渡也不会掉帧。
// · 点击目录链接或 hash 变化后暂停 spy 若干帧再恢复（照抄 Vector 的 T297614 处理）：
//   平滑滚动期间不能让 spy 抢先把高亮改到别的节上去。
// · 目录容器自身跟随当前项滚动（阈值 100px，滚到容器中点），长目录里当前节不会跑出视野。
//
// 读写分离：先改类名，下一帧统一把各 root 的「度量」批量做完，再统一「应用」，
// 中间不夹几何读取，避免逐 root 交替读写造成的强制同步布局。

const SCROLL_THROTTLE_MS = 200;
const RESIZE_DEBOUNCE_MS = 200;
const RESUME_AFTER_FRAMES = 3;
/** 当前项离容器边缘不足这个距离时，就把容器滚过去 */
const FOLLOW_HIDDEN_THRESHOLD = 100;
/** 取不到 scroll-padding-top 时的兜底阈值（Vector 的默认值） */
const FALLBACK_TOP_MARGIN = 75;
const DEFAULT_LABEL = '本文目录';

interface TocRoot {
  el: HTMLElement;
  /** 目录内容的滚动容器（侧栏形态下是真实滚动区，卡片形态下是上拉卡片） */
  panel: HTMLElement;
  /** 指示条的定位参照，position: relative */
  contents: HTMLElement | null;
  indicator: HTMLElement | null;
  /** 移动卡片上显示当前节名的那一行 */
  current: HTMLElement | null;
  details: HTMLDetailsElement | null;
  /** slug → 目录项，构建期索引，避免每次都做一次线性查找 */
  byId: Map<string, HTMLElement>;
}

interface IndicatorMetrics {
  hide: boolean;
  top: number;
  height: number;
  unit: number;
}

interface FollowMetrics {
  hiddenTop: number;
  hiddenBottom: number;
  midpoint: number;
  scrollTop: number;
}

interface SectionObserver {
  calcIntersection: () => void;
  pause: () => void;
  resume: () => void;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function debounce(fn: () => void, wait: number): () => void {
  let timer = 0;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, wait);
  };
}

/** 与 Vector/Citizen 同源：用文档的 scroll-padding-top 当视口上沿阈值 */
function getTopMargin(): number {
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('scroll-padding-top');
  return Number.parseInt(raw, 10) || FALLBACK_TOP_MARGIN;
}

function readRoot(el: HTMLElement): TocRoot {
  const panel = el.querySelector<HTMLElement>('[data-toc-panel]') ?? el;
  const byId = new Map<string, HTMLElement>();
  for (const item of el.querySelectorAll<HTMLElement>('[data-toc-item]')) {
    const id = item.dataset.tocId;
    if (id) byId.set(id, item);
  }
  return {
    el,
    panel,
    contents: el.querySelector<HTMLElement>('[data-toc-contents]'),
    indicator: el.querySelector<HTMLElement>('[data-toc-indicator]'),
    current: el.querySelector<HTMLElement>('[data-toc-current]'),
    details: el.querySelector<HTMLDetailsElement>('[data-toc-details]'),
    byId,
  };
}

/**
 * 观察正文标题：scroll 只用来节流触发，真正的矩形计算交给 IntersectionObserver。
 * 回调里拿到的是「自视口上沿最近的一根标题」到「最后一根进入视口下沿的标题」这一整段。
 */
function createSectionObserver(
  elements: HTMLElement[],
  onIntersection: (ids: string[]) => void,
): SectionObserver {
  const topMargin = getTopMargin();
  let timeoutId = 0;
  let currentIds: string[] = [];

  const observer = new IntersectionObserver((entries) => {
    if (entries.length === 0) return;

    const sorted = entries
      .slice()
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

    // 分界点：视口上沿之上最靠下的一根，就是当前区间的起点
    const above = sorted.filter((entry) => entry.boundingClientRect.top - topMargin <= 0);
    const below = sorted.filter((entry) => entry.boundingClientRect.top - topMargin > 0);
    const startIdx =
      above.length > 0 ? sorted.indexOf(above[above.length - 1]) : sorted.indexOf(below[0]);

    // 终点：最后一根顶部还在视口内的标题；从起点起算，保证区间至少含一项
    let endIdx = startIdx;
    for (let i = startIdx; i < sorted.length; i++) {
      if (sorted[i].boundingClientRect.top < window.innerHeight) endIdx = i;
    }

    const activeIds = sorted
      .slice(startIdx, endIdx + 1)
      .map((entry) => (entry.target as HTMLElement).id);

    if (!sameIds(activeIds, currentIds)) onIntersection(activeIds);
    currentIds = activeIds;

    // 我们观察的是散落的标题、外面没有共同的包裹元素，所以不能靠 IntersectionObserver
    // 自己判断「谁进了视口」。这里只借它异步算一次矩形，算完立刻断开，
    // 下一次滚动到点后再重新观察。
    observer.disconnect();
  });

  function calcIntersection(): void {
    for (const element of elements) {
      if (element.parentNode) observer.observe(element);
    }
  }

  function handleScroll(): void {
    if (timeoutId) return;
    timeoutId = window.setTimeout(() => {
      calcIntersection();
      timeoutId = 0;
    }, SCROLL_THROTTLE_MS);
  }

  function pause(): void {
    window.removeEventListener('scroll', handleScroll);
    window.clearTimeout(timeoutId);
    timeoutId = 0;
    currentIds = [];
  }

  function resume(): void {
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  resume();
  return { calcIntersection, pause, resume };
}

function initToc(): (() => void) | null {
  const rootEls = [...document.querySelectorAll<HTMLElement>('[data-toc-root]')];
  if (rootEls.length === 0) return null;

  // 目录链接指向的正文标题（两个 root 指向同一批锚点，去重）
  const slugs = new Set<string>();
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')) {
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('#') && href.length > 1) slugs.add(href.slice(1));
  }
  const headings = [...slugs]
    .map((slug) => document.getElementById(slug))
    .filter((el): el is HTMLElement => el !== null);
  if (headings.length === 0) return null;

  const roots = rootEls.map(readRoot);

  const controller = new AbortController();
  const { signal } = controller;

  function syncToggle(item: HTMLElement): void {
    const button = item.querySelector<HTMLElement>('[data-toc-toggle]');
    if (button) button.setAttribute('aria-expanded', String(item.classList.contains('is-open')));
  }

  /** 目录项的直接宿主项（顶层项返回 null） */
  function parentItemOf(item: HTMLElement): HTMLElement | null {
    return item.parentElement?.closest<HTMLElement>('[data-toc-item]') ?? null;
  }

  /** 让某个目录项在折叠态下可见：从它自己一路向上，把整条祖先链展开 */
  function expandFor(root: TocRoot, slug: string): void {
    let current = root.byId.get(slug) ?? null;
    while (current) {
      if (!current.classList.contains('is-open')) {
        current.classList.add('is-open');
        syncToggle(current);
      }
      current = parentItemOf(current);
    }
  }

  /**
   * 把「已经离开」的一级节收回去。
   *
   * Citizen 原版只展开不收起：一篇长文滚到底，访问过的节会全部开着，折叠就形同虚设。
   * 这里补上收起，但只收脚本自己展开的那些 —— 读者手动点开的节会打上 pinned 记号，
   * 滚动不去动它，免得把人自己的操作抢走。
   */
  function collapseInactive(root: TocRoot): void {
    for (const item of root.el.querySelectorAll<HTMLElement>('.toc-item.is-open')) {
      // 只管一级节：把它收起来，整棵子树就都不可见了
      if (parentItemOf(item)) continue;
      if (item.dataset.tocPinned === 'true') continue;
      if (item.querySelector('.toc-item.is-active')) continue;
      item.classList.remove('is-open');
      syncToggle(item);
    }
  }

  function activeLinks(root: TocRoot): HTMLElement[] {
    const links: HTMLElement[] = [];
    // querySelectorAll 给的是文档序，所以首尾就是指示条要覆盖的区间端点
    for (const item of root.el.querySelectorAll<HTMLElement>('.toc-item.is-active')) {
      const link = item.querySelector<HTMLElement>('.toc-link');
      // 折叠中被隐藏的项 offsetParent 为 null，不参与度量
      if (link && link.offsetParent !== null) links.push(link);
    }
    return links;
  }

  function measureIndicator(root: TocRoot): IndicatorMetrics | null {
    if (!root.indicator || !root.contents) return null;
    const links = activeLinks(root);
    if (links.length === 0) return { hide: true, top: 0, height: 0, unit: 0 };

    const contentsRect = root.contents.getBoundingClientRect();
    const firstRect = links[0].getBoundingClientRect();
    const lastRect = links[links.length - 1].getBoundingClientRect();
    if (firstRect.height <= 0) return { hide: true, top: 0, height: 0, unit: 0 };

    return {
      hide: false,
      top: firstRect.top - contentsRect.top,
      height: lastRect.bottom - firstRect.top,
      unit: firstRect.height,
    };
  }

  function applyIndicator(root: TocRoot, metrics: IndicatorMetrics | null): void {
    if (!metrics || !root.indicator) return;
    if (metrics.hide) {
      root.indicator.style.setProperty('--toc-indicator-scale', '0');
      return;
    }
    // 行高作基准，高度换算成 scaleY —— 只改 transform，不碰 layout
    root.indicator.style.setProperty('--toc-unit-height', `${metrics.unit}px`);
    root.indicator.style.setProperty('--toc-indicator-top', `${metrics.top}px`);
    root.indicator.style.setProperty(
      '--toc-indicator-scale',
      String(metrics.height / metrics.unit),
    );
  }

  function measureFollow(root: TocRoot): FollowMetrics | null {
    const scroller = root.panel;
    if (scroller.scrollHeight <= scroller.clientHeight) return null;
    const link = activeLinks(root)[0];
    if (!link) return null;

    const scrollerRect = scroller.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    return {
      midpoint: scrollerRect.height / 2,
      hiddenTop: scrollerRect.top - linkRect.top,
      // 目录底部可能探出视口，取 min 才是它真正开始被遮住的位置
      hiddenBottom: linkRect.bottom - Math.min(scrollerRect.bottom, window.innerHeight),
      scrollTop: scroller.scrollTop,
    };
  }

  function applyFollow(root: TocRoot, metrics: FollowMetrics | null): void {
    if (!metrics) return;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    // 一路累加到同一个目标值上，不在两次调整之间回头读 scrollTop
    let target = metrics.scrollTop;
    if (metrics.hiddenTop + FOLLOW_HIDDEN_THRESHOLD > 0) {
      target -= metrics.hiddenTop + metrics.midpoint;
      root.panel.scrollTo({ top: target, behavior });
    }
    if (metrics.hiddenBottom + FOLLOW_HIDDEN_THRESHOLD > 0) {
      target += metrics.hiddenBottom + metrics.midpoint;
      root.panel.scrollTo({ top: target, behavior });
    }
  }

  function updateCurrentLabel(root: TocRoot): void {
    if (!root.current) return;
    const text = root.el
      .querySelector<HTMLElement>('.toc-item.is-active .toc-text')
      ?.textContent?.trim();
    root.current.textContent = text || DEFAULT_LABEL;
  }

  /** 先写类名；几何度量留到下一帧统一做，避免写读交替导致强制同步布局 */
  function render(ids: string[]): void {
    const active = new Set(ids);

    for (const root of roots) {
      for (const item of root.el.querySelectorAll<HTMLElement>('[data-toc-item]')) {
        const isActive = item.dataset.tocId !== undefined && active.has(item.dataset.tocId);
        item.classList.toggle('is-active', isActive);
        const link = item.querySelector<HTMLElement>('.toc-link');
        if (!link) continue;
        if (isActive) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
      // 当前节所在的那条链展开，其余一级节收回去
      for (const slug of ids) expandFor(root, slug);
      collapseInactive(root);
      updateCurrentLabel(root);
    }

    window.requestAnimationFrame(() => {
      const jobs = roots.map((root) => ({
        root,
        indicator: measureIndicator(root),
        follow: measureFollow(root),
      }));
      for (const job of jobs) {
        applyIndicator(job.root, job.indicator);
        applyFollow(job.root, job.follow);
      }
    });
  }

  const observer = createSectionObserver(headings, render);

  /**
   * 点击目录链接、或 hash 变化之后，浏览器要做平滑滚动。滚动途中不能让 spy 抢先
   * 把高亮改到别的节，所以先暂停，等浏览器画完若干帧（Firefox 实测最多 3 帧）再恢复。
   */
  function resumeAfterScroll(): void {
    observer.pause();
    let frames = RESUME_AFTER_FRAMES;
    const step = (): void => {
      if (frames-- > 0) {
        window.requestAnimationFrame(step);
        return;
      }
      observer.resume();
      observer.calcIntersection();
    };
    window.requestAnimationFrame(step);
  }

  function closeCards(): void {
    for (const root of roots) {
      if (root.details?.open) root.details.open = false;
    }
  }

  function recompute(): void {
    const jobs = roots.map((root) => ({
      root,
      indicator: measureIndicator(root),
      follow: measureFollow(root),
    }));
    for (const job of jobs) {
      applyIndicator(job.root, job.indicator);
      applyFollow(job.root, job.follow);
    }
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const toggle = target.closest<HTMLElement>('[data-toc-toggle]');
      if (toggle) {
        event.preventDefault();
        const item = toggle.closest<HTMLElement>('[data-toc-item]');
        if (!item) return;
        const opened = item.classList.toggle('is-open');
        // 手动展开的节挂上记号：滚动离开时自动收起不去碰它
        if (opened) item.dataset.tocPinned = 'true';
        else delete item.dataset.tocPinned;
        syncToggle(item);
        // 折叠改变了列表高度，指示条端点跟着变
        window.requestAnimationFrame(recompute);
        return;
      }

      const link = target.closest<HTMLElement>('[data-toc-link]');
      if (link) {
        // 锚点交给浏览器原生处理：hash 照常更新、scroll-margin-top 照常生效
        closeCards();
        resumeAfterScroll();
      }
    },
    { signal },
  );

  window.addEventListener(
    'hashchange',
    () => {
      const id = window.location.hash.slice(1);
      if (id) {
        for (const root of roots) expandFor(root, id);
      }
      resumeAfterScroll();
    },
    { signal },
  );

  window.addEventListener(
    'resize',
    debounce(() => observer.calcIntersection(), RESIZE_DEBOUNCE_MS),
    { signal, passive: true },
  );

  // 首屏激活延到 idle：这时候字体与主题类都已落定，度量出来的行高基准才是最终值
  const boot = (): void => {
    const hash = window.location.hash.slice(1);
    for (const root of roots) {
      if (hash) expandFor(root, hash);
    }
    const hashHeading = hash ? document.getElementById(hash) : null;
    // 带 hash 且已经停在页底时，spy 会算出别的节，此时以 hash 指向的节为准（T325086）
    if (
      hashHeading &&
      Math.round(window.innerHeight + window.scrollY) >= document.body.scrollHeight
    ) {
      render([hash]);
      return;
    }
    observer.calcIntersection();
  };

  // typeof 检查而不是 'requestIdleCallback' in window：后者会让 TS 把 else 分支
  // 的 window 收窄成 never（因为 Window 类型上本来就声明了该方法）
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(boot, { timeout: 3000 });
  } else {
    window.setTimeout(boot, 1);
  }

  return () => {
    controller.abort();
    observer.pause();
  };
}

let teardown: (() => void) | null = null;

/** 换页后 DOM 被替换，旧实例的观察目标全部脱离文档，必须整体重建 */
function mount(): void {
  teardown?.();
  teardown = initToc();
}

document.addEventListener('astro:before-swap', () => {
  teardown?.();
  teardown = null;
});

// 模块脚本不会因 ClientRouter 换页重跑，所以重建只能靠这个事件
document.addEventListener('astro:page-load', mount);

mount();
