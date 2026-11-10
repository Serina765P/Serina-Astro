# 文章排版、表格、字体与界面文案修订

## Goal

修四个已确认的缺陷：文章正文与面板过窄、TOC 折叠按钮折行、表格圆角与列宽失真、正文自托管字体过重；并按 Humanizer 的 26 条规则对界面文案做一次保守修订（不动用户手写的内容）。

## Background

用户在真实阅读中提出的四个问题，逐条已在代码与浏览器里复现。

## Confirmed Facts

- 文章面板 `src/layouts/PostLayout.astro` 的 `.post-panel { max-width: 46rem }`（736px），正文 `--measure: 36em`（576px）。1440 宽实测：文章栏 888px、面板 736px、内容盒 656px、正文 576px，正文右侧固定留 80px。
- TOC 折行可复现：1440 宽下 `.toc-item` 里长标题的 `.toc-link` 宽 312px，`.toc-toggle` 的 `top` 比链接低 29px（第二行）。根因是 `src/components/TocTree.astro:73` 的 `flex-wrap: wrap` + `.toc-link { flex-grow: 1 }`（basis auto）：链接吃满整行后把按钮挤下去。
- 表格：`.prose.prose table` 是 `border-radius: 1rem` + `font-size: 0.9em`（实测 14.4px），与全站 0 圆角、五档字号不一致。`mltd-appellations-statistics` 里同类表格实测列宽 52 / 71 / 64 / **387** px（4 列）—— 最后一列的 `Akane-Commu/013_card_blst_023aka0624.md#L107` 这类无空格长串抬高 min-content，把前三列压到 52–71px。改动后 5.1 表（5 列）为 89 / 83 / 95 / 118 / 251。
- 字体：正文 IBM Plex Sans SC 由 `BaseLayout.astro` 引入 1 个 preconnect + 4 个 CDN 样式表；hero 的朝华明朝体已是本地子集（`public/fonts/hero-mincho.css`），不依赖 CDN。
- Humanizer 是 agent skill（`SKILL.md`，MIT），不是 npm 包。已安装到 `/root/.agents/skills/humanizer/SKILL.md`。
- 界面文案清点：`src/{components,layouts,pages}` + `site.config.ts` 共 164 条唯一中文串。

## Requirements

### R1 — 正文与面板宽度

`--measure` 从 36em 提到 40em（640px，每行约 40 个汉字）；`.post-panel` 从 46rem 提到 52rem（832px）。面板内的标题、元信息、正文共用同一条 640px 文本列并水平居中，不再出现「正文贴左、右侧 112px 空白」的参差。1024 宽（有 TOC）不得溢出。

### R6 — 宽屏框架（≥1600）

主设计宽度改为 1920。在 `min-width: 1600px` 下：`--container-wide` 72rem → **80rem**（1280），`--container-standard` 64rem → **72rem**（1152），文章栏 `max-w-4xl` → **`max-w-5xl`**（1024）。阅读列宽不变（仍 40em）—— 宽屏放大的是页面框架，不是行宽。1440 及以下完全不变。

### R2 — TOC 折叠按钮

长标题下 `.toc-toggle` 必须与链接同一行、贴右；子目录仍整行折到下一行。1440 / 1024 两宽度验证。

### R3 — 表格

圆角改 0，字号并入正文档（`1em`）；长无空格串可断行，列宽按内容分配，5.1 表的前三列不得小于约 80px。移动端保持横滑。

### R4 — 字体轻量化

移除正文的 4 个 CDN 样式表与 preconnect，`--font-sans` 改系统字体栈（覆盖 macOS / Windows / Linux / Android 的 CJK 回退）；hero 的本地子集保留。

### R5 — 界面文案

用 Humanizer 的 26 条规则逐条核对 164 条界面串，保守修订：只动命中「铺垫、总结式收尾、拔高意义、装饰性加粗、强行三段式、破折号串联」等真实 AI 味的句子，保留现有语气。不改用户手写内容。

## Acceptance Criteria

- [x] AC1 1920/1440 正文 640px、1024 为 625px，五档宽度横向溢出均为 0；1920 面板占屏宽 43.3%。
- [x] AC2 三档宽度实测 `toggleTop − linkTop = 2px`。
- [x] AC3 圆角 0、16px；5.1 表前三列 89/83/95px；390 宽表格内部横滑、页面溢出 0。
- [x] AC4 三条路由的 zeoseven 请求均为 0；系统栈生效；hero 子集 10 个 woff2 仍加载。
- [x] AC5 `research/copy-audit.md`：164 条分组判定，2 处改动带前后对照。
- [x] AC6 四条闸门全绿；对比度审计「全部通过」。
- [x] AC7 五档全部跑过 `inspect.mjs`，数字记在 `research/baseline.md`。

## Out of Scope

- 文章正文、说说内容、表情名与短代码、标签名、`SITE.tagline`、MilliPachi 小游戏的台词（主题化文案，保留）。
- 信息架构、路由、内容 schema。
- 重新设计字体排印比例（字号五档不变）。

## Technical Notes

- 正文宽度改动会同时影响 `/about/`、`/links/` 等使用 `prose` 的页面，需一并目视。
- `font-synthesis-weight: none` 保留：系统栈缺少 500/600 时回落到最近的真实字重，不合成假粗体。
