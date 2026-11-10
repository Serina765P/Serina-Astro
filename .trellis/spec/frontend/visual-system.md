# Visual System

> 视觉层的单点规则：字号刻度、留白节奏、圆角与分隔、动效。所有值都在 `src/styles/global.css`，组件不得另造。

## 字号：五档，不新增

来自 `@theme`（`src/styles/global.css`），行高绑定在 `--text-*--line-height`：

| token | 值 | 用途 |
| --- | --- | --- |
| `--text-display` | `clamp(2.25rem, 5vw, 3.75rem)` | 首页 hero、各列表页 h1 |
| `--text-heading` | `1.875rem` | 分区 h2 |
| `--text-lead` | `1.25rem` | 列表行标题、卡片标题、条目标题 |
| `--text-base` | `1rem`（行高 1.75） | 正文、描述、按钮、导航 |
| `--text-note` | `0.8125rem` | 元信息、时间、chip、页脚 |

- 长中文标题（文章页 h1）用局部 `clamp(1.75rem, 3vw, 2.5rem)`，不套 display 档 —— 换行约束优先于刻度整齐（`src/layouts/PostLayout.astro`）。
- 不要再写 `text-xs` / `text-sm` / `text-lg` / `text-[0.95rem]`。新增档位前先证明现有五档无法表达。
- 正文内部的 h2 / h3 走 `@tailwindcss/typography` 的相对刻度（1.5em / 1.25em），也不并入五档。
- 五档管的是页面级 chrome 与常规正文。以下密集 UI 保留局部字号，不并入五档：正文代码块（`.astro-code` 14px、语言标签 10.9px）、TOC 侧栏条目与移动端 pill（14px）、emoji 图鉴的短代码标签（11.7px）与图鉴网格、说说时间线的元信息（12–15.2px）、首屏竖排装饰字（`aria-hidden`，窄屏 1.2–1.6rem）、MilliPachi 小游戏（组件自带 `<style is:inline>`）、标签云的连续字号（「热度」信息）。
- 正文不得小于 16px；页面 chrome 的可读文字不得小于 13px。上面这些密集 UI 里既有的小字是待归并项，新增代码不得再扩大这个范围。

## 留白与量度

- `--space-section`（`clamp(3rem, 6vw, 5.5rem)`）只用于**分区之间**。分区内部的标题→内容间距必须明显更小（约 1.75rem），行与行之间靠 `padding-block` 而不是 `gap`。
- `--measure`（`36em`）约束 `.prose` 行宽。文章面板取 46rem 并居中，正文列与标题/元信息共用一条左边缘（`src/layouts/PostLayout.astro` 的注释给了实测数字）；不要只居中正文，那会让标题与正文错开。面板右侧的量度余宽（1440 宽 80px）是行尾留白，不是第二列。
- 页面宽度只经 `<Container>`；锚点偏移只在 `global.css` 的 `[id]` 规则里定义。

## 圆角、阴影、分隔

- 圆角二选一：卡片与媒体 `0`，chip / 胶囊 `9999px`。禁止 9–16px 的「软圆角」中间档。
- 静止元素不加 `box-shadow`；`--shadow-media` 只留给真正叠在别的像素上的素材（灯箱、专辑封面）。
- 分区不靠 1px 描边或渐变分隔：用留白、`--surface` / `--bg` 的色阶差，或一次整块换底色。
- 卡片 recipe 只有 `@utility card-surface` / `card-lift` 一份；`Card.astro` 与脚本里的搜索结果 li 共用它。
- 渐变一律不用（包括按钮与文字）。照片上的中性压暗遮罩是唯一例外。

## 动效

`src/scripts/motion.ts`，由 `BaseLayout.astro` 引入：

- 只在 `astro:page-load` 上重建（ClientRouter 首次加载与每次换页都派发）。换页会清空 `<html>` 的属性，跨页去重不能靠 `documentElement.dataset.*`：用 `document` 上的标记（`src/scripts/bilibili.ts`）或模块级 teardown 闭包。
- 渐进增强：CSS 默认可见，脚本确认 `IntersectionObserver` 可用后才给 `<html>` 加 `data-motion="on"`。
- 只写 `transform` / `opacity`；`prefers-reduced-motion: reduce` 下位移与隐藏态全部关闭。
- 分区入场用 `data-motion`（容器）+ `data-motion-item`（条目）；新页面要入场就在容器上加这两个属性。

## 闸门

| 命令 | 覆盖 |
| --- | --- |
| `node scripts/contrast-audit.mjs` | token 对比度（正文 4.5、大字 3.0） |
| `inspect.mjs`（design-taste-frontend） | 1440/768/390 三宽度实测：字号档数、行宽、外边距、分隔线、渐变、阴影、动效数 |

`inspect.mjs` 在本机需要 `CHROME_PATH` 指向带 `--no-sandbox` 的 Chromium 包装脚本（root 环境）：

```bash
export CHROME_PATH=$HOME/.local/bin/chrome-nosandbox
node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4398 &
node /root/.agents/skills/design-taste-frontend/scripts/inspect.mjs http://127.0.0.1:4398/ --out .taste-skill/check
```

三条已知误报，复测时直接 `allow` 并写明理由：

- `mono` —— CJK 全角字宽让启发式把 `IBM Plex Sans SC` 判成等宽。
- `font-fallback` —— 字体从 CDN 加载，探针可能在字体就绪前取样（用 `document.fonts.check` 复核）。
- `off-centre` —— `scrollbar-gutter: stable` 预留的 15px gutter 造成的左右差，容器在滚动区内是居中的。
