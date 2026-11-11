# 页面标题统一朝华明朝体

## Goal

把页面级 h1（`PageHeader` 渲染的 archives / categories / tags / about / links / shuoshuo / emoji / search，以及 404 的 h1）统一成首页 hero 的朝华明朝体（`--font-hero`）。文章 `h1` / `h2` 继续用思源宋体，首页 hero 保持不变。

## Background

首页 hero 用 ZeoSeven item 2101「ZhaohuaMinA Bold」的本地子集（`scripts/build-hero-font.mjs` → `public/fonts/hero-mincho.css`），只覆盖「芹菜P的部落阁」+「せりな」10 个字，且只在首页链接。其余页面标题是系统无衬线 `text-display`，与 hero 的明朝体气质不一致。

用户要求「archives、categories、about 等页的标题统一换成 hero 的朝华明朝体」。

## Confirmed Facts

- 所有页面级 h1 都来自 `PageHeader.astro`（`text-display text-ink`），只有 404 页自己写 h1。
- `--font-hero: 'ZhaohuaMinA Bold', 'Songti SC', 'SimSun', serif`；字体只有一个 Bold 字重。
- hero 子集当前 10 个字，CSS 2.1KB；`BaseLayout` 只在 `heroFont` prop 为 true（首页）时链接，生成失败时回退 ZeoSeven CDN。
- 页面标题字符来源：`PageHeader` / `PageLayout` 的字面 title、about 页 frontmatter title、`taxonomy.json` 的 categorySlugs / tagSlugs 键、tag 页的 `#` 前缀、404 的 h1「页面不存在」。
- 文章 frontmatter 的 categories / tags 全部能在 `taxonomy.json` 找到（已核对）。
- 文章标题 `h1` 用 `--font-serif`（Noto Serif SC 子集），本次不动。

## Requirements

### R1 — 扩展 hero 子集字符集

`scripts/build-hero-font.mjs` 的文案来源在 `site-info.json` 之外，增加：

- `src/data/taxonomy.json` 的 categorySlugs / tagSlugs 键（分类/标签页标题）；
- `src/content/pages/*.md` 的 frontmatter `title`（about 页）；
- `src/pages/**/*.astro` 里 `<PageHeader ... title="…">`、`<PageLayout ... title="…">` 的字面标题；
- 404 的字面 `<h1>页面不存在</h1>`；
- tag 页标题的 `#` 前缀。

仍然按 unicode-range 分片子集化，产物路径/字体族不变。

### R2 — 全局加载与回退

`BaseLayout.astro`：`hero-mincho.css` 生成成功时所有页面都链接（CSS 小、缓存共享；woff2 只在页面用到对应字形时下载）；生成失败时仅首页回退 ZeoSeven CDN，其它页面回退 `--font-hero` 的系统衬线回退链。

### R3 — 应用到页面标题

- `PageHeader.astro` 的 h1 加 `font-hero`。
- `404.astro` 的 h1 加 `font-hero`。
- 不动 `PostLayout` 的 `.post-title`（仍 `--font-serif`）。

### R4 — 文档

visual-system.md 记录页面标题字体；README / AGENTS / CONTEXT 的 hero 字体描述同步为「hero + 页面标题」。

## Acceptance Criteria

- [x] AC1 `npm run hero:font` 重新生成的子集覆盖所有页面标题字符（用浏览器/字体 cmap 核对，缺失的只剩字体本身没有的符号）。
- [x] AC2 `/archives/`、`/categories/`、`/about/`、`/tags/`、任一 tag 页、`/404.html` 的 h1 computed `font-family` 以 `ZhaohuaMinA Bold` 开头。
- [x] AC3 首页 hero 仍正常；文章页 `.post-title` 仍是 `Noto Serif SC`，不受影响。
- [x] AC4 390 / 1024 / 1440 宽度下页面标题不溢出、不折行异常；亮/暗截图检查。
- [x] AC5 字体生成失败时构建仍成功，页面回退系统衬线。
- [x] AC6 `npm run lint` / `npm test` / `npm run check` / `npm run build` 全绿。

## Out of Scope

- 文章标题 / h2 字体（思源宋体）。
- 首页 hero 的字重/大小调整。
- 卡片标题、分区 h2（列表页内部小标题）。
