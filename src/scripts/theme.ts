// 主题运行时（亮/暗）：落盘覆写写进 <meta name="color-scheme">，CSS 用
// :root:has(> head > meta[content="dark"]) 把 meta 映射成 color-scheme，light-dark() token 随动。
//
// 数据模型三态（dark-mode-toggle 指南）：无落盘值 = 跟随系统；"light" / "dark" = 钉住。
// 双态按钮显示「当前渲染态的反面动作」；点击后若目标正好等于系统偏好，说明用户是在撤销
// 调整，于是删掉落盘值而不是存下它 —— 否则会把方案悄悄钉死，系统随日出日落切换时不再跟随。
//
// ClientRouter：Astro 换页会清空 documentElement 的全部属性（swapRootAttributes），
// 所以幂等守卫挂 Document 对象而不是 <html>；事件委托与媒体查询监听因此只绑一次。
// 首帧的 meta 与 .dark 镜像由 BaseHead 的内联脚本同步落一次，本模块只做后续同步。

const STORAGE_KEY = 'theme';
const SCHEME_META = 'meta[name="color-scheme"]';
const THEME_COLOR_META = 'meta[name="theme-color"]';
const GISCUS_ORIGIN = 'https://giscus.app';

type Scheme = 'light' | 'dark';

interface ThemeDocument extends Document {
  __serinaThemeBound?: boolean;
}

/** 落盘覆写；读不到（隐私模式等）时按未设置处理 */
function readStored(): Scheme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemScheme(): Scheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 当前实际渲染的配色：落盘值优先，否则跟随系统 */
export function renderedScheme(): Scheme {
  return readStored() ?? systemScheme();
}

function writeMeta(content: Scheme | 'light dark'): void {
  document.querySelector(SCHEME_META)?.setAttribute('content', content);
}

/**
 * 解析 --bg 的实际颜色：自定义属性保存的是 token 流（light-dark(...)），不能直接写进
 * theme-color；借一个无 transition 的探针让浏览器解析。读 body 会读到过渡插值色
 * （body 有 transition-colors），所以不用 body。
 */
function resolvedBg(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!raw) return ''; // 样式表还没生效：保持 theme-color 的静态默认
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;color:var(--bg)';
  document.documentElement.append(probe);
  const bg = getComputedStyle(probe).color;
  probe.remove();
  return bg;
}

function syncThemeColor(): void {
  const bg = resolvedBg();
  if (bg) {
    for (const meta of document.querySelectorAll(THEME_COLOR_META)) {
      meta.setAttribute('content', bg);
    }
  }
  // giscus 是跨源 iframe，主题只能显式推送（data-theme / postMessage 是它唯一的口子）
  const theme = renderedScheme();
  for (const frame of document.querySelectorAll<HTMLIFrameElement>('iframe.giscus-frame')) {
    frame.contentWindow?.postMessage({ giscus: { setConfig: { theme } } }, GISCUS_ORIGIN);
  }
}

/** 把当前配色落到 DOM：meta（CSS 的 color-scheme 真值源）、.dark 镜像、浏览器 chrome 色、评论 iframe */
export function applyTheme(): void {
  writeMeta(readStored() ?? 'light dark');
  document.documentElement.classList.toggle('dark', renderedScheme() === 'dark');
  syncThemeColor();
}

/** 双态切换：目标是当前渲染态的反面；与系统一致时删掉落盘值，回到跟随系统 */
export function toggleTheme(): void {
  const target: Scheme = renderedScheme() === 'dark' ? 'light' : 'dark';
  try {
    if (target === systemScheme()) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, target);
  } catch {
    /* 存储被阻止时仍切换本次显示，只是记不住 */
  }
  applyTheme();
}

/** 绑定全局监听（只绑一次），并在每次换页后重新同步 */
export function initTheme(): void {
  const binding = document as ThemeDocument;
  applyTheme();
  if (binding.__serinaThemeBound) return;
  binding.__serinaThemeBound = true;

  // 系统偏好随时可能变（不少系统按日出日落切换）：只有没落盘值时页面才跟它走
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!readStored()) applyTheme();
  });
  // 其它标签页改了覆写：storage 事件只在「别的文档」里触发
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) applyTheme();
  });
  // 换页会清掉 <html> 的属性、把 head 换回服务端 HTML：swap 后重新落一次
  document.addEventListener('astro:after-swap', applyTheme);
  // 首帧内联脚本已同步主题，但 theme-color 要等样式表生效才读得到 --bg
  document.addEventListener('astro:page-load', applyTheme);
}
