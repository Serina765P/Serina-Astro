# 基线测量（改动前）

Chromium 153，`astro preview`，`/posts/pcshurufa/` 与 `/posts/mltd-appellations-statistics/`。

## 布局

| 视口 | 容器 | 文章栏 | `.post-panel` | `.prose` | 两侧留白 |
| --- | --- | --- | --- | --- | --- |
| 1920 | 1152 | 888 | 736 | 576 | 377 |
| 1440 | 1152 | 888 | 736 | 576 | 137 |
| 1024 | 976 | 712 | 712 | 576 | 24 |

## TOC 折叠按钮

1440 宽，`.toc-item` 内长标题（链接宽 312px）时：

- `toggleTop - linkTop = 29px` → 按钮被挤到第二行。
- 短标题（无 toggle 或未折叠）时两者同一行。

## 表格（`/posts/mltd-appellations-statistics/`）

- 表格宽度 576px（与 `.prose` 同宽）。
- `border-radius: 16px`，`font-size: 14.4px`，`table-layout: auto`。
- 该文档中的一张 4 列表格列宽：**52 / 71 / 64 / 387** px（不是 5.1；5.1 表是 5 列，改动前未单独取样）。
- 最后一列的 `Akane-Commu/013_card_blst_023aka0624.md#L107` 无空格长串是 min-content 的主因。

## 字体

- 首页请求 `fontsapi.zeoseven.com` 共 5 条：1 个 preconnect + 4 个 `result.css`（item 389 的 main / medium / semi-bold / bold）。
- hero 走本地 `/fonts/hero-mincho.css` 子集。

---

# 改动后实测

| 视口 | 容器 | 文章栏 | 面板 | 文本列 | 文本列左右 | 横向溢出 |
| --- | --- | --- | --- | --- | --- | --- |
| 1920 | 1280 | 976 | 832 | 640 | 505–1145 | 无 |
| 1440 | 1152 | 848 | 832 | 640 | 265–905 | 无 |
| 1024 | 1009 | 705 | 705 | 625 | 64–689 | 无 |
| 768 | 753 | 705 | 705 | 640 | 56.5–696.5 | 无 |
| 390 | 390 | 358 | 358 | 318 | 36–354 | 无 |

- 标题、元信息、正文共用同一条文本列（三档宽度实测 `prose.left == h1.left`）。
- 面板占屏宽：1920 下 43.3%（AC1 要求 ≥40%）。
- 1920 的容器 1280 来自 `@media (min-width: 1600px)`；1440 及以下未命中，数字与改动前一致。

## TOC

长标题下 `toggleTop − linkTop = 2px`（1920 / 1440 / 1024 均如此，AC2 要求 <4px）。展开全部节点后，一级左缘、二级 +12px、三级 +24px，有无按钮都一致。

## 表格

`/posts/mltd-appellations-statistics/` 的 5.1 表：`border-radius 0`、`font-size 16px`，列宽 `89 / 83 / 95 / 118 / 251`（1920 与 1440），前三列均 ≥80（AC3）。改动前同一张表未取样，可比的只有上面那张 4 列表的 52 / 71 / 64 / 387。390 宽下表格内部横滑（scrollWidth 774–1488 vs clientWidth 316），页面溢出 0。

## 字体

`/`、`/posts/pcshurufa/`、`/posts/mltd-appellations-statistics/` 三条路由的 `zeoseven` 请求数均为 0；产物 HTML 无 `fontsapi`，产物 CSS 无 `IBM Plex`。首页仍加载 10 个本地 `/fonts/hero-mincho/*.woff2`，`document.fonts.check("700 16px 'ZhaohuaMinA Bold'")` 为 true。
