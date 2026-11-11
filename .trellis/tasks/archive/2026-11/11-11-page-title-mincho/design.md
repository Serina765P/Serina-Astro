# 技术设计：页面标题朝华明朝体

## 1. 字符集扩展（`scripts/build-hero-font.mjs`）

现有 `texts = [heroTitle, heroMark]`；新增 `collectPageTitleTexts()`：

| 来源 | 解析方式 |
| --- | --- |
| 分类 / 标签页标题 | `src/data/taxonomy.json` 的 `categorySlugs` / `tagSlugs` 键 |
| about 页标题 | `src/content/pages/*.md` frontmatter `title`（`yaml.parse`） |
| 静态页面标题 | 递归读 `src/pages/**/*.astro`，正则 `<(PageHeader|PageLayout)\b[^>]*\btitle="([^"]+)"` |
| 404 | 同文件递归，正则 `<h1\b[^>]*>([^<{]+)<\/h1>` 的字面文本 |
| tag 前缀 | 固定补 `#` |

去重、去空白后与 hero 文案合并（实测 110 个码点、31 个分片、合计 120.3KB、CSS 8.0KB），再走现有的「按 unicode-range 分片 → subset-font」流程。产物仍是 `public/fonts/hero-mincho.css` + `public/fonts/hero-mincho/*.woff2`，字体族 `ZhaohuaMinA Bold` 不变。

注意：`result.css` 的缓存要重新校验——新增码点若不在缓存的 faces 里，现有逻辑会回源拉一次；无需改缓存结构。

## 2. 全局加载（`BaseLayout.astro`）

```astro
{heroFontBuilt ? (
  <link rel="stylesheet" href="/fonts/hero-mincho.css" />
) : (
  heroFont && <link rel="stylesheet" href="https://fontsapi.zeoseven.com/2101/main/result.css" />
)}
```

- 生成成功：所有页面共享一份 CSS；`@font-face` 带 unicode-range，页面没用到字形时浏览器不下载 woff2。
- 生成失败：仅首页保留 CDN 完整 CSS（hero 必需）；其它页面 `--font-hero` 走系统衬线回退。

## 3. 应用位置

| 文件 | 改动 |
| --- | --- |
| `src/components/primitives/PageHeader.astro` | h1 class 增加 `font-hero` |
| `src/pages/404.astro` | h1 class 增加 `font-hero` |

`font-hero` 是 `@theme` 的 `--font-hero` 生成的 Tailwind 工具类；不存在时也可以显式写 `style="font-family: var(--font-hero)"`，但优先工具类。

不影响 `PostLayout` 的 `.post-title`（`--font-serif`）与 `Prose` 的 h2。

## 4. 视觉与边界

- 朝华明朝体只有 Bold 700；页面标题会从系统无衬线的 600/700 变成明朝体 Bold。字号仍是 `--text-display` 的 clamp(2.25rem, 5vw, 3.75rem)，不另设。
- 分类/标签名含拉丁（`Hi-Res`、`MLTD`、`Windows` 等）：这些字符来自 taxonomy 键，会进入子集；若字体本身没有对应字形，`@font-face` 仍声明 unicode-range，浏览器按字符回退到 Songti/SimSun。
- 动态新增分类/标签：taxonomy 是唯一来源，新增条目后重新构建即可把新字纳入子集。
- 长标题在窄屏的换行：`text-display` 的 clamp 与 `text-wrap: balance`（全局 `h1` 规则）保持；需 390 宽实测。

## 5. 失败与回退

- ZeoSeven 不可用 / 分片解析失败：脚本 warn，不写新产物；`BaseLayout` 检测不到 CSS → 首页 CDN、其它页系统衬线。
- 新增字符不在字体码表：脚本 warn 列出缺失字符，浏览器逐字回退，不影响同标题其它字。

## 6. 验证

- `npm run hero:font`：日志字数增加；产物大小记录。
- 浏览器：上述 6 条路由的 h1 computed font-family；`document.fonts.check('700 60px "ZhaohuaMinA Bold"')`。
- 文章页 `.post-title` computed 仍 `Noto Serif SC`。
- 390 / 1024 / 1440 亮暗截图；首页 hero、列表卡片不受影响。
- 生成失败演练：临时移走 `hero-mincho.css` 后 build（跳过 prebuild 或断网缓存），首页 CDN 回退、其它页系统衬线，构建成功。
- 闸门：lint / test / check / build。

## 7. 回滚

- 回滚点 1：`PageHeader` / 404 的 `font-hero` class（两处），页面标题回到无衬线，hero 子集扩展保留无害。
- 回滚点 2：`BaseLayout` 全局 link 恢复为只在 `heroFont` 时加载。
- 回滚点 3：`build-hero-font.mjs` 的额外字符收集函数；产物重新生成成旧 10 字子集。
