# Directory Structure

> 目录边界决定代码放哪里。新增文件前先在这里找到归属；找不到再讨论。

## 顶层

| 路径 | 职责 |
| --- | --- |
| `src/pages/` | 文件路由与静态端点 |
| `src/layouts/` | 页面骨架（HTML、主题、ClientRouter、文章壳） |
| `src/components/` | `.astro` 组件；`primitives/` 是基元 |
| `src/lib/` | 纯逻辑与类型，构建期/浏览器无关，必须有测试 |
| `src/scripts/` | 浏览器运行时，由 `.astro` 的 `<script>` 引入 |
| `src/styles/` | 全局 Tailwind 入口、token、prose、播放器样式 |
| `src/data/` | 构建期读取的 JSON 数据（taxonomy、音乐快照、说说分片等） |
| `src/content/` | Markdown/MDX 内容集合（posts、pages） |
| `scripts/` | Node 工具与本地后台，不进入站点产物 |
| `worker/` | 独立 Cloudflare Email Worker 项目 |

## 路由

- `src/pages/posts/[id].astro` — 文章页；URL 为 `/posts/<id>/`。
- `src/pages/shuoshuo/[...page].astro` — 说说分页；`index.json.ts` 是同源 JSON。
- `src/pages/music/netease-playlist.json.ts` — 歌单静态端点；运行时首次播放才请求。
- `src/pages/rss.xml.js`、`src/pages/404.astro` — 固定路由。
- 页面 URL 一律尾斜杠；新增路由后检查 `astro.config.mjs` 的 `trailingSlash` 与站内链接。

## 组件

- 站点 chrome 与功能组件放 `src/components/` 根目录（`Header.astro`、`PostCard.astro`、`Toc.astro`）。
- 可复用基元放 `src/components/primitives/`：`Container.astro`、`Card.astro`、`TagChip.astro`、`PageHeader.astro`。
- 按领域分目录：`media/`（B 站）、`music/`（BGM 与文章播放器）、`skins/`（文章皮肤）、`games/`（小游戏）。
- 纯展示组件不直接读 `localStorage` 或 `window`；把交互交给 `src/scripts/`。

## Lib 与 Scripts 的分界

- `src/lib/` 必须能在 Node/Vitest 里直接运行：无 DOM、无 `window`、无副作用。示例：`bilibili.ts` 只拼 URL 与校验；`music.ts` 只做数据适配；`toc.ts` 只构树。
- `src/scripts/` 只放浏览器行为：DOM 查询、事件、媒体元素、`localStorage`。示例：`toc.ts`、`music.ts`、`music-loader.ts`、`bilibili.ts`。
- 跨层共享的常量/选择器放 `src/scripts/music-contract.ts` 这类小模块，避免运行时与组件各写一份字符串。
- 不要把构建期数据读取放进 `src/scripts/`；也不要把 DOM 操作放进 `src/lib/`。

## 数据与内容

- `src/data/taxonomy.json` 是分类/标签 slug 与配色的唯一数据源；`src/site.config.ts` 只 re-export。
- `src/data/music/netease-playlist.json` 是歌单快照；`npm run music:snapshot` 刷新。
- `src/data/shuoshuo/<沪年>.json` 是按年分片；信封 `{ source, fetched_at, count, items }`。
- `src/content.config.ts` 定义集合 schema；frontmatter 字段清单在 `src/lib/post-frontmatter.ts`。

## 工具与后台

- `scripts/` 是 Node 工具：`build-hero-font.mjs`、`check-build.mjs`、`contrast-audit.mjs`、`shots.mjs`、`fetch-netease-playlist.mjs`。
- `scripts/admin/` 是本地管理后台（Node HTTP + Vue 编辑器），有自己的测试 `scripts/admin/*.test.mjs`；不参与站点构建。
- `worker/` 有自己的 `package.json`、`wrangler.toml`、`test.mjs`；不要从站点脚本直接 import 它的源码。

## 反模式

- 在页面里再写一层 `max-w-*` 包裹：页面宽度只走 `Container`。
- 把浏览器代码放进 `src/lib/` 以便「复用」：会破坏 Vitest 的纯逻辑边界。
- 在 `src/scripts/` 里 import `src/data/*.json` 做构建期数据读取：数据应在构建期进入标记。
- 在 `src/components/` 里新增 React/Vue 站点岛：当前站点没有这套运行时。
