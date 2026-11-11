# 技术设计：标题宋体子集

## 1. 数据来源与字符集

扫描：

- `src/content/posts/**/*.md` 与 `*.mdx`：frontmatter `title` + 正文 `## ` 标题。
- `src/content/pages/*.md`：正文 `## ` 标题（about 页的 h2 也走 `.prose h2`）。

解析用 `yaml`（已是 devDependency）读 frontmatter；正文用轻量规则：逐行扫描，跳过 ``` 围栏代码块，取 `^##\s+(.+)$`；把 Markdown 修饰（`*`、`_`、反引号、链接目标、HTML 标签）去掉后保留字符。**宁可多收几个标点，也不要漏字形**——多收的字符只让子集大几百字节。

去重、去空白后排序，得到字符数组。

## 2. 子集获取

Google Fonts CSS API（OFL-1.1 字体，仅构建期使用，运行时全部自托管）：

```
https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700&display=swap&text=<encodeURIComponent(chars)>
```

响应是单个 `@font-face`，取其中第一个 `url(...)` 的 woff2 下载。

**分块**：每块最多 400 字符（URL 约 3.7KB，安全）；每块生成一条 `@font-face`，`unicode-range` 用该块的码点列表。当前 363 字 = 1 块，产物 70KB；未来标题增长也只是多几个分块，不会撞 URL 上限。

**缓存**：`.cache/heading-serif/<sha1(chars)>.woff2`。字符集不变时直接复用，不回源；字体版本更新也只在字符集变化时重取（可接受，标题不常改）。

## 3. 产物

```
public/fonts/heading-serif.css
public/fonts/heading-serif/0.woff2
```

CSS：

```css
/* 自动生成，请勿手改：npm run heading:font（predev / prebuild 会先跑一次） */
@font-face {
  font-family: 'Noto Serif SC';
  src: url('./heading-serif/0.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+4E00, ...;
}
```

`public/` 产物与 hero 一样不入库（`.gitignore` 需确认 `public/fonts` 的规则；hero 产物已忽略）。

## 4. 失败与回退

- 网络失败 / 响应里没有 woff2 / 解析失败 → `console.warn`，**不写新产物**，保留上一版；脚本退出码 0，构建继续。
- `BaseLayout.astro` 用 `existsSync(public/fonts/heading-serif.css)` 判断是否输出 `<link>`；不存在就不输出，`--font-serif` 落到系统栈（Linux 有 Noto Serif CJK，Windows 落 SimSun）。
- `font-display: swap`：先显示系统宋体，字体到了替换；不做 preload，避免首屏抢带宽。

## 5. 字体栈

```css
--font-serif:
  'Noto Serif SC',          /* 构建期子集，运行时自托管 */
  'Source Han Serif SC',    /* 用户本机装了思源宋体时 */
  'Noto Serif CJK SC',      /* Linux / Android 系统包 */
  'Songti SC',              /* macOS */
  'SimSun',                 /* Windows 兜底 */
  serif;
```

`@font-face` 的 family 名用 `Noto Serif SC`；即使子集 CSS 不存在，也不会误匹配系统字体（浏览器找不到该 @font-face 就继续按栈回退）。

## 6. 接入点

| 文件 | 改动 |
| --- | --- |
| `scripts/build-heading-font.mjs` | 新增：扫描、分块、拉取、缓存、写 CSS/woff2 |
| `package.json` | `heading:font`；`predev` / `prebuild` 串行跑两个 font 脚本 |
| `src/layouts/BaseLayout.astro` | `headingFontBuilt` + `<link rel="stylesheet" href="/fonts/heading-serif.css" />` |
| `src/styles/global.css` | `--font-serif` 首位加 `'Noto Serif SC'`，注释说明构建期子集 |
| `.trellis/spec/frontend/visual-system.md` | 字体来源、子集规模、回退栈 |
| `AGENTS.md`（本地、gitignored） | 「唯一本地字体」改为 hero + 标题两个构建期子集 |

## 7. 验证

- `npm run heading:font`：日志输出字符数、分块数、总字节；检查 `public/fonts/heading-serif.css`。
- `npm run build`：`dist` 含字体文件；文章页 HTML 有 link；首页 hero 的 `hero-mincho.css` link 仍在。
- Playwright：标题 computed font-family 以 `Noto Serif SC` 开头；`document.fonts.check('700 36px "Noto Serif SC"')`；`performance.getEntriesByType('resource')` 里 woff2 200；截图亮/暗。
- 回退：临时移走 `public/fonts/heading-serif.css` 后 build，文章页无 link，标题仍用系统 Noto Serif CJK（本机）——确认不报错。
- 闸门：lint / test / check / build；`check-build.mjs` 继续通过。

## 8. 风险与回滚

| 风险 | 处理 |
| --- | --- |
| 构建机访问不了 Google Fonts | 脚本 warn、回退系统衬线；hero 已有同类网络依赖先例 |
| 扫描规则漏掉 MDX 里动态生成的 h2 | 当前文章 h2 都是静态 Markdown；漏字时浏览器按 `unicode-range` 外回退系统字体，不会豆腐块 |
| 子集字体更新导致字形差异 | 字符集不变则复用缓存；只有新增标题才重新取 |
| 新增字体依赖违反「不入库字体」 | 产物在 `public/fonts/`（与 hero 同规则，gitignored），不提交二进制 |
| 首页 hero 被误改 | 任务不触碰 `--font-hero` / `hero-mincho.css`，AC5 专项检查 |

回滚：删除 `scripts/build-heading-font.mjs` + `package.json` 两处 + BaseLayout link + CSS 栈首位，恢复系统栈即可；产物目录可留可删。
