# State Management

> 站点没有客户端状态库。状态分三层：构建期数据、URL/原生状态、少量本地偏好。

## 1. 构建期数据（默认）

- 内容与列表在构建期读取：`getCollection()`（`src/pages/index.astro`）、`import` JSON（`src/data/*.json`）。
- 页面只把最终需要的字段写进标记；不要在浏览器里再请求站点自己的内容 API。
- 音乐有例外：BGM 歌单走同源静态端点 `src/pages/music/netease-playlist.json.ts`，首次播放才取，避免每页内联 73 首。

## 2. URL 与原生状态

- 路由参数、查询串、`#hash` 是首选状态；TOC 的当前节由滚动位置与 hash 推导，不持久化（`src/scripts/toc.ts`）。
- 分页、主题、搜索都由 URL 或 DOM 原生行为驱动，不引入全局 store。
- 换页由 ClientRouter 处理；需要跨页保持的只是播放器/主题这类明确偏好。

## 3. 本地偏好（localStorage）

- 只存两类：主题 `theme`（`BaseLayout.astro`、`ThemeToggle.astro`）与音乐 `music-volume` / `music-muted`（`src/scripts/music.ts`）。
- 读写必须 `try/catch`；存储不可用时退回默认值，不阻塞功能。
- 值必须校验：数字用 `Number.isFinite`，布尔用显式字符串/数字约定；坏数据当作没有。
- 不要在 `localStorage` 存页面数据、搜索结果或播放队列。

## 跨组件协调

- 用 DOM 事件与 data 属性，不共享模块实例：
  - `MUSIC_TRIGGER_SELECTOR` 标记播放触发点；
  - `music:interrupt` 让其它播放器暂停（`src/scripts/music-contract.ts`）；
  - `data-music-player`、`data-state`、`data-music-ready` 表示播放器边界与状态。
- 文章内播放器与 BGM 共用同一个运行时（`src/scripts/music.ts`），但数据来源不同：单曲内联、歌单端点。
- 播放失败是粘性状态：`data-state="error"` 保持到用户再次点击；不自动重试、不自动切歌。

## 后台数据

- `scripts/admin/` 直接读写仓库文件（JSON/Markdown），不是站点运行时状态。
- taxonomy 的 PUT 语义是整表替换；登记单个词条要带回现有映射（`buildTaxonomyEntryPatch`，`src/lib/taxonomy.ts`）。

## 反模式

- 为一个开关引入 store/状态库。
- 在组件里直接读写 `localStorage` 而不处理异常。
- 运行时请求第三方音乐/B 站 API：音频地址与 iframe 都按现有适配层生成。
- 把播放器状态塞进 URL 或全局对象。
