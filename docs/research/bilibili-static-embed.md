# Bilibili 静态嵌入：pagelist CORS 与官方 iframe

调研时间：2026-10-30。实测使用桌面 Chromium 150、真实线上页面 `https://blog.serinap.top/`、临时 `file://` 页面及 Bilibili 第一方端点；未登录 Bilibili，未使用代理。

## 结论

- **父页面不能直接 `fetch` pagelist。** `GET https://api.bilibili.com/x/player/pagelist?bvid=BV1aYxg6DEXb` 在博客源和 `file://` 源均失败；`credentials: "omit"` 与 `"include"` 都一样。响应对这两个源是 **HTTP 403**，且没有 `Access-Control-Allow-Origin`。这不是靠凭据或本地文件就能绕过的 CORS 问题。
- **官方 iframe 不依赖父页面的 pagelist fetch。** 在博客源和 `file://` 页面中，`https://player.bilibili.com/player.html?bvid=BV1aYxg6DEXb&p=1&autoplay=0` 均成功加载；视频元素达到 `readyState === 4`，时长为 143 秒。iframe 导航与脚本读取跨源 JSON 是不同机制。[MDN 的 CORS 说明](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)也明确区分嵌入资源与读取其数据。
- **已知 BV 和 p 时，不必另外提供 aid 或 cid。** [官方外链播放器文档](https://player.bilibili.com/)说明 aid、bvid 二选一；cid 不是必需参数。`p` 从 1 开始，但**一旦提供 cid，`p` 不生效**。实测 `bvid + p=1` 和 `bvid + cid=43099292743` 两种 URL 都能加载目标视频。
- **公开元数据请求不应使用 credentials。** `include` 在实测中没有让请求成功，反而会把可用的 Bilibili cookies 带入跨源请求；它不是公开 pagelist 的解锁条件。官方播放器内部如何管理自己的登录态是独立问题，不要求父页面使用 credentialed fetch。

## 第一方证据

### 1. pagelist 的响应随 Origin 改变

请求均为同一个[第一方 pagelist URL](https://api.bilibili.com/x/player/pagelist?bvid=BV1aYxg6DEXb)，实测于 2026-10-30 10:47–10:52 UTC：

| 请求环境 / Origin | HTTP 结果 | 关键响应头 / 浏览器结果 |
| --- | --- | --- |
| 无 `Origin`（直接 HTTP 请求） | 200 JSON | `code: 0`；仅一 P，`page: 1`，`cid: 43099292743`，`duration: 143` |
| `https://blog.serinap.top` | 403 HTML | 无 `Access-Control-Allow-Origin`；Chromium `fetch` 为 `TypeError: Failed to fetch` / `net::ERR_FAILED` |
| `null`（本地文件） | 403 HTML | 无 `Access-Control-Allow-Origin`；两种 credentials 模式均失败 |
| `https://www.bilibili.com` | 200 JSON | `Access-Control-Allow-Origin: https://www.bilibili.com`、`Access-Control-Allow-Credentials: true`、`Vary: Origin` |

普通 GET 没有触发 preflight；失败发生在实际请求。额外用 `OPTIONS` 模拟 preflight 也得到 403。Bilibili 同源站被明确允许，并不表示任意站点被允许。由于响应不是可读的 CORS 成功响应，博客 JavaScript 无法取得上述 cid，尽管非浏览器直接请求可以。

### 2. 官方播放器参数与维护迹象

[官方使用文档](https://player.bilibili.com/)给出的基础地址是 `https://player.bilibili.com/player.html`，示例直接使用 `bvid`。参数表定义 `autoplay`、`muted`、`poster`、`danmaku` 等选项，并规定 cid 会覆盖 p。

[本次加载的官方 player HTML](https://player.bilibili.com/player.html?bvid=BV1aYxg6DEXb&p=1&autoplay=0)与文档一致：它把 `bvid`、`cid`、`p`（也兼容 `page`）传给 `nano.createPlayer`，并将 `autoplay` 默认设为 `true`。响应为 200，含 `Cross-Origin-Resource-Policy: cross-origin`，未返回禁止嵌入的 `X-Frame-Options`；`Last-Modified: Mon, 19 Oct 2026 08:04:19 GMT`，是文档和播放器仍在维护的直接迹象。显式 `autoplay=0` 可避免采用源码中的默认自动播放值。

## 方案取舍

| 方案 | 优点 | 限制 |
| --- | --- | --- |
| 浏览器 pagelist 动态查 cid | 不需在内容中保存 cid | 当前博客源和本地文件均不可用；credentials 无效 |
| `bvid + p` 官方 iframe | 与已有 BV/p 输入匹配；官方支持；实测线上和本地可加载 | 分 P 解析由播放器完成；`p` 必须正确 |
| `bvid + cid` 官方 iframe | 可精确指定分 P；实测可加载 | cid 使 p 失效；视频分 P 变化后保存的 cid 可能过时；aid 仍非必需 |

因此，在“无代理/服务器、已有 BV 和 p”的边界内，直接官方 iframe 已验证可行；父页面 API 动态解析则不可行。以上只是能力结论，不替代嵌入交互或视觉设计决策。

## 仍需运行时确认的项目

- 实测只有桌面 Chromium；Safari/WebKit、Firefox、iOS/Android 的播放器跳转、自动播放策略及实际点击播放仍未验证。
- 验证了加载、视频元数据和可播放缓冲状态，未进行人工听看，也未验证登录后清晰度、弹幕发送或受限视频。
- Bilibili 可按账号、地区、网络出口和视频状态改变响应；403/CORS 行为及 iframe 可用性没有长期稳定性保证。pagelist 未找到面向第三方开发者的正式稳定性或 CORS 支持承诺，不能把一次非浏览器 200 当成公开 API 合约。
- 多 P 只有官方参数规则可依据； supplied 视频只有一 P，未实测其他分 P、失效 p、错误 cid 或 cid 与 bvid 不匹配时的错误表现。
- 若站点以后添加 CSP，需要单独确认 `frame-src` 是否允许 `https://player.bilibili.com`；本次线上页面没有因此阻止嵌入。
