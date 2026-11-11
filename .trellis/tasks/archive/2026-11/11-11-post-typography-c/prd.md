# 文章正文排版精修（C 方向）

## Goal

按用户已确认的 C 方向（编辑部）精修文章正文的阅读排版：正文 17px/1.85、明朝体标题、更清晰的 h2/h3/h4 层级与段距、轻量表格、居中图片、代码块语言栏与角标修复。正文继续使用系统字体栈，标题优先思源宋体，不引入任何 webfont 或网络字体请求。

## Background

用户认为当前 Markdown 阅读"有点丑"。现有正文档由 `@tailwindcss/typography` + 自定义 `--tw-prose-*` 变量 + `src/styles/post-prose.css` 组成，S18 / 11-10 任务已经把颜色、表格字号、宽度收敛过一轮。这次只针对阅读观感，不做渲染器替换。

方案对比（A 精修 / B 书卷 / C 编辑部）的实稿截图在 `.shots/proto/out/`（本地数据，不入库），用户选定 C：保留 A 的 17px 正文与现代组件，只把文章标题与 h2 换成明朝体。

## Confirmed Facts

- `.prose` 实测 16px / 28px；`--measure: 40em` = 640px；`.post-panel` 832px。
- h2 24px/600、h3 20px/600、h4 16px/600（h4 与正文同字号，层级弱）。
- `.code-language` 绝对定位在 pre 左上角（`top-2.5 left-3`），pre 没有对应的上内边距，语言标签与首行代码重叠（prototype 截图可复现）。
- Markdown 图片被 typography 设置上下 margin，但没有 `margin-inline: auto`，514px 宽的截图在 640px 列里左对齐。
- `.callout` 的 `font-size: 0.95em`，实测 15.2px，掉出正文档刻度。
- 现有字体：`--font-sans` 为系统栈（macOS PingFang / Windows 雅黑 / Linux Noto）；hero 另有本地朝华明朝体子集 `--font-hero`。
- 代码块（`.astro-code`）为暗色底、14px、`rounded-2xl`；表格有 1px 外框、0 圆角、表头 `--surface-2` 底色。

## Requirements

### R1 — 正文档

`.prose` 改 17px / 1.85 / 0.01em 字距，文字色改用 `--body`（亮暗 token 自动跟随）；新增 `--prose-size: 1.0625rem`，`--measure` 改为 `calc(40 * --prose-size)`（17px 下 680px，约 40 个汉字/行），避免 16px 上下文的头部把 40em 解析成 640px。段落间距 1.05em，`text-wrap: pretty`。

### R2 — 标题

新增 `--font-serif`（`'Source Han Serif SC'` → `'Noto Serif CJK SC'` → `'Songti SC'` → `'SimSun'` → serif），只用于文章 h1 与 h2；正文仍用 `--font-sans`。

- h1：`clamp(1.75rem, 2.5vw, 2.3rem)` / 1.4 / 700 / 0.02em。
- h2：1.55em / 1.45 / 700 / 0.035em，上 2.4em、下 0.9em。
- h3：1.18em / 1.55 / 600，上 1.9em、下 0.65em。
- h4：1.06em / 600 / `--ink`，上 1.7em、下 0.55em。
- 标题后的第一个块 `margin-top: 0`，避免双倍间距。

### R3 — 引用与提示框

- blockquote 去底色、去圆角，改 2px 左线（`--wash-mist-deep`）+ 1.15em 左内边距，文字 `--body`。
- callout 字号回到 1em（17px），左边框 3px，内边距 0.8em 1.1em；保留现有圆角与莫兰迪淡底。

### R4 — 表格

去外框、去表头底色；表头 1px 上边线 + 1.5px 下边线（ink 55%）；单元格 0.62em / 0.8em 内边距，行分隔线，hover 淡底；移动端保留横滑。表头 `vertical-align: bottom`，单元格 `top`。

### R5 — 图片

`display: block` + `margin-inline: auto` 居中，上下 2em；保持自然宽度，不上采样，不改 `astro:assets` 的 constrained 约束。

### R6 — 代码块

pre 顶部预留 2.4rem 给语言标签，标签去底色、uppercase、0.68rem、低对比；复制按钮位置微调；代码字号 0.82em（17px 下约 14px）。不改 `CodeBlock.astro` 的 DOM 结构。

### R7 — 字体 token

新增 `--font-serif`；正文仍 `--font-sans`；不加字体文件、不加网络请求。`font-synthesis-weight: none` 保留。

### R8 — 规范同步

`visual-system.md` 记录：正文档 17px 例外、明朝体标题与回退栈、表格新样式、`--measure` 在 17px 下的口径。

## Acceptance Criteria

- [x] AC1 `.prose` computed 17px / 1.85；1440 下正文列 680px；1024 / 1920 无横向溢出。
- [x] AC2 h1/h2 的 computed `font-family` 命中 Source Han Serif SC / Noto Serif CJK SC / Songti SC / SimSun 之一；h2 26.35px/700，h3 20.06px/600，h4 18.02px/600。
- [x] AC3 语言标签与首行代码的 bounding box 不重叠（任意代码块实测）。
- [x] AC4 表格外框 0；表头有上下边线；390 宽页面横向溢出 0、表格可横滑。
- [x] AC5 图片左右 margin 为 auto 且视觉居中；callout 17px；blockquote 无底色。
- [x] AC6 亮 / 暗两态与 390 / 1024 / 1440 / 1920 目视通过；`npm run contrast` 全部通过。
- [x] AC7 `npm run lint` / `npm test` / `npm run check` / `npm run build` 全绿。
- [x] AC8 用同环境 before/after shots A/B 确认：只有 about / links / 两篇 post 变化；其余非 prose 页逐像素一致（详见 research/verify.md）。
- [x] AC9 `visual-system.md` 与实现一致。

## Out of Scope

- 管理后台 `md-editor-v3` 预览统一（另开任务）。
- `astro-expressive-code` 接入。
- 标题 webfont 子集（继续系统字体栈）。
- 调色板、卡片、TOC、导航、动效。
- 页面 chrome 的五档字号（只新增正文档例外）。

## Technical Notes

- 现有 prose 颜色由 utilities 层的 `--tw-prose-*` 驱动；新增字号 / 间距必须放 utilities 层并用 `.prose.prose` 或更高特异性，否则会被 typography 同层规则压掉（S18 教训）。
- 图片居中只加 `margin-inline`，不改 width，避免破坏 `astro:assets` 的 constrained 布局。
- 代码块修复只加 pre 顶部内边距，不改 DOM。
- 详细设计见 `design.md`，执行顺序见 `implement.md`。
