# 验证记录：标题宋体子集

日期：2026-11-11。环境同前一任务：preview `127.0.0.1:4399`，Chromium 1248。

## 生成产物

`npm run heading:font`：

```
[heading-font] 收集到 363 个字形，分 1 块
[heading-font] 共 1 个分片，合计 69.7 KB → public/fonts/heading-serif.css
```

- 字符集：12 篇文章 h1（frontmatter title）+ Markdown `##` 标题 + about 页 `##` 标题，以及 imas-hires 手写 `<h2>`（资源分组标题）。
- 产物：`public/fonts/heading-serif.css`（3.2KB，含 unicode-range）+ `0.woff2`（70KB）。
- 字体：Google Fonts `Noto Serif SC` 700（OFL-1.1），构建期 `text=` 子集，运行时自托管。
- 与站内实际渲染的 `.prose h2` / `.post-title` 字符比对：除 `📂`、`💿` 两个 emoji（思源宋体无字形，浏览器回退 emoji 字体）外全部覆盖；游戏组件里的 `<h2>`（`text-xs` 样式、非 `.prose`）不在扫描范围，也不使用衬线字体。

## 浏览器实测

| 页面 | `/fonts/heading-serif.css` | woff2 | `document.fonts` |
| --- | --- | --- | --- |
| `/`（首页） | 200 | **未请求** | `Noto Serif SC` 700 unloaded |
| `/about/` | 200 | 200 | loaded |
| `/posts/datastructure-02/` | 200 | 200 | loaded |

- `.post-title` / `.prose h2` computed `font-family` 以 `"Noto Serif SC"` 开头；
  `document.fonts.check('700 36px "Noto Serif SC"')` = true。
- 首页只加载 1 个 3.2KB CSS，不下载 woff2（字体 face 带 unicode-range，且首页没有用衬线的标题）。
- 首页 hero 的 `ZhaohuaMinA Bold` 仍正常加载；`hero-mincho.css` link 保留。

## 回退演练

1. 临时移走 `public/fonts/heading-serif.css` 与 `heading-serif/`。
2. 直接 `node node_modules/astro/bin/astro.mjs build`（跳过 prebuild）：
   - 构建成功（50 页）；
   - 文章页 HTML 中 `heading-serif.css` 出现 0 次；
   - `--font-serif` 落到系统栈（本机 Noto Serif CJK SC）。
3. 恢复产物并重新 `npm run build`，文章页 link 回来。

## 闸门

- `npm run lint`：通过。
- `npm test`：226 passed。
- `npm run check`：astro check + 对比度审计全部通过。
- `npm run build`：通过（50 页，`check-build` CSS 产物断言通过）。
- 亮 / 暗截图：标题字重、字面无 fallback 错位（截图与系统 Noto Serif CJK SC 同设计，肉眼一致）。

## 已知限制

- 构建期需要访问 Google Fonts（`fonts.googleapis.com`）；失败时脚本 warn、不写新产物，构建继续，标题回退系统衬线。产物缓存于 `.cache/heading-serif/`，字符集不变时不回源。
- 新增文章标题字符会自动进入下一次构建的子集；字体文件按字符集哈希缓存，不会复用错字集。
- 新增标题若出现思源宋体没有的符号（emoji 等），浏览器按字符回退，不影响其余字符。
