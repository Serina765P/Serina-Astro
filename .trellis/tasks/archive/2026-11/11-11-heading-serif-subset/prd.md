# 文章标题字体：思源宋体子集自托管

## Goal

把文章 `h1` / `h2` 的衬线字体从「依赖系统宋体」改成构建期生成的自托管子集：只包含站内文章标题与 h2 真正用到的字形，字体族仍是 `Noto Serif SC`，系统栈作为回退。首页 hero 的朝华明朝体保持现状。

## Background

C 方向（`c36878c`）把文章标题与 h2 换成了系统衬线栈，本机预览落到 Noto Serif CJK SC（思源宋体）观感正好；但 Windows 默认没有思源宋体，回退到 SimSun 后观感明显变差。用户确认截图里的字体就是想要的，并同意自托管。

现有 hero 字体已经有一套可复用的构建期子集流程：`scripts/build-hero-font.mjs` 拉 ZeoSeven 分片 → `subset-font` → `public/fonts/hero-mincho.css` + woff2；`BaseLayout.astro` 用 `existsSync` 判断产物决定是否 `<link>`，失败回退远端。本任务照同一模式做标题字体。

## Confirmed Facts

- 站内 12 篇文章的 h1 + h2 去重后约 **358 个字符**（含标点/数字；实际扫描 363 字，含手写 `<h2>` 里的 emoji）；当前最大单篇 118 字。
- 用 Google Fonts `text=` 子集接口取这些字，实测 woff2 约 **70KB**（实现时含 imas-hires 手写 `<h2>` 的 emoji，共 363 字）；同样的字用本机 Noto Serif CJK SC Bold OTF 子集化约 156KB。
- `package.json` 的 `predev` / `prebuild` 目前只跑 `hero:font`；`BaseLayout.astro` 已有 `existsSync('public/fonts/hero-mincho.css')` 的回退模式。
- `--font-serif` 目前是 `'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', 'SimSun', serif`。
- AGENTS.md 约定「不允许正文 webfont / CDN 字体 CSS；唯一的本地字体是 hero 子集」——本次要把它扩成「hero + 标题两个构建期子集，均不入库」。

## Requirements

### R1 — 构建期子集脚本

新增 `scripts/build-heading-font.mjs`：

- 扫描 `src/content/posts/**/*.{md,mdx}` 的 frontmatter `title` 与正文 `##` 标题，以及 `src/content/pages/*.md` 的 `##` 标题；去重、去空白，得到字符集。
- 通过 Google Fonts CSS API `family=Noto+Serif+SC:wght@700&text=<chars>` 取子集 woff2；字符集超过单次 URL 安全长度时按块拆分，每块生成一条带 `unicode-range` 的 `@font-face`。
- 产物：`public/fonts/heading-serif.css` + `public/fonts/heading-serif/*.woff2`；`.cache/heading-serif/` 缓存源文件，字符集不变时不回源。
- 失败（网络/解析）只 `console.warn`，保留上一版产物，不中断构建。

### R2 — 字体栈

`--font-serif` 改为 `'Noto Serif SC', 'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', 'SimSun', serif`；`@font-face` 后字体族仍叫 `Noto Serif SC`，所以 CSS 规则不变。

### R3 — 构建脚本接入

`package.json` 增加 `"heading:font": "node scripts/build-heading-font.mjs"`，`predev` / `prebuild` 同时跑 `hero:font` 与 `heading:font`。

### R4 — 页面接入与回退

`BaseLayout.astro` 在 `public/fonts/heading-serif.css` 存在时输出 `<link rel="stylesheet" href="/fonts/heading-serif.css" />`；不存在时不输出，字体栈自然回退系统衬线。`font-display: swap`，不预加载。

### R5 — 规范同步

`visual-system.md` 记录标题字体来源、子集规模与回退栈；AGENTS.md 的「唯一本地字体」条目扩展为 hero + 标题两个构建期子集；CONTEXT.md 若需要可补术语。

## Acceptance Criteria

- [x] AC1 `npm run heading:font` 生成 CSS + 1 个 woff2（当前 363 字 / 70KB），日志给出字数与体积。
- [x] AC2 `npm run build` 后 `dist` 含字体产物，文章页 `<head>` 有 `/fonts/heading-serif.css` link。
- [x] AC3 浏览器实测标题 computed `font-family` 以 `Noto Serif SC` 开头；`document.fonts.check('700 36px "Noto Serif SC"')` 为 true；woff2 请求 200。
- [x] AC4 删除生成产物后构建仍成功、文章页无 link、标题回退系统衬线（不报错）。
- [x] AC5 首页 hero 的 `--font-hero` / 朝华子集不受影响。
- [x] AC6 `npm run lint` / `npm test` / `npm run check` / `npm run build` 全绿；亮/暗截图确认标题无闪烁或 fallback 错位（详见 research/verify.md）。

## Out of Scope

- 首页 hero 字体调整（用户选择保持现状）。
- 正文字体（继续 `--font-sans` 系统栈）。
- 管理后台预览字体。
- 正文里 h3/h4 的衬线化。
