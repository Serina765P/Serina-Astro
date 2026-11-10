# Client Scripts

> 浏览器脚本的生命周期约定。站点用 ClientRouter，模块会重复执行；所有绑定必须幂等。

## 位置与引入

- 浏览器代码放 `src/scripts/*.ts`，由 `.astro` 的 `<script>` 引入（Astro 打包，自动仅客户端执行）。
- 纯逻辑放 `src/lib/`；脚本只做 DOM、事件、媒体与存储。
- 跨组件的选择器/事件名放 `src/scripts/music-contract.ts` 这类小模块，组件与运行时共用。

## ClientRouter 生命周期

- 模块级捕获的 DOM 引用在换页后失效。每次页面就绪都重新查询：`document.addEventListener('astro:page-load', mount)`。
- document 级监听器只绑定一次；幂等标记挂在 `document.documentElement.dataset`（`<html>` 不随换页替换）。
  - 例：`toc.ts` 的 `mount`、`music.ts` 的 `bindAll`、`ThemeToggle.astro` 的 `themeClickBound`。
- 需要在交换后重放的状态用 `astro:after-swap`（主题重新应用）；需要在交换前改行为的用 `astro:before-swap`（关闭平滑滚动）。
- 不要用模块级 `let el = document.querySelector(...)` 缓存跨页节点。

## 懒加载

- 重运行时只在用户意图后加载：`music-loader.ts` 在首次点击播放或展开 BGM 面板时 `import('./music')`，之前不请求音频、不加载 Video.js。
- 第三方请求也必须延迟：B 站 iframe 在点击入口后插入；歌单 JSON 在首次播放时请求。
- 判断「已经初始化」用根元素上的 `data-*` 标记（`data-music-ready`、`data-state`），不要只靠模块变量。

## 事件与清理

- 对动态 UI 用 document 级事件委托（`closest()`），避免为每个节点绑监听器。
- 换页前移除自己创建的定时器、ResizeObserver、IntersectionObserver；无法移除时在回调里检查 `isConnected`。
- 播放器互斥用自定义事件 `music:interrupt`（`music-contract.ts`），不要直接引用另一个组件的实例。
- 失败态保持到用户下一次操作；不要自动重试或自动跳下一首（`src/scripts/music.ts` 的边界注释）。

## 可测试性

- 能移出 DOM 的判断（URL 拼装、数据校验、状态转移）放 `src/lib/` 并用 Vitest 覆盖。
- DOM 行为用本地 preview 实际走查；截图基线用 `npm run shots`。
- 新脚本至少验证：首次加载、一次 ClientRouter 换页后、重复点击不会重复绑定。

## 反模式

- 在模块顶层直接绑定 `window`/`document` 监听器而不加幂等标记。
- 在 `.astro` 里内联大段交互逻辑（首屏主题引导脚本是唯一例外，见 `BaseLayout.astro`）。
- 用 `setInterval` 轮询 DOM 状态。
- 在脚本里读构建期 JSON 全量数据；需要的数据应由组件在构建期写进 `data-*` 或内联 `<script type="application/json">`。
