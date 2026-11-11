# 验证记录：页面标题朝华明朝体

日期：2026-11-11。preview `127.0.0.1:4399`，Chromium 1248。

## hero 子集扩展

`npm run hero:font`：

```
[hero-font] hero 芹菜P的部落阁せりな + 页面标题 39 条
[hero-font] 需要 110 个字形：#-567ACDFHLMPRSTWdegikmnopswyせなり万不乐习于享偶像入公关分务友告哥园图在场堂处大存学小师库归情戏我技据接搜数术构析柏标档法游源漫现理画百的站笔签类索结考芹菜落表记说课资输部鉴链阁青面音页频题
共 31 个分片，合计 120.3 KB → public/fonts/hero-mincho.css（CSS 8.0KB）
```

- 页面标题字符来源：taxonomy 的 6 个分类 + 23 个标签、about frontmatter、`PageHeader` / `PageLayout` 字面标题、404 的 h1、tag 页 `#` 前缀。
- 全部 110 个码点都能在 ZeoSeven item 2101 的分片里找到，脚本无「不在码表」警告。
- 字体族仍是 `ZhaohuaMinA Bold`；产物路径不变，不入库。

## 页面标题实测（1440 宽）

| 路由 | h1 | computed font-family 首项 | 加载的 woff2 |
| --- | --- | --- | --- |
| `/archives/` | 归档 | ZhaohuaMinA Bold | 14, 26（约 8KB） |
| `/categories/` | 分类 | 同上 | 8, 9（约 11KB） |
| `/about/` | 关于我 | 同上 | 9, 13（约 11KB） |
| `/tags/` | 标签 | 同上 | 14, 18（约 10KB） |
| `/tags/idolmaster/` | # 偶像大师 | 同上 | 0, 6, 7, 11, 20 等（约 23KB） |
| `/links/` | 友情链接 | 同上 | 8, 12, 14, 21（约 17KB） |
| `/shuoshuo/` | 说说 | 同上 | 12（约 5KB） |
| `/emoji/` | 表情图鉴 | 同上 | 5, 12, 29（约 13KB） |
| `/search/` | 搜索 | 同上 | 10, 23（约 7KB） |
| `/404.html` | 页面不存在 | 同上 | 6, 13, 19, 30（约 13KB） |

- 每个页面只下载标题实际用到的分片（2–6 个，约 5–23KB）；`hero-mincho.css` 8KB 全局共享。
- 390 宽：上述标题宽度 358px 内、页面横向溢出 0；亮 / 暗截图检查通过。

## 不受影响的部分

- 首页 hero h1 仍 `ZhaohuaMinA Bold`，加载 10 个分片（约 30KB，与改动前一致）。
- 文章页 `.post-title` / `.prose h2` 仍是 `Noto Serif SC`，加载 `heading-serif/0.woff2`（70KB）；文章页只加载 `hero-mincho.css` 8KB，不下载 hero 分片（没有 Zhaohua 字形）。
- 导航、卡片标题、分区 h2 未改。

## 回退演练

1. 移走 `public/fonts/hero-mincho.css` 与 `hero-mincho/`。
2. 直接 `node node_modules/astro/bin/astro.mjs build`（跳过 prebuild）：
   - 构建成功（50 页）；
   - 首页只有 `https://fontsapi.zeoseven.com/2101/main/result.css` 一条字体 CSS；
   - `/archives/` 没有任何 hero 字体 link，h1 回退 `--font-hero` 的系统栈。
3. 恢复产物并 `npm run build`，link 回来。

## 闸门

- `npm run lint`：通过。
- `npm test`：226 passed。
- `npm run check`：astro check + 对比度审计通过。
- `npm run build`：通过（50 页）。

## 已知限制

- 朝华明朝体只有 Bold 700，页面标题比原来的系统无衬线更重；这是用户选定的 hero 字体本身属性。
- 分类/标签名新增时，taxonomy 变更后重新构建即可纳入子集；未登记的动态标题字符会逐字回退系统衬线。
- hero 子集 CSS 现在所有页面都会加载（8KB），但 woff2 仍按 unicode-range 按需下载。
