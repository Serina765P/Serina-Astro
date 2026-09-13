# Astro 主题修复实施计划

**来源**：`docs/theme-design-audit-2026-09-13.md`（审查日期 2026-09-13）
**覆盖范围**：27 个缺陷 —— P0×3、P1×10、P2×14
**计划日期**：2026-09-13
**总原则**：**先立验证网 → 先加 token 不改视觉 → 小步替换 → 最后收口工程化**。每一步都要求"改完即验"，避免多点同步的返工。

---

## 零、批次与依赖总览

| 阶段 | 步骤 | 主题 | 能否并行 |
|---|---|---|---|
| **阶段 0** | S1–S3 | 验证网 + token 骨架冻结（不产生视觉变更） | 严格串行，是全流程前置 |
| **阶段一** | S4–S10 | P0 正确性修复 + 三个基元抽取 + 低风险清理 | S6/S7/S8 可并行；S10 独立可提前 |
| **阶段二** | S11–S18 | 结构与 token 体系收口 | 基本串行，S14/S16 可并行 |
| **阶段三** | S19–S25 | 工程化、性能、配置收口 | S22/S23/S25 可并行 |

**关键依赖链（不能倒序）**

```
S1 截图基线 ─┬─► 每步验收
S2 audit 解析CSS ─┬─► S3 token冻结 ─► S4/S5/S6/S7/S8/S9/S10
                  └─► S13 调色板收口 ─► S18 typography ─► S21 CI接线
S4/S5 ─► S13（必须先消灭 accent 直接用法，别名层才不必兼容两套）
S11 ─► S17（Header 重写后再定 z-index）
S13 ─► S19（字体/颜色稳定后再动 head）
S10 与 S24 共用 `_redirects`，应合并为同一次变更
```

**批次出入口（每批结束必过）**：`npm run check` → `npm run build` → `npm run contrast` → 截图对比基线全分辨率走查（亮/暗各一遍）。

---

## 阶段 0 · 基线与验证网

### S1　建立截图回归基线

- **修改目标**：动手前固化"当前视觉状态"，让后续每一步都能对比；顺带消费掉仓库里已声明但全仓未使用的 `playwright-core` 依赖。
- **涉及模块**：新增 `scripts/shots.mjs`；`package.json`（新增 `shots` script）；`.gitignore`（新增 `.shots/`）。
- **依赖关系**：无。**必须是第一个动作**。
- **完成标准**：`node scripts/shots.mjs` 对 `/`、`/archives/`、`/categories/`、`/tags/`、`/tags/<slug>/`、`/posts/pcshurufa/`、`/shuoshuo/`、`/links/`、`/search/`、`/404.html` 在 light/dark 两态各输出一张全分辨率 PNG 到 `.shots/baseline/`；后续运行输出到 `.shots/current/` 并可逐页目视对比。
- **备注**：`playwright-core` 在 `package.json:27` 声明，全仓（除 lock 文件）无任何引用 —— 属遗留依赖。本步决定"复用"；若最终不复用，改由 S22 删除。

### S2　改造 `contrast-audit.mjs` 为解析 `global.css`

- **修改目标**：消除 P2-1 的"色值双源"，让审计脚本从 `global.css` 的 `:root` / `:root.dark` 读色，并让全流程的配色改动有自动回归网。
- **涉及模块**：`scripts/contrast-audit.mjs`（重写取色部分，保留 lum/ratio/mix 算法与阈值语义）。
- **依赖关系**：无，但**必须在 S3 之前**完成。
- **完成标准**：
  1. 解析器能读取 `:root` / `:root.dark` 内的自定义属性；
  2. 能解析 `var()` **别名链**（多层间接）与 `color-mix(in srgb, A p%, B)`；
  3. 配对表改为**引用 token 名**，token 缺失时**报错退出**而非静默跳过；
  4. 现有全部配对结果与改动前逐行一致（`node scripts/contrast-audit.mjs` 输出 diff 为空）；
  5. 手工把 `global.css` 某个 hex 改成错值，脚本必须 fail —— 证明"忘记同步"已成构建失败。
- **备注**：`var()` 别名解析是本步的核心能力。S13（调色板收口）会把 `accent-*`/`wash-*` 降级为别名，若审计不能追别名，S13 之后会全盘误报。

### S3　冻结 token 骨架（只加不改）

- **修改目标**：把报告第六节草案落成真实的 `@theme` / `:root` 声明，为后续所有替换提供稳定接口；**本步不改变任何现有视觉**。
- **涉及模块**：`src/styles/global.css`。
- **依赖关系**：S1（基线）、S2（审计能识别新 token）。
- **完成标准**：
  - 新增并注册：断点 `--breakpoint-bento`；容器 `--container-content/standard/wide`；圆角 `--radius-chip/card/panel`；阴影 `--shadow-card/card-hover/media`；层级 `--z-sticky-head/nav/skip/overlay`；`--header-h`；
  - 交互 chip：`--chip-bg` / `--chip-fg` / `--chip-bg-hover` / `--chip-fg-hover`（亮暗各一套），并在 `@theme inline` 里注册为 `--color-chip`、`--color-chip-hover`、`--color-chip-fg`、`--color-chip-fg-hover`，以便直接用 `bg-chip-hover text-chip-fg-hover`；
  - 分类胶囊：`--cat-fill` / `--cat-on`（暗色 fill 取 deep、on 取浅色），同样注册为工具类；
  - `npm run build` 通过，**截图与 S1 基线逐页一致（零视觉变更）**。
- **命名约定**：token 用 `--语义-作用-状态`，Tailwind 消费层统一走 `@theme inline` 注册，避免在组件里写 `var(...)` 字面量。

---

## 阶段一 · P0 正确性 + 基元抽取 + 低风险清理

### S4　P0-1 暗色 hover chip 闪白

- **修改目标**：暗色下悬停 chip 不再闪出近白块（现状 `#f3e7e7` 压在 `#302c27` 上）。
- **涉及模块**：`global.css:414`（`.code-fold-btn`）、`PostCard.astro:79`、`PostLayout.astro:105`、`index.astro:85`、`links/index.astro:37`。
- **依赖关系**：S3。
- **完成标准**：5 处 `hover:bg-accent-100 hover:text-accent-700` 全部替换为 S3 的 chip 语义 token；暗色下悬停底色为 `color-mix(wash-pink 22%, surface)` 系而非近白；S2 审计新增 `chip-fg-hover / chip-bg-hover` 配对（亮暗各一）且通过；暗色悬停态截图与基线对比无闪白。
- **附带**：`search/index.astro:105` 的高亮 `mark` 也用 accent 阶（`accent-200/900`、`dark:accent-700/50`）—— 此处暗色已显式翻转，**不属于本缺陷**，仅在 S13 别名化时一并纳入，不要在本步改动。

### S5　P0-3 分类胶囊 fill/on 分离

- **修改目标**：暗色页面不再出现"近白底 + 近黑字"的高饱和亮块。
- **涉及模块**：`PostCard.astro:47`、`PostLayout.astro:69`、`site.config.ts:65-69`（`categoryColor()` 的消费语义）。
- **依赖关系**：S3。
- **完成标准**：两处胶囊改用 `--cat-fill` / `--cat-on`；暗色下为 deep 底 + 浅字；亮色视觉与基线一致；S2 审计新增 6 组 `cat-on / cat-fill` 配对（每种 wash 色一组 × 亮暗）全部通过。
- **核对备注**：报告把 `categories/index.astro:34` 列为同类问题，**实际该行是一个 `size-2.5` 的纯色圆点（无文字承载）**，不构成对比度缺陷。本步不动它 —— 但实现时请再确认一次，避免误改。

### S6　P1-1 抽取 `PageHeader.astro`，替换 8 处标题块

- **修改目标**：消除页面标题块的 8 处字面重复。
- **涉及模块**：新增 `src/components/primitives/PageHeader.astro`（props：`title` / `eyebrow?` / `subtitle?`）；替换 `archives/index.astro:22-25`、`categories/index.astro:21-23`、`tags/index.astro:30-32`、`search/index.astro:9-11`、`shuoshuo/[...page].astro:38-41`、`categories/[slug].astro:30-34`、`tags/[slug].astro:30-34`、`layouts/PageLayout.astro:18-20`。
- **依赖关系**：S3。
- **完成标准**：8 处字面标题块全部消除；页面 DOM 结构等价；四种入参组合（仅 title / +eyebrow / +subtitle / 两者全给）逐一目视验证；受影响的 6 个页面截图与基线一致。

### S7　P1-2 抽取 `Card.astro` + `@utility card-surface / card-lift`

- **修改目标**：卡片 recipe 单点定义，**同时覆盖 Astro 侧与 JS 侧两条消费路径**。
- **涉及模块**：新增 `src/components/primitives/Card.astro`（props：`lift?`、`as?`、`class?`）；`global.css` 增加 `@utility card-surface` / `@utility card-lift`；替换 `PostCard.astro:27-28`、`categories/index.astro:31`、`links/index.astro:18`、`PostLayout.astro:126`、`PostLayout.astro:144`、`search/index.astro:96-97`。
- **依赖关系**：S3。
- **完成标准**：
  1. 上述 6 处统一到组件 / utility；
  2. **顺带修正一处报告未列出的不一致**：`PostLayout.astro:126/144`（上一篇/下一篇）写的是 `hover:shadow-card`（悬停无阴影变化），而其余卡片是 `hover:shadow-card-hover` —— 统一后四处抬升行为一致；
  3. `search/index.astro` 的 `li` 由 JS `className` 拼字符串生成，无法用组件，必须走 `@utility`，且与组件视觉等价；
  4. 截图对比无差异（除上述 hover 修正外）。

### S8　P1-3 抽取 `TagChip.astro`

- **修改目标**：标签 chip 单点定义。
- **涉及模块**：新增 `src/components/primitives/TagChip.astro`（props：`href` / `label` / `count?` / `size?: 'compact' | 'cloud'`）；替换 `PostCard.astro:77-82`、`PostLayout.astro:103-108`、`index.astro:85`、`links/index.astro:37`。
- **依赖关系**：S3、S4（chip token 已就位，组件一出生就是对的）。
- **完成标准**：4 处统一；**两档尺寸必须保留** —— 卡片/文章页 chip 是 `px-2.5 py-0.5 text-xs text-sub`，首页标签云是 `px-3.5 py-1 text-xs text-body`，友链社交 chip 是 `px-3.5 py-1.5`，不要为了"统一"抹掉尺寸层级；hover 全部走 chip token；亮暗自适应验证。

### S9　P2-3 修正陈旧注释（不动脚本）

- **修改目标**：消除注释与实现自相矛盾。
- **涉及模块**：`global.css:160`（"霞鹜文楷全局应用" → 实际是 IBM Plex Sans SC）、`global.css:161`（"标题保持不加粗" 与 `:162-167` 的加粗规则矛盾）。
- **依赖关系**：S3（同文件，避免冲突）。
- **完成标准**：`global.css` 内所有注释与相邻实现一致；`grep -rn "霞鹜文楷" src/` 无残留。
- **批次冲突说明（重要）**：报告 P2-3 要求"删除死脚本 `vendor-fonts.mjs`"，而 P2-8 又要求"复用 `vendor-fonts.mjs` 的思路"。**两者不能都照字面执行**。本计划决议：**不删除，改为在 S19 重写复用**。`vendor-fonts.mjs` 里真正有价值的是"下载 woff2 + 补 `font-weight` + 把 `url()` 本地化"这段逻辑，删掉等于把这个能力再写一遍。江城圆体专有常量（`FONT_ID = 59`、`JiangChengYuanTi`）在 S19 替换为 389 / 2101。

### S10　P2-9 修正 RSS 文件名与 MIME

- **修改目标**：feed 阅读器不再拿 Atom 声明去解析 RSS 2.0 内容。
- **涉及模块**：`src/pages/atom.xml.js` → `src/pages/rss.xml.js`；`BaseHead.astro:16`（`rssUrl`）、`:30`（`type` → `application/rss+xml`）；`index.astro:98`（快捷入口链接）；新增 `public/_redirects`（`/atom.xml /rss.xml 301`）。
- **依赖关系**：无，**可提前到阶段一开头独立执行**。
- **完成标准**：`/rss.xml` 返回 RSS 2.0 且 `<link rel="alternate">` 声明为 `application/rss+xml`；`/atom.xml` 301 到 `/rss.xml`（老订阅地址不断）；`index.astro` 入口链接更新；feed 校验器通过。
- **衔接**：`_redirects` 文件同时会被 S24（trailingSlash）改动，建议预留合并。

---

## 阶段二 · 结构与 token 体系收口

### S11　P0-2 移动导航改 CSS-only（吸收 P2-14）

- **修改目标**：无 JS 时移动端导航可达；同时修掉菜单面板继承半透明底的问题。
- **涉及模块**：`Header.astro`（`:21` 桌面导航、`:50-60` 按钮、`:64-69` 菜单面板、`:94-130` 脚本）、`global.css`（如需新增工具类）。
- **依赖关系**：S3。
- **完成标准**：
  1. 方案用 `<details><summary>` 承载移动菜单（`open` 由浏览器管理，天然无 JS 可用），或 checkbox + `peer`；**与报告 P0-2 建议一致**；
  2. **禁用 JS 后 < lg 视口**：菜单可展开、可跳转、可关闭；
  3. JS 开启时保留增强：Esc 关闭 + 焦点归还按钮 + 点击菜单外关闭；
  4. 语义：`<details>/<summary>` 自带展开态播报，**移除冗余的 `aria-expanded`/`aria-controls`**，但保留 `aria-label`；
  5. **P2-14 一并解决**：菜单面板背景改实心 `--surface`，展开时页面内容不再透过模糊底可见；
  6. 亮暗两态 × 有无 JS 四种组合截图验证。

### S12　P1-4 容器 token + `<Container>` + 消除 lg 空白死区

- **修改目标**：全站容器宽度来源单一，并修掉"宽容器 + 无侧栏"的浪费区间。
- **涉及模块**：`global.css`（容器 token）、新增 `src/components/primitives/Container.astro`（props：`width: 'content' | 'standard' | 'wide'`）；替换 `BaseLayout.astro:25`（默认值）、`PostLayout.astro:51`、`PageLayout.astro:17`、`shuoshuo/[...page].astro:38`、`search/index.astro:8`、`index.astro:55`、`Footer.astro:11`。
- **依赖关系**：S3、S7。
- **完成标准**：
  1. 全站宽度由 3 个容器档位表达，`grep -rn "max-w-" src/` 只剩容器内部允许项；
  2. **1024–1279px 区间**（`PostLayout` 用 `max-w-6xl` 而 TOC 仅 `xl:block`，且 `Toc.astro:21` 也二次 `hidden xl:block`）—— 二选一：把 TOC 提到 `lg:block`，或收窄 lg 下的正文宽度；**推荐前者**，与 Fuwari/Firefly 的"TOC 全程可用"方向一致；
  3. 断点 1024 / 1279 / 1280 三个临界宽度截图走查。

### S13　P1-5 调色板收口（颜料阶 + 语义别名）

- **修改目标**：消除 `#835a58` 等字面同值、把 34 个颜色 token 收敛到"一套颜料阶 + 语义别名"。
- **涉及模块**：`global.css` 的 `:root` / `:root.dark` / `@theme` / `@theme inline`；`scripts/contrast-audit.mjs` 配对表。
- **依赖关系**：**S4、S5 必须先完成**（先消灭 `accent-*` 的直接 hover 用法），S2（审计能追别名链）。
- **完成标准**：
  1. `--color-accent-700: #835a58` 与 `--wash-pink-deep: #835a58` 只保留一处字面定义，另一处为 `var()` 别名；
  2. `accent-*`（11 档）与 `wash-*`（12 项）全部降级为指向颜料阶的语义别名，**类名不变**（避免全站改 class）；
  3. `::selection`（`accent-200/950`、`dark:accent-700/50`）、search `mark`（`accent-200/900`、`dark:accent-700/50`）、`text-accent-600`（`archives/index.astro:31`）所依赖的档位必须全部保留；
  4. 全站视觉零变化（截图逐页比对）；审计通过。
- **风险**：这是本计划影响面最广的一步，务必独立提交、单独验收。

### S14　P1-6 断点收口

- **修改目标**：消除脱离 Tailwind 标度的裸 `880px`。
- **涉及模块**：`index.astro:232`；`global.css` 的 `--breakpoint-bento`。
- **依赖关系**：S12（断点与容器同期定稿）。
- **完成标准**：`grep -rn "max-width: [0-9]" src/` 无结果；bento 在 880px 处的折叠行为与基线一致；可选：把该断点并入 Tailwind 标度（如改 `lg`），但需先确认视觉可接受。

### S15　P1-7 锚点偏移单一来源

- **修改目标**：锚点跳转偏移不再有两套取值（88px vs 96px）。
- **涉及模块**：`global.css:178-180`（`[id] { scroll-margin-top: 5.5rem }`）、`Prose.astro:12`（`prose-headings:scroll-mt-24`）、`archives/index.astro:31`（`sticky top-16`）、S3 引入的 `--header-h`。
- **依赖关系**：S3。
- **完成标准**：偏移统一由 `calc(var(--header-h) + 1.5rem)` 派生；跳转任意标题（h2/h3/h4）均不被吸顶导航遮挡；亮暗、有无 TOC 四种组合验证。

### S16　P1-8 颜色/阴影逃逸 token 收敛

- **修改目标**：硬编码色值与阴影全部回归 token 体系。
- **涉及模块**：`404.astro:14`（`text-white` + `bg-accent-700 dark:bg-accent-300`）、`skins/ImasAlbum.astro:33`（`rgb(120 105 90 / .18)`）、`:51`（`rgb(0 0 0 / .2)`）、`:32/:69`（硬编码 `border-radius: 0.75rem`）、`Lightbox.astro:6`（`bg-black/50 text-white`）、`global.css:374/377`（`bg-black/80`、`shadow-2xl`）。
- **依赖关系**：S3（`--shadow-*`、`--radius-*`、`--on-accent`）。
- **完成标准**：新增 `--on-accent` 与 `--radius-media`；全量收敛；`grep -rnE "rgb\(|shadow-2xl|text-white|bg-black/" src/` 只剩 token 定义处；亮暗两态验证 404 按钮、专辑网格、图片预览。

### S17　P1-9 z-index 统一表

- **修改目标**：层级不再靠散落的数字。
- **涉及模块**：`global.css`（`--z-*` 注册为工具类）；`Header.astro:14`（`z-40`）、`BaseLayout.astro:74`（`z-50`）、`archives/index.astro:31`（`z-10`）、`global.css:422`（`.code-copy-btn` 的 `z-10`）。
- **依赖关系**：S3、S11（Header 已重写）。
- **完成标准**：全部 z 值来自 token；键盘 Tab 首次聚焦时 skip-link 可见且在最上层；吸顶头 / TOC sticky / 代码复制按钮 / 移动菜单四者无错误遮挡。

### S18　P1-10 typography 改走 `--tw-prose-*`

- **修改目标**：清掉 `.prose` 相关的 `!important` 与手写颜色规则，改为覆盖 typography 变量。
- **涉及模块**：`global.css:185`、`:259`、`:277`、`:281`、`:285`（5 处 `!`）、`:266-273`（手写 `.prose { color }` 与 `.prose h* { color }`）、`Prose.astro`。
- **依赖关系**：S13（token 别名稳定后）、S2（审计兜底）。
- **完成标准**：
  1. `.prose` 相关 `!important` 归零（**`global.css:205` 的 reduced-motion `!important` 保留** —— 那是 `*` 选择器压制，属有意设计，报告中亦作为达标项）；
  2. 正文 / 标题 / 链接 / 引用 / 行内 code 的颜色全部由 `--tw-prose-*` 驱动；
  3. 亮暗两态正文页截图逐段比对（允许因变量覆盖产生的预期差异，但必须逐处说明理由）。
- **风险**：`@tailwindcss/typography` v0.5 的变量名与作用域需实测；`prose-neutral` / `dark:prose-invert` 与自定义变量同时存在时的优先级要逐一验证 —— **不要把"清掉 `!`"当成纯重构**，其中两处 `!` 正是为了压过 typography 自带字重阶（h2 700 / h1 800），改成变量后需确认字重仍为 700/600。

---

## 阶段三 · 工程化、性能与配置收口

### S19　P2-8 字体自托管子集化（重写 `vendor-fonts.mjs`）

- **修改目标**：消除 5 个 render-blocking 的第三方字体 CSS，字重与 `font-display` 受控。
- **涉及模块**：`scripts/vendor-fonts.mjs`（重写：`FONT_ID` 59 → 389 与 2101，`JiangChengYuanTi` → `IBM Plex Sans SC` / `ZhaohuaMinA Bold`，按真实字重 300/400/500/600/700 补 `font-weight`）；`BaseLayout.astro:63-68`（移除 5 个 CDN `<link rel="stylesheet">`，改本地样式 + 首屏字重 `<link rel="preload" as="font" crossorigin>`）；产出目录建议走 `src/assets` 而非 `public`（见 S20）。
- **依赖关系**：S9（注释先对齐）、S18（字体相关规则已稳定）。
- **完成标准**：
  1. `<head>` 内无第三方字体样式表阻塞渲染；
  2. 首屏只 preload 1–2 个必要 woff2 子集，其余按需加载；
  3. 所有 `@font-face` 显式 `font-display: swap`；
  4. 在屏蔽 `fontsapi.zeoseven.com` 的环境下字体仍正确显示（这正是该脚本当初存在的理由）；
  5. 字体文件名带内容哈希，可长期缓存。
- **备注**：README「字体」一节（`:23-25`）需同步改写。

### S20　P2-10 / P2-11 图像管线补齐

- **修改目标**：所有图像经过 `astro:assets`，正文图带上 `srcset/sizes`。
- **涉及模块**：
  - P2-11：新增 `src/assets/images/`（迁入 `public/images/fav.webp`、`hero.webp`），改造 `Header.astro:17`、`index.astro:45`、`404.astro:9`、`site.config.ts:21-22`（`HERO`）；
  - P2-10：`src/content/posts/pcshurufa/*.webp`（16 张，散落在 markdown 图片语法中）改走 `<Picture widths={[...]} formats={['avif','webp']}>`。
- **依赖关系**：S3（`--radius-media` / `--shadow-media` 由 S16 提供）。
- **完成标准**：Header / Hero / 404 图像输出带 `width`/`height` 与哈希；正文图输出 `srcset/sizes`（至少 webp，avif 视构建耗时决定）；CLS = 0；`dist` 中不再出现 `/images/fav.webp` 原图引用。
- **风险与决策点**：16 处正文图手工替换易漏，建议脚本化（复用 `scripts/migrate-posts.mjs` 的批量改写思路）。另需**实测** Astro 7.3.1 是否已支持通过 `markdown.image.layout` 自动生成响应式 `srcset` —— 若支持，则优先用配置而非改 markdown（改动面小一个数量级）。

### S21　P2-1 收尾：把对比度审计接入 `check` 链路

- **修改目标**：色值忘记同步时构建失败。
- **涉及模块**：`package.json`（`check` → `astro check && node scripts/contrast-audit.mjs`）；`scripts/contrast-audit.mjs` 配对表补齐 chip / cat / on-accent 等新增 token。
- **依赖关系**：S2、S13、S14–S18 全部完成。
- **完成标准**：任意 token 未达标时 `npm run check` 非零退出；本地与 CI 行为一致。

### S22　P2-2 接入 Biome + GitHub Actions

- **修改目标**：补上 lint / format / CI 缺口。
- **涉及模块**：新增 `biome.json`、`.github/workflows/ci.yml`（`biome ci` + `npm run check` + `npm run build` 冒烟）、`.editorconfig`；清理依赖（`playwright-core` 若 S1 未采用则删除）。
- **依赖关系**：S1（决定 playwright 去留）、S21。
- **完成标准**：CI 三连绿；PR 上能拦截格式 / lint / 类型 / 构建错误；仓库根不再只有 `.gitignore`。

### S23　P2-4 / P2-5 脚本守卫统一 + 代码块组件合并

- **修改目标**：换页时脚本行为一致；消除代码块处理的隐式 import 顺序契约。
- **涉及模块**：
  - **P2-4**：统一为 `astro:page-load` + `dataset` 幂等标记，覆盖 `Header.astro:94`、`Lightbox.astro:12`、`Toc.astro:52`、`CodeFold.astro:6`、`CodeCopy.astro:7`、`BaseLayout.astro:32`（内联主题脚本）；
  - **P2-5**：合并 `CodeFold.astro` / `CodeCopy.astro` 为单一 `CodeBlock.astro`（一次 `wrap`、一套守卫、无顺序依赖），或引入 `astro-expressive-code`；同时删除 `CodeCopy.astro:3-4` 的顺序注释与 `PostLayout.astro:56-57` 的隐式契约。
- **依赖关系**：S17（层级）、S18（code 样式已稳定）。
- **完成标准**：
  1. 无 import 顺序依赖；
  2. 连续换页 5 次不产生重复按钮、不重复绑定监听器；
  3. `grep -rn "__.*Bound" src/` 收敛为统一命名（推荐 `dataset` 标记而非 `window.__x`）；
  4. **额外修正一处报告未展开的隐患**：`Lightbox.astro:14-17` 在**模块顶层**捕获 `<dialog>` 与 `<img>` 引用并绑定 `closeBtn` 监听。ClientRouter 换页会替换 DOM，模块脚本不再重跑 → 换页后这些引用会指向已脱离文档的旧节点，预览关闭按钮失效。**修复不是"加个守卫"，而是把元素查询挪进 `astro:page-load` 内重新执行**。请重点验证：文章页 → 换页到另一文章页 → 点图放大 → 关闭按钮是否可用。

### S24　P2-6 / P2-12 / P2-13 配置与路由收口

- **修改目标**：配置单一来源、URL 形态唯一、内容源可扩展。
- **涉及模块**：
  - **P2-6**：`site.config.ts:6-7` 合并 `data/taxonomy.json` / `data/site-info.json`（或反向由 TS 生成 JSON，需保留"本地工作台直接读写 JSON"的能力）；`SIDEBAR` → `SITE_META`（消费方 `Footer.astro:23`、`links/index.astro:4`）；
  - **P2-13**：`astro.config.mjs:10` `trailingSlash` 固定为 `'always'`（与 `:12` `format: 'directory'` 一致），移除 `Header.astro:6-11` 的手工去尾斜杠比较，补 `_redirects` 处理旧的无斜杠 URL；
  - **P2-12**：`src/data/shuoshuo.json` 按年分片 + `content.config.ts:21-28` 改多 file loader 合并；**必须同步改 `worker/` 的追加写入逻辑**，否则新说说会写进错误的文件。
- **依赖关系**：S10（共用 `_redirects`，建议合并为一次变更）、S21。
- **完成标准**：配置单一来源；无非规范 URL 并存（`/posts/x` 与 `/posts/x/` 只保留一个）；说说 loader 读取全部分片且排序正确；worker 端写入路径同步更新并端到端验证一次。
- **风险**：S24 三项虽同属 P2，但**耦合度低、风险差异大**。建议拆成三次独立提交，其中 trailingSlash 影响 canonical / sitemap / 内链，需单独走一次全站链接扫描。

### S25　P2-7 图标白名单放开

- **修改目标**：不再逐一手列图标名，漏加不再静默缺失。
- **涉及模块**：`astro.config.mjs:18-52`（`include: { 'material-symbols': ['*'] }`）。
- **依赖关系**：无，**可提前到阶段一独立执行**。
- **完成标准**：构建通过；`dist` 产物中只含实际使用的图标（tree-shake 生效）；构建体积无显著增长（记录前后对比值）。

---

## 四、实施核对备注（与报告的偏差，实现时请留意）

1. **P0-3 证据偏差**：报告把 `categories/index.astro:34` 列为"胶囊仍用亮色实心块"，实测该行是 `size-2.5` 的纯色圆点，只有色相提示、无文字，不构成对比度缺陷。S5 不改此处。
2. **P1-2 未列出的不一致**：`PostLayout.astro:126/144` 用 `hover:shadow-card`（静态，悬停无变化），与其余卡片的 `hover:shadow-card-hover` 不一致；且 `search/index.astro:96-97` 在 JS 里另拼一份卡片 class，是第 6 个重复点。两项均并入 S7。
3. **P2-3 ↔ P2-8 冲突**：报告一边要求删 `vendor-fonts.mjs`，一边要求复用其思路。已决议"重写复用"（见 S9 / S19）。
4. **P2-4 的真实问题不是"缺守卫"**：`Lightbox.astro` 的问题在于模块级元素引用在 ClientRouter 换页后失效（见 S23）。
5. **P2-10 需实测**：报告建议改 `<Picture>`，但若 Astro 7.3.1 已支持 `markdown.image.layout` 自动生成 `srcset`，用配置改动的面会小一个数量级 —— 实现前先验证。
6. **P1-4 的"空白死区"实际表现**：1024–1279px 下正文仍居中显示，不是视觉破损，而是"容器宽度与 TOC 断点不匹配导致的横向空间浪费"。修复方向是让 TOC 从 `lg` 起可用（S12），而非收窄容器。
7. **P2-4 覆盖范围修正**：报告列 `Header.astro:94` 为"无守卫"，但其监听器绑在 `document` 上做事件委托，本身天然幂等，风险等级低于其余几处。S23 仍统一处理，但它是低优先级项。

---

## 五、建议提交粒度

| 提交 | 内容 | 单独验收重点 |
|---|---|---|
| 1 | S1 + S2 + S3 | 基线可复现；审计改色即 fail；token 冻结后零视觉变更 |
| 2 | S4 + S5 | 暗色 chip / 胶囊不再闪亮块 |
| 3 | S6 + S7 + S8 | 三个基元落地，16 处字面 class 消除 |
| 4 | S9 + S10 + S25 | 低风险清理，独立可回滚 |
| 5 | S11 | 禁用 JS 走查 |
| 6 | S12 + S14 + S15 | 1024/1279/1280 三个临界宽度 |
| 7 | S13 | **单独提交**，全站逐页截图比对 |
| 8 | S16 + S17 | 逃逸 token 与层级表 |
| 9 | S18 | 字重与颜色逐段比对 |
| 10 | S19 + S20 | 字体/图像产物检查 |
| 11 | S21 + S22 | CI 三连绿 |
| 12 | S23 | 连续换页 5 次 + Lightbox 关闭按钮 |
| 13 | S24 | 拆三次：配置 / 分片 / trailingSlash |

---

## 六、阶段 0 实施记录（S1–S3 已落地）

**S1 · `scripts/shots.mjs`**（13 路由 × 亮暗 = 26 张全页图，SHA-256 逐图比对；`baseline` 拍基线，默认模式拍当前并自动 diff）

出图确定性踩了三个坑，均已修，后续步骤勿回退：

1. `astro preview` 默认只监听 IPv6 `::1`，用 `127.0.0.1` 会 ECONNREFUSED → 必须显式 `--host 127.0.0.1`。
2. 懒加载图与**按 unicode-range 分片的字体**（IBM Plex Sans SC 单份 143KB）只有全页渲染才触发加载；而 CodeFold 的折叠阈值依赖字体度量，字体没落定会让折叠状态翻转。
3. 正文图带 `decoding="async"`，`img.complete` 只代表数据到手、**不代表已解码**。不等 `img.decode()` 就出图，`post-pcshurufa` / `post-imas-hires` 两张重图会在**同一份代码**上给出不同字节（实测把 S3 前的代码连拍两次，4 张图各不相同）。加 decode 等待后：同一代码两次出图 **0 张不一致**。

浏览器用系统 Edge（`channel: 'msedge'`）：本机 ms-playwright 缓存是 chromium-1228，而 playwright-core 1.63 要求 1243，直接 launch 找不到可执行文件。这也顺带消费掉了仓库里原本声明却全仓未使用的 `playwright-core` 依赖。

**S2 · `contrast-audit.mjs`** 已改为解析 `global.css`（括号配对切 `:root` / `:root.dark` / `@theme` / `@theme inline`），支持 `var()` 别名链与 `color-mix()`；缺 token 或无法解析颜色即报错退出。验收证据：改造前后 stdout **逐字节一致**（52 项检查，exit 0）；负向测试——改错色值 → 3 项 FAIL/exit 1，删 token → 干净报错/exit 1。

**S3 · token 骨架**已写入 `global.css`。产物级证据：**新增 18 个 token、删除 0 个**，且 18 个正是声明集合；剥离自定义属性后的规则骨架无变化；审计输出仍与前基准逐字节一致。相对计划的一处收窄：**未声明 `--z-overlay`**（灯箱走 `<dialog>` 顶层，不参与 z-index，无真实消费点）。

### 给后续步骤的两条硬约束（实施中确认）

- **`--shadow-media-hover` 不会进入构建产物**（`@theme` 里未被消费的变量会被 Tailwind 剪掉；改名 `--shadow-media-lift` 同样如此）。S16 消费前必须先验证；若仍旧不产出，改用 `@utility` 或 `--shadow-card-hover`。
  （注：`--container-*` / `--radius-*` / `--shadow-media` / `--breakpoint-*` 均已确认能进产物。）
- **`--z-index-*` 不是 Tailwind 命名空间**，`--z-*` 放在普通 `:root` 里，消费时需 `@utility z-nav { z-index: var(--z-nav) }` 或 `z-[var(--z-nav)]`。

### 阻断级环境缺陷：`astro build` 会间歇性静默丢弃 CSS

- 现象：退出码 0、38 页全部生成、HTML 正常引用 `/_astro/BaseLayout.*.css`，但该文件不存在于 `dist` —— 整站无样式。
- 量化：同命令连续构建失败率约 **1/3**；与是否删 `dist`、是否清 `.vite` / `.vite-temp` / `.astro` 均无稳定相关。
- 已排除：磁盘（154GB 可用）、`.css` 写入权限、Tailwind 全链路（含 `oxide` / `lightningcss` 原生二进制）、`global.css` 内容（回退 HEAD 同样复现）、`astro.config.mjs`（`git status` 干净）、`astro dev`（dev 下能正常编译出 78KB 样式）。
- 现场线索：成功时曾观察到 `dist/.prerender/_astro/*.css` 暂存目录，疑与 Astro 7 的预渲染暂存搬移竞态有关。
- 已加防线：`shots.mjs` 出图前断言 `dist/_astro` 存在 `.css`，避免把"构建坏了"误报成"视觉回归"。
- **S22 必须补上**：把该断言并入 `npm run build`（`astro build && node scripts/check-build.mjs && pagefind --site dist`），否则 CI 会在构建成功后发布无样式站点。

---

## 七、阶段一实施记录（S4–S10 已落地）

### 验收结果

| 闸门 | 结果 |
|---|---|
| `astro check` | **0 error / 0 warning**（29 hints）—— 见「越界修复」 |
| `astro build` | 38 页，`dist/_astro` 存在 CSS（防线断言通过） |
| `contrast-audit` | **64 项全过，exit 0** |
| 截图比对 | 亮色 **13/13 与基线逐字节一致**；暗色稳定图仅 3 张变化，且全部落在分类胶囊 |

出图目录：`.shots/baseline`（阶段 0 基线）→ `.shots/final`（本次结果），中间还留了
`.shots/pre-s4`、`.shots/phase1` 两层。基线可复现性已先验证：改动前跑一轮，稳定子集 20/20 全等。

**暗色 3 张变化的像素级证据**（新增 `scripts/pixel-diff.mjs`，把差异行聚成带）：

| 图 | 差异带 | 每处范围 | 整页占比 |
|---|---|---|---|
| `home.dark` | 6 处 | 72×20px，x 261–332 | 0.2202% |
| `tag-idolmaster.dark` | 4 处 | 同上 | 0.3109% |
| `category-tech.dark` | 2 处 | 同上 | 0.2117% |

带数 = 该页卡片数，位置与尺寸完全一致（72×20 去掉圆角后正好 1372 像素）——即"每张卡片那一个
分类胶囊"，页面其余部分零漂移。

### 各步落地与偏离

**S4（P0-1）**：S3 只往 `:root` 写了 chip 变量、**漏了 `@theme inline` 注册**，本步补齐
`--color-chip / -hover / -fg / -fg-hover`（utils：`bg-chip` / `bg-chip-hover` / `text-chip-fg` /
`text-chip-fg-hover`）。

**实际改了 6 处而非 5 处**：报告 P0-1 证据列了 `index.astro:229`，但计划 S4 的模块清单漏了它
（`.quick` 快捷入口，同一个 `hover:bg-accent-100 hover:text-accent-700`）。已一并修。

hover 态截图拍不到，改用真实浏览器读计算样式验证（见下方"hover 探针"）：

| 位置 | 亮色 hover | 暗色 hover |
|---|---|---|
| 标签云 chip / 快捷入口 / 文章标签 / 友链 chip | bg `#f3e7e7` + fg `#835a58`（与改动前一致，审计 4.87） | bg **`#4c433f`** + fg `#eae4d9`（不再闪白，审计 7.61） |
| `.code-fold-btn` | 产物 CSS 已是 `var(--chip-bg-hover / --chip-fg-hover)`，token 路径同上 | 同左 |

**S5（P0-3）**：**偏离了 S3 定下的 token 语义**，理由如下 ——

S3 写的是暗色 `--cat-fill: var(--wash-pink-deep)`。但 `--wash-*-deep` 在暗色下本来就是**浅色**
（它们是暗色下的正文/链接色），照此实现得到的是"浅底 + 深字"，既没修掉亮块，也与 S3 自己在同一
段写的注释（"不再用亮色实底…靠色相而非明度提示分类"）自相矛盾。改为：

```css
:root      { --cat-on: var(--on-wash); --cat-fill-pink: var(--wash-pink); … }
:root.dark { --cat-on: var(--ink);      --cat-fill-pink: color-mix(in srgb, var(--wash-pink) 26%, var(--surface)); … }
```

两点连带决定：
1. 单一 `--cat-fill` 拆成**按分类分档**的 6 个 token（`-pink/-mist/-sage/-sand/-clay/-rose`）。
   单一 fill 会把四种分类压成一色，并与卡片左侧色条（spine，取 `--wash-*`）色相脱节。
2. 类名由 `site.config.ts` 的 `categoryFillClass()` 产出，**按 wash 变量名映射**，
   不新增第二份分类清单（`src/data/taxonomy.json` 仍是唯一来源）。

亮色下 `--cat-fill-*` 就等于 `--wash-*`，故亮色逐像素不变（基线已证）。

**S6**：`PageHeader.astro` 除计划里的三个 props 外，多一个 `class?` —— 8 处消费点的 header
包装类并不一致（默认 `mb-8`，搜索页 `mb-6`，说说页 `mx-auto max-w-2xl`），不给它会改变布局。

**S7**：`@utility card-surface` / `card-lift` 用 `@apply` 实现而非手写 `var()`，
这样才能让 Tailwind 的变量消费追踪生效（`--radius-card` / `--shadow-card` 才会进产物）。
`Card.astro` 支持 `as` / `lift` / `class` + rest 透传。顺带修掉计划点名的
`PostLayout:126/144` 的 `hover:shadow-card` → 统一为 `card-lift`（四处抬升行为一致）。
搜索结果 `li` 走 `card-surface`（**不加 lift**：`li` 本身不是链接，抬升要诚实）。

**S8**：尺寸档取 `'compact' | 'cloud' | 'social'` 三档（计划只写了前两档，但友链社交 chip
是 `px-3.5 py-1.5` 且带图标，属独立的第三档）；另加 `icon?` / `target?` / `rel?`。
计划里的 `count?` 四个消费点都不用，**未加**（不放死参数）。hover 全部走 chip token。

**S9**：`global.css` 两处互相矛盾的注释合并重写为一句准确描述；`grep 霞鹜文楷 src/` 已无结果。

**S10**：`src/pages/atom.xml.js` → `src/pages/rss.xml.js`；`BaseHead` 的 `type` 改
`application/rss+xml`、`rssUrl` 改 `/rss.xml`；`index.astro` 快捷入口同步；新增
`public/_redirects`（`/atom.xml → /rss.xml 301`，Cloudflare Pages 消费，预留 S24 的 trailingSlash 合并）。
产物已核：`dist/atom.xml` 不存在、`dist/rss.xml` 为 RSS 2.0、`dist/_redirects` 已复制。

### S2 脚本 bug（本次才暴露）

`contrast-audit.mjs` 的 `color-mix()` 解析是坏的：正则分支已经吃掉色彩空间 `in srgb,`，
代码却又 `splitTopLevel(...).slice(1)` 再砍掉一项 → 任何 `color-mix` token 都解析失败并退出。
S3 之前没有任何 `color-mix()` 进过 `TOKENS`，所以一直没触发。已删掉多余的 `.slice(1)`。

另外把旧的 `accent-700 / accent-100（hover chip）` 配对换成 chip 与 6 组 cat 配对；
`on-wash / wash-*` 六项保留但改标为「bento 图标底」（`index.astro:215` 的 `.ico` 仍在用）。

### 越界修复（计划外，但本批闸门要靠它才真能过）

`shuoshuo/[...page].astro` 的 `getStaticPaths({ paginate })` 没有类型标注，Astro 推不出
`Astro.props.page`，整页报 **14 个 never/any 错误**。已在 HEAD 上单独跑一次 check 确认
**同样报 14 个** —— 即阶段一的 `check` 闸门在动手之前就是红的，不是本次引入。

修法照 Astro 官方写法：`export const getStaticPaths = (async (...) => {...}) satisfies GetStaticPaths`。
纯类型标注，产物 CSS 哈希不变（`BaseLayout.Cb56Ppnb.css` 前后一致），`phase1 → final` 26 张图
除 3 张已知抖动图外**逐字节零漂移**。

### 两个可复用的验证手段（本批新增/固化）

- `scripts/pixel-diff.mjs <dirA> <dirB> <图名>`：像素级定位差异落在哪，把差异行聚成带。
  shots.mjs 只答"变没变"，它答"变在哪"，正好覆盖"允许局部变化"这一类改动。
- **hover 探针**（截图抓不到 hover 态）：用 playwright 打开页面 → `el.hover()` → 读
  `getComputedStyle` 的 backgroundColor/color。本次用它拿到了 P0-1 的亮/暗实测值。
  需要先 `astro build`，脚本模式照 `scripts/shots.mjs`（msedge channel + 127.0.0.1:4399）。

### 遗留

- `astro check` 仍有 29 条 hints，非本批引入（27 条 `astro:content` 的 `z` deprecation、
  `execCommand` deprecation、`migrate-posts.mjs` 未用导入）。**新增 1 条**来自 `Card.astro` 的
  `'Props' is declared but never used`：动态标签 `<Tag>` 让 Astro 的 props 推断没"读"到该接口。
  试过显式 `: Props` 标注 —— 会关掉 rest 透传并新增 4 个 error，不值得，保留 hint。
- `index.astro:215` 的 bento `.ico`（`bg-wash-*` + `text-on-wash`，暗色下是 22px 亮色小方块）
  是 P0-3 的同源形态，但报告未列、计划未要求，**本批未动**，留给 S13/S16 一并处理。

---

## 八、S11 实施记录（P0-2 移动导航改 CSS-only，吸收 P2-14）

### 做法

`Header.astro` 的移动菜单从「`<button>` + JS 移除 `hidden`」改成 `<details><summary>`：

- 展开态由 `<details open>` 承载 —— 浏览器原生管理，**没有 JS 也能展开 / 跳转 / 收起**；
  桌面导航（`lg:flex`）与其余结构未动。
- 图标切换不再靠 JS toggle `hidden`，改为 `group-open:hidden` / `group-open:block`
  （`<details class="mobile-menu group">`）。产物选择器已核：
  `.group-open\:block:is(:where(.group):is([open],:popover-open,:open) *)`。
- `summary` 需要 `list-none` + `[&::-webkit-details-marker]:hidden` 压掉原生三角
  （与 `.prose details summary` 同一套处理）。
- 脚本只留增强：**点面板外关闭** + **Esc 关闭并归还焦点**。刻意**不代管 summary 的点击** ——
  否则会与 `<details>` 的原生切换打架、一次点击切两次。

### P2-14（一并解决）

面板底色从「继承 header 的半透明 `--nav-bg` + 模糊底」改为**实心 `--surface`**；
同时绝对定位到 header 下沿（`absolute inset-x-0 top-full`；header 的 `backdrop-blur`
使它成为绝对定位后代的包含块），**展开不再把正文顶下去**。

连带一处必需改动：面板里当前项的 active 底由 `bg-surface` 改成 `bg-surface-2` ——
面板本身就是 `--surface`，不换 token 的话 active 项与面板同色、看不出来。

### 语义

按计划移除冗余的 `aria-expanded` / `aria-controls`（`<summary>` 自带展开态播报）。
`aria-label` 保留，但取中性文案「菜单」：静态 label 无法随展开态变化，中性文案才不会在展开时撒谎。
产物已核：`dist/index.html` 里 `aria-expanded` / `aria-controls` 各出现 **0 次**。

### 验证（亮/暗 × 有/无 JS）

`shots.mjs` 的视口是 1440px，移动菜单在基线里根本不出现，所以 S11 另做了一次移动端走查
（375×812，Edge headless）：

| 组合 | 展开 | 再点收起 | 点面板链接到达 | 面板底色 | Esc | 点外面关 |
|---|---|---|---|---|---|---|
| light + JS | ✅ | ✅ | `/archives/` | `rgb(250,248,244)` = `--surface`，不透明 | ✅ 且焦点归还 summary | ✅ |
| light 无 JS | ✅ | ✅ | `/archives/` | 同上 | — | — |
| dark + JS | ✅ | ✅ | `/archives/` | `rgb(48,44,39)` = `--surface`，不透明 | ✅ | ✅ |
| dark 无 JS | ✅ | ✅ | `/archives/` | 同上（继承亮色） | — | — |

两点必须说清楚：

1. **「暗色 × 无 JS」这一格实际不存在** —— 主题由内联脚本按 `localStorage` 给 `<html>` 加 `dark`，
   JS 关掉就是亮色。所以四种组合实际只覆盖三种状态。
2. 1024px（`lg` 临界）下整块 `display:none`，已断言。

桌面视口回归：`final → s11` 稳定图**逐字节零差异**（仅 2 张已知抖动图不同）——
这次重写对 ≥lg 完全没有影响。截图落在 `.shots/mobile/`（每组合 `-closed` / `-open` 各一张）。

### 遗留

- `#mobile-menu` 这个 id 现在没有任何 ARIA 引用（`aria-controls` 已删），留着只作稳定选择器；
  脚本真正依赖的是 `data-mobile-menu`。S17 统一层级时可一并决定去留。
- 面板改为覆盖式（绝对定位）后不再推开正文 —— 有意的行为变更，基线拍不到，不构成回归。

---

## 九、S12 实施记录（P1-4 容器 token + `<Container>` + 消除 lg 空白死区）

### 做法

- 新增 `src/components/primitives/Container.astro`：props `width: 'narrow' | 'content' | 'standard' | 'wide'`、
  `id?`、`class?`，输出 `mx-auto w-full px-4 sm:px-6 max-w-<档位>`。档位值见 `global.css` 的 `--container-*`。
- **`<main>` 不再承担宽度与横向留白**：`BaseLayout` 的默认 `mainClass` 从
  `mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10` 收成 **`py-8 sm:py-10`**（只留纵向留白）。
- 页面级容器统一改用 `<Container>`（12 处）：

| 页面 | 档位 | 旧写法 |
|---|---|---|
| 归档 / 分类 / 标签 / 分类-slug / 标签-slug / 404 | standard | 靠 `<main>` 默认的 `max-w-5xl` |
| 首页下半 | standard | `mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6` |
| Footer | standard | `mx-auto max-w-5xl px-4 … sm:px-6` |
| PageLayout（关于 / 友链） | content | `mx-auto max-w-3xl` |
| 说说 / 搜索 | narrow | `mx-auto max-w-2xl` |
| 文章页 | wide | `mainClass` 里的 `max-w-6xl` |

### 关键坑：`max-width` 是 border-box，内边距会吃掉宽度

第一版按字面把 `--container-content` 定成 48rem（= 旧 `max-w-3xl` 的值），
结果**说说 / 搜索 / 关于 / 友链四页的内容栏各被压窄 48px** —— 截图当场报出来（4 页 × 亮暗 = 8 张变化）。

原因：旧结构里这四页的宽度是「外层 `<main>` 带内边距 + 内层元素只管 `max-w-*`、不带内边距」，
内层的 `max-width` 是**不含** gutter 的内容宽；而 `<Container>` 把 gutter 和 `max-width` 放在同一元素上，
`box-sizing: border-box` 下 48px 内边距必须从 max-width 里扣。

修法：把档位口径统一为**容器总宽（含 sm+ 的 1.5rem×2 内边距）**：
`narrow = 45rem`、`content = 51rem`（各 +3rem，复刻原内容宽 42rem / 48rem）；
`standard = 64rem`、`wide = 72rem` 不动 —— 这两档的旧值（`max-w-5xl` / `max-w-6xl`）
本来就是含 gutter 的总宽。改完截图回到「只有暗色分类胶囊在变」。

### TOC 断点：`xl` → `lg`

`PostLayout` 的侧栏 `hidden xl:block` 与 `Toc.astro` 的二次守卫一并提到 `lg:block`。
1024–1279px 这一档不再出现「宽容器 + 无侧栏」的横向浪费。实测（Edge headless，1440 高）：

| 视口 | 容器 | 正文栏 | 侧栏 |
|---|---|---|---|
| 1023px | 1023（满宽） | 896px（被 `max-w-4xl` 封顶） | 隐藏 |
| 1024px | 1024（满宽） | 712px | 224px |
| 1279px | 1152px | 840px | 224px |
| 1280px | 1152px | 840px | 224px |
| 1440px | 1152px | 840px | 224px |

- 1279 与 1280 **完全一致** → 断点切换不再卡在 `xl` 上跳变；新的跳变点是 1024（正文 896 → 712）。
- 1024px 下正文面板内边距是 `lg:p-12`，文字栏剩 616px，仍属舒适阅读宽度。
- 五个宽度横向溢出均为 0。截图：`.shots/breakpoints/`。

### 验收

| 闸门 | 结果 |
|---|---|
| `astro check` | 0 error / 0 warning |
| `astro build` | 38 页、`dist/_astro` 有 CSS；四个 `max-w-<档位>` 工具类都进了产物 |
| `contrast-audit` | 64 项全过 |
| 截图（1440px） | 亮色 13/13 与基线逐字节一致；暗色稳定图只有分类胶囊那 3 张（S5 的既有差异） |

产物逐页核对：归档/404 → `max-w-standard`；说说/搜索 → `max-w-narrow`；关于/友链 → `max-w-content`；
文章页 → `max-w-wide`；页脚 → `max-w-standard`。

### 残留的 `max-w-*`（都不该动，逐条说明）

`grep max-w- src/` 除 Container 自身的档位映射表外还剩 5 处：

1. `Prose.astro` 的 `max-w-none` —— 压掉 typography 自带的行宽限制（宽度已由容器管住）。
2. `PostLayout` 的 `<article class="min-w-0 max-w-4xl flex-1">` —— wide 容器**内部**的阅读栏上限，
   与侧栏抢空间时先收它，不是页面级容器。
3. `shuoshuo` 的 `max-w-sm` —— 单张配图的缩略上限。
4. `global.css` 的 `max-w-[92vw]` ×2 —— 灯箱对话框，按视口而非容器定宽。

### 遗留

- `index.astro` 的 `@media (max-width: 880px)`（bento 折叠）仍是裸像素 —— 属 S14。
- 首页 hero 的 `<section>` 自带 `px-6`、不吃容器（有意全幅），没有对应档位。

---

## 十、S14 + S15 实施记录（断点收口 / 锚点偏移单一来源）—— 提交 6 收尾

### S14（P1-6）断点收口

`index.astro` 的 `@media (max-width: 880px) { … }` 改用 Tailwind 的 `@variant max-bento`，
断点值来自 S3 冻结的 `--breakpoint-bento: 55rem`。`880px` 从源码里消失，
产物里也 grep 不到（只剩 `width>=55rem`）。

两个实现细节：

1. **折叠规则必须留在样式块最后**。`.bento > .cell` 与 `.cell:nth-of-type(n)` 同特异性 (0,2,0)，
   靠源序压过后者；Tailwind 把 `@variant` 展开成独立 media 块且位置跟源码走 ——
   已核对产物：折叠块 `.bento>.cell{grid-area:auto}` 在 @7186，`.cell:nth-of-type(4)` 在 @1157。
2. **`@variant` 展开成 `grid-template: none/1fr`**，等价于旧的三条声明
   （rows none / columns 1fr / areas none）—— 简写会把 areas 一并置回初值。

**语义差异（1px，已留档）**：Tailwind 的 `max-*` 变体是开区间 `width < 55rem`，旧写法是闭区间
`max-width: 880px`。实测：

| 视口 | 旧 | 新 |
|---|---|---|
| 879px | 折叠 | 折叠 |
| **880px** | **折叠** | **四列** |
| 881px | 四列 | 四列 |

折叠点从「≤880」变成「<880」—— 这是 `max-*` 变体的固有语义（`max-lg` 等同样是开区间）。
要闭区间就得把 `55rem` 再写死一遍（`@media (width <= 55rem)`），回到双源。选了单源 + 1px 差异。

### S15（P1-7）锚点偏移单一来源

- `global.css` 的 `[id] { scroll-margin-top: 5.5rem }` → `calc(var(--header-h) + 1.5rem)`（= 88px，数值不变）；
- 删掉 `Prose.astro` 的 `prose-headings:scroll-mt-24`（96px，第二套取值）—— 标题都有 id，`[id]` 已覆盖；
- 归档页吸顶年份 `sticky top-16` → `top-[var(--header-h)]`。

实测（真实浏览器跳锚点：`location.hash` 赋值 → 等平滑滚动落定 → 读 `getBoundingClientRect`）：

| 组合 | 标题 scroll-margin-top | h2 top | h3 top | 吸顶头底 | 判定 |
|---|---|---|---|---|---|
| light @1440（TOC 可见） | 88px | 88px | 88px | 65px | 未遮挡 |
| light @900（无 TOC） | 88px | 88px | 88px | 65px | 未遮挡 |
| dark @1440（TOC 可见） | 88px | 88px | 88px | 65px | 未遮挡 |
| dark @900（无 TOC） | 88px | 88px | 88px | 65px | 未遮挡 |

四组合下标题落点都精确等于 88px，比头底高 23px。该文没有 h4，h2/h3 覆盖了两种深度。

### 顺带修掉：Tailwind 把 docs/ 当成用例来源

S15 删掉 `prose-headings:scroll-mt-24` 之后，产物里居然**还在** —— 追查发现 Tailwind 的自动
来源探测把 `docs/` 的实施记录也扫了：文档正文里出现过的类名会产出规则。本项目文档引用过大量
旧类名（`hover:bg-accent-100`、`hover:shadow-card`、`text-white`…），它们在 S4/S7 已无消费点，
却一直以死规则的形式留在产物里。

修法：`global.css` 头部加 `@source not '../../docs';`，只让 `src/` 决定产物。
BaseLayout.css 63585 → 61432 B，四条死规则消失；`hover:bg-chip-hover`、`text-cat-on`、
`bg-cat-fill-*`、`card-surface` 等真实用例逐条核对仍在。

### 验收

| 闸门 | 结果 |
|---|---|
| `astro check` | 0 error / 0 warning |
| `contrast-audit` | 64 项全过 |
| `astro build` | 38 页，`dist/_astro` 有 CSS |
| 截图（1440px） | 与基线逐字节一致（除暗色分类胶囊 3 张既有差异）→ 零视觉变化 |

### 遗留

- 归档页年份 `h2` 的 `z-10` 不在 S15 范围 —— 属 S17（z-index 表）。
- `PostLayout` TOC 的 `sticky top-24` 是吸顶定位不是锚点偏移，未动；若想统一到 token，S17 顺手。

---

## 十一、S13 实施记录（P1-5 调色板收口：颜料阶 + 语义别名）

### 结构

`global.css` 的颜色分三层，字面值只允许出现在颜料阶：

| 层 | token | 性质 |
|---|---|---|
| 颜料阶 | `--paint-accent-50..950` | 玫瑰阶 11 档，**静态**（不随 `.dark` 翻转）——`::selection`、搜索高亮、404 按钮的 `dark:bg-accent-700` 依赖这个不变性 |
| 颜料阶 | `--paint-<色相>[-deep]` | 莫兰迪六色，亮/暗各一套（暗色亮深互换） |
| 语义层 | `--wash-*`（12） | `var(--paint-*)` 别名，只写一次；`:root.dark` 只覆写 `--paint-*`，别名在取值时按上下文自动切暗色 |
| 语义层 | `--color-accent-*`（@theme） | `var(--paint-accent-*)` 别名，类名 `accent-*` 不变 |
| 基础语义 | `--bg / --surface / --ink / …` | 亮暗各一套，维持原样 |

### 关键点

1. **`#835a58` 只写一次**：`--paint-accent-700: #835a58`，亮色 `--paint-pink-deep: var(--paint-accent-700)`。
   （审计核对：全文件字面色值重复仅剩一对 —— 见下。）
2. **`#1e1b18` 的重复是刻意的**：它是暗色 `--on-wash`（墨色）与 `--code-bg`（代码底）的共同值。
   两者角色无关，做别名会把「代码底色」和「文字色」耦合起来，改一个动两个 —— 保留重复并注释说明。
   计划/审计只点名了 `#835a58`，这条是实施时发现的第二处同值。
3. **为什么玫瑰阶不能别名进莫兰迪色相**：`--wash-pink-deep` 在暗色下是 `#c7a6a4`（浅色，做文字用），
   而 `--color-accent-700` 在暗色下必须仍是 `#835a58`。若 `--color-accent-700: var(--wash-pink-deep)`，
   暗色的选区/搜索高亮会变成浅粉 —— 视觉回归。所以颜料阶里两者各自成族，只在交点处单向引用。
4. **为什么 `wash-*` 的别名只写一次**：自定义属性在**取值时**才解析。`:root` 里的
   `--wash-pink: var(--paint-pink)` 继承到暗色元素时，`--paint-pink` 已是暗色值 → 自动跟随，
   无需在 `:root.dark` 再写一遍 `--wash-*`（旧结构是亮暗各写 12 条）。

### 取舍（与计划的偏差）

计划要求「accent-*（11 档）… 全部降级为指向颜料阶的语义别名」，已照做（`@theme` 里 11 条全为 `var()`）。
颜料阶因此比改前多出 23 条别名声明 —— 这是分层的一次性成本，换来的是一条可执行的规则：
**grep `#[0-9a-f]{6}` 应该只命中 `--paint-*`（和基础语义层）**。玫瑰阶保留全部 11 档
（含未消费的 400/500/800）：阶是完整的，砍档位是设计决策，不该在重构步骤里顺手做。

### 验收

| 闸门 | 结果 |
|---|---|
| `contrast-audit` | 64 项全过（var 链最长 4 层：`--chip-bg-hover → --color-accent-100 → --paint-accent-100`） |
| 字面值去重 | `#835a58` 仅 1 处；字面色值 53 → 52（少的那条就是被别名掉的重复） |
| `astro check` / `astro build` | 0 error；38 页，产物里 `--color-accent-* → var(--paint-accent-*)`、`:root{--wash-pink:var(--paint-pink)}` 全部就位 |
| 截图（1440px） | 亮色 13/13 与基线逐字节一致；暗色稳定图只有分类胶囊 3 张（S5 既有差异）→ **零视觉变化** |

---

## 十二、S16 实施记录（P1-8 颜色 / 阴影逃逸 token 收敛）

### 新增 token

| token | 值 | 消费点 |
|---|---|---|
| `--on-accent` | 亮 `#ffffff` / 暗 `var(--paint-accent-950)` | 404 回首页按钮的文字（计划点名的两个新 token 之一） |
| `--radius-media` | `0.75rem` | ImasAlbum 封面与无封面占位（计划点名的另一个） |
| `--scrim` / `--scrim-strong` / `--scrim-backdrop` | 黑 50% / 70% / 80% | 灯箱关闭钮常驻底 / 悬停 / `<dialog>` 整屏遮罩 |
| `--on-scrim` | `#ffffff`（静态） | 遮罩上的关闭钮文字 |

计划只点名了前两个；后四个是收敛 `Lightbox.astro` 的 `bg-black/50`、`hover:bg-black/70`、
`text-white` 与 `global.css` 的 `backdrop:bg-black/80` 所必需 —— 这些遮罩压在照片上、
亮暗同值，不适合借用任何主题色，只能自成一族（命名沿用 shadow-media 的「媒体遮罩」语义）。

### 收敛明细

- **ImasAlbum**：`rgb(120 105 90 / .18)` → `var(--shadow-media)`、`rgb(0 0 0 / .2)` →
  `var(--shadow-media-hover)`（S3 冻结时就是照这两个字面值抄的，故逐像素不变）；
  两处 `border-radius: 0.75rem` → `var(--radius-media)`。
  §六 担心的「`--shadow-media-hover` 进不了产物」已不复现 —— 被消费后正常产出。
- **Lightbox 关闭钮**：`bg-black/50 text-white hover:bg-black/70` →
  `bg-scrim text-on-scrim hover:bg-scrim-strong`。
- **灯箱 `<dialog>`**：`backdrop:bg-black/80` → `backdrop:bg-scrim-backdrop`；
  预览图 `shadow-2xl` → `shadow-media` —— 压在 80% 黑遮罩上两种阴影都看不出来，属无感变更。
- **404 按钮**：`text-white` + `dark:text-accent-950` → `text-on-accent`（`--on-accent` 随模式换值），
  `dark:` 前缀少写一个。

### 验收

| 闸门 | 结果 |
|---|---|
| `grep -rnE "rgb\(|shadow-2xl|text-white|bg-black/" src/` | **只剩 token 定义处**（global.css 的阴影/遮罩定义），`shadow-2xl` / `text-white` / `bg-black/` 归零 |
| `contrast-audit` | **66 项全过** —— 新增 `on-accent / accent-700`（亮，5.88）与 `on-accent / accent-300`（暗，8.40），配对随模式切换 |
| `astro check` / `astro build` | 0 error；`--radius-media` / `--scrim*` / `--on-accent` 全部进产物 |
| 截图（1440px） | 与基线逐字节一致（除暗色分类胶囊 3 张既有差异）→ **零视觉变化** |

审计口径说明：`on-accent` 的配对随模式切换（亮配 accent-700、暗配 accent-300），所以写成
`if (mode === …)` 分支而非统一配对 —— 这是审计脚本第一次出现按模式分叉的检查项。
遮罩上的 `--on-scrim` 无法核算（底下是任意的照片），不进审计，靠「黑底白字恒定对比」这一事实兜底。

---

## 十三、S17 实施记录（P1-9 z-index 统一表）

### 做法

`:root` 的三档 `--z-sticky-head: 10` / `--z-nav: 40` / `--z-skip: 50`（S3 已冻结）经
`@utility` 注册为 `z-sticky-head` / `z-nav` / `z-skip` 三个工具类，四个消费点全部迁移：

| 消费点 | 旧 | 新 |
|---|---|---|
| Header 吸顶 | `z-40` | `z-nav` |
| BaseLayout skip-link | `focus:z-50` | `focus:z-skip` |
| 归档页年份 h2（sticky） | `z-10` | `z-sticky-head` |
| `.code-copy-btn` | `z-10` | `z-sticky-head` |

归档年份与复制按钮共用 sticky-head 档 —— 两者语义同为「压过正文但不压过导航」，且取值本来就是 10，
不因共用而改变任何层叠结果。移动菜单面板**不设 z**：它是 header 的后代，整个 header 以 `z-nav`
成层，面板天然跟随（S11 已验证不压正文）。`grep -rn "z-[0-9]" src/` 已归零（仅剩注释里的规劝语）。

### 验收

| 闸门 | 结果 |
|---|---|
| `astro check` / `contrast-audit` | 0 error；66 项全过 |
| 产物 CSS | `.z-nav` / `.z-sticky-head` / `.focus\:z-skip` 三个规则全在，`:root` 带 `--z-*` 值 |
| 截图（1440px） | 亮色 13/13 与基线逐字节一致；暗色 3 张为 S5 既有差异（pixel-diff 带位置与 S12/S13/S16 时的记录逐项吻合：72×20 @ x 261–332，0.2202% / 0.3109%）→ 零视觉变化 |
| 探针（真实浏览器，msedge） | header=40；Tab 聚焦 skip-link z=50 且可见；年份 h2=10；TOC sticky=auto（本就不该有）；复制按钮（67 个，datastructure-03）z=10、滚动入视口后中心点命中自身（无遮挡）；移动面板 z=auto 继承 header、Esc 可关 |

### 遗留

- `PostLayout` TOC 的 `sticky top-24` 维持 S15 的留档决定：吸顶定位 ≠ 锚点偏移，不并入 token。
- 探针脚本落 `.shots/s17-verify.mjs` / `s17-verify2.mjs`（本地不进库）。

### 环境备忘：构建丢 CSS 从「间歇」观察到的两个新事实

S17 验收当天连续 6 次构建全部丢 CSS（此前记录的失败率约 1/3），清 `.vite` / `.astro` 缓存无效；
随后又连续 4 次成功。两个此前没记录的事实：

1. **失败时 HTML 不引用 CSS**（旧记录是「引用了但文件缺失」）—— 即客户端 vite 构建压根没产出
   CSS 资产，Astro 据此省略了 `<link>`。两种症状同源：资产缺失时 `<link>` 跟着消失。
2. **最小复现排除了 Tailwind**：同一份 vite 8.2.2 + `@tailwindcss/vite` 在独立工程里构建 CSS
   正常产出。间歇性只在 Astro 7.3.1 的完整构建管线里触发，怀疑方向是客户端构建（Rolldown）的
   CSS 资产产出竞态。`.shots/css-watch.mjs` 可在构建期间实时追踪 `.css` 的出现/搬移，留作后续排查工具。
   S22 的产物断言防线（`astro build && check-build`）依然是必要的兜底。

---

## 十四、S18 实施记录（P1-10 typography 改走 `--tw-prose-*`）

### 先说一个重要发现：此前的手写 prose 颜色规则全是死规则

`@tailwindcss/typography` 的规则产出在 **utilities 层**，而 `global.css` 里 `.prose` 相关手写
规则在 components 层 —— **层序压过特异性**，所以 `color: var(--body)`、标题 `--ink`、行内 code
`--wash-clay-deep`、引用 `font-style: normal` 这些声明从未生效过。实测（playwright 读计算样式）
改动前的正文渲染值：正文 `#374151`（typography 默认 gray-600）、标题 `#111827`、行内 code
`#111827` 且字重 600、**引用是斜体**（typography 的 `font-style: italic` 压掉了我们的 normal）。
本步因此不是纯重构，而是把设计意图真正落到渲染（计划口径里的「预期差异」由此而来）。

### 做法

- **颜色全量变量化**：`@layer utilities` 里新增 `.prose.prose` 块，显式声明全部 17 个
  `--tw-prose-*` 变量，值全部引用主题 token。亮暗翻转跟随 `:root.dark` 换值；
  双类 (0,2,0) 用于压过插件写在同层的 `.prose` 默认调色板 (0,1,0)。
  对应地，`Prose.astro` 移除 `prose-neutral dark:prose-invert`（灰阶调色板与反色重映射
  `.dark\:prose-invert` (0,2,0) 同特异性，不删会靠源序翻回来）与 `prose-a:text-wash-pink-deep`
  （链接色走 `--tw-prose-links`）；保留 `prose-a:decoration-wash-pink`（下划线浅粉 ≠ 链接深色，
  有意区分）、`underline-offset-4`、`hover:text-wash-rose-deep` 与 `prose-img:*`。
- **字重 `!` 归零**：h1 700 / h2–h6 600 / strong,b,th,dt 600 / 行内 code 400 搬进同层，
  靠 (0,1,1) > (0,1,0) 的特异性取胜，不再用 `!important`。
- **引用修正**：`font-style: normal` 与「去装饰引号」（`blockquote p:first/last::before/after
  content:none`）同样搬进 utilities 层 —— 此前 `content: none` 也是死规则，引用两端一直渲染着
  typography 的弯引号。
- **删除整块冗余**：`.prose pre code` 的 5 个 `!`（bg/border/padding/字号/颜色）—— 产物里
  typography 自带等价的 pre code 重置（color/font-size inherit、background `#0000`、border 0、
  `::before/::after content: none`），该块连同 `::before/::after` 一并删除。
  `.prose hr` / `.prose tbody tr` 两规则删除（改由 `--tw-prose-hr` / `--tw-prose-td-borders`）；
  `.prose thead th` 只留 background（typography 不管表头底色），color 交还 `--tw-prose-headings`。
- **保留的 `!`**：`.astro-code` 的 `background-color: var(--code-bg) !important`（压 shiki 的
  内联 style，与 typography 无关）与 reduced-motion 四处（计划明确保留）。
  全文件 `!important` 计数 6 处（4 条规则），无一属于 `.prose`。

### 一个实现期的坑（留档）

Tailwind 的源扫描**连注释也扫**：第一版注释里写了 `prose-neutral` / `dark:prose-invert` 字面量，
产物里这两个类又被生成回来。注释措辞改为「灰阶调色板与反色修饰类」后消失 —— 以后写注释
描述「已删除的类」时不要写出类名字面量。

### 验收

| 闸门 | 结果 |
|---|---|
| `astro check` / `contrast-audit` | 0 error；66 项全过 |
| 产物 CSS | `.prose.prose{--tw-prose-body:var(--body)…}` 17 变量就位；`.prose h1{font-weight:700}`（无 `!`）；`.dark\:prose-invert` 重映射与 `.prose-neutral` 归零；BaseLayout.css 62.1 → 60.6 kB |
| 计算样式实测（light/dark） | 正文 `#5c564d`/`#cdc5b8` = `--body`；标题 `#45403a`/`#eae4d9` = `--ink`（600）；行内 code `#7f574e`/`#c8aba1` = clay-deep（400）；引用非斜体、边线 `#7f8a9b` = mist-deep；链接 `#835a58` = pink-deep；表头底 `--surface-2`；pre 底 `--code-bg` |
| 截图（1440px） | 稳定图新增差异 3 张：`about.light/dark`、`links.dark` —— 全部是有 Prose 正文的页，像素带为文字形状（多行段落重着色），无布局位移；`home/category-tech/tag-idolmaster.dark` 3 张为 S5 既有差异。post 两张在已知抖动名单内（人工走查：暗色文章页表格/折叠/代码块/TOC 结构完好） |

### 预期视觉差异清单（逐处理由）

| 元素 | 改前（typography 默认灰） | 改后（token） | 理由 |
|---|---|---|---|
| 正文 | `#374151` 冷灰 / 暗 `#d1d5db` | `--body` 暖灰 | 恢复设计意图（原死规则） |
| 标题 | `#111827` / `#fff` | `--ink` | 同上 |
| 行内 code 色/字重 | `#111827` 600 / `#fff` 600 | clay-deep 400 | 原 chip 设计为常规字重暖沙色 |
| 引用 | 斜体 + 两端弯引号 | 正体、无引号 | 原死规则；中文斜体本就不该用 |
| 加粗 | `#111827` / `#fff` | `--ink` | 强调与标题同色阶（新决策，值随 token 暖化） |
| hr / 表格边线 | gray-200 系 | `--line` | 与全站边线 token 统一 |
| 列表计数/圆点/figcaption | gray-500/400 系 | `--sub` / `--line` | 同语义 token 化 |
| kbd 文字色 | gray-900 系 | `--ink` | 同上 |
| 链接 | pink-deep（prose-a 修饰） | 不变（改由 `--tw-prose-links` 驱动） | 仅换驱动方式 |

### 遗留

- `--tw-prose-kbd-shadows` 未显式声明（kbd 阴影为固定半透明深色，亮暗观感均可，暂留默认）。
- prose 相关截图基线自此需要「心里换基线」：后续步骤对比时应把 about/links/post 的文字色差异
  视为 S18 的新常态（本记录即为依据）。

---

*本计划基于 2026-09-13 工作区快照与源码逐处核对；行号以该快照为准。*
