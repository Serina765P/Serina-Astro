# Bilibili 文章内播放器：#9 交互与浏览器验收记录

日期：2026-10-30。站点来源：`astro build` 产物 + `astro preview`（同源
`http://127.0.0.1:4322`）。浏览器：Chrome **150.0.7871.24**（headless，
omp browser / playwright-core 1.63）。临时冒烟文章
`src/content/posts/bilibili-embed-smoke.mdx` 验收后删除，未入库。

数据源与 CORS 结论见 `bilibili-static-embed.md`；本文只记 #9 的组件行为。

## 实现要点

- 组件：`src/components/media/BilibiliPlayer.astro`，MDX 里
  `<BilibiliPlayer bvid="BV1aYxg6DEXb" p={2} title="…" />`。`p` 省略时为 1，
  字符串写法（`p="2"`）也接受。
- 地址只在 `src/lib/bilibili.ts` 生成：
  `https://player.bilibili.com/player.html?bvid=<BV>&p=<正整数>&autoplay=0`，
  不传 aid/cid，没有父页面 pagelist 请求，也没有代理。原视频链接是
  `https://www.bilibili.com/video/<BV>?p=<n>`。
- 打开文章时只有入口（一个指向原视频的链接），点击后才插入官方 iframe：
  打开页面时对 `player.bilibili.com` 的请求是 0 条，比 `loading="lazy"`
  更彻底；iframe 仍带 `loading="lazy"`。脚本不可用时入口退化为普通跳转。
- 入口标题最多两行（`line-clamp-2`），视口窄于 23rem 时隐藏「点击加载官方播放器 ·
  背景音乐将暂停」提示行：长标题不能把入口撑出 16:9 舞台。完整标题仍在 DOM 里，
  无障碍名称与 iframe `title` 都不截断。
- 事件委托的守卫挂在 `Document` 对象上而不是 `<html>` 的 data 属性：实测 Astro
  换页会清空 `documentElement` 的属性，data 守卫撑不过一次导航。
- 跨源 iframe 拿不到内部播放状态，所以点击入口的同一时刻派发
  `music:interrupt`（`detail.source` 为组件根节点），BGM 暂停后不自动恢复。
- 加载失败态：10 秒内 iframe 没有 `load` 事件时移除 iframe，换成带原视频
  链接的提示，并用 `role="status"` 播报。`load` 不携带 HTTP 状态，播放器
  自己返回的错误页无法识别（见「已知边界」）。

## 验收项与结果

| 验收项（issue #9） | 做法 | 结果 |
| --- | --- | --- |
| 生成官方播放器 URL | 读 `data-bilibili-src` 与点击后的 `iframe.src` | 通过：`https://player.bilibili.com/player.html?bvid=BV1aYxg6DEXb&p=1&autoplay=0` |
| 无需 aid/cid/父页面 API/代理 | 检查 URL 参数与请求列表 | 通过：没有 `api.bilibili.com` 请求，除 iframe 导航外没有额外第三方请求 |
| 响应式、不溢出正文 | 1440×900、390×844、320×568、280×700（默认标题与 48 字长标题） | 通过：舞台宽度等于正文宽度，16:9；`document.scrollWidth` 等于视口宽，无横向滚动 |
| 可访问标题 | 检查 iframe `title` | 通过：显式 `title` 原样写入；省略时生成「B 站视频 <BV> 第 <n> P」 |
| 懒加载 | 打开文章时的 iframe 数、第三方请求；插入后的属性 | 通过：iframe 0 个、`player.bilibili.com` 请求 0 条；插入后 `loading="lazy"` |
| 原视频链接 | 入口 `href`、页脚链接、失败提示链接 | 通过：均为 `https://www.bilibili.com/video/BV1aYxg6DEXb?p=1` |
| 视频开始时暂停 BGM | 先播放 BGM（`#bgm` data-state=playing、`audio.paused=false`），再点入口 | 通过：BGM 变为 `paused`，2.5 秒后仍未恢复 |
| 结束后不自动恢复 | 在 iframe 内播放视频 2.46 秒后暂停，等待 1.5 秒 | 通过：BGM 保持 `paused` |
| ClientRouter 导航 | 文章 → 首页 → 冒烟文章（客户端导航，重复 3 轮），重新播放 BGM 后点击入口 | 通过：导航后是全新的 facade、无 iframe；点击后只有 1 个 iframe、URL 正确、BGM 暂停；监听器守卫在 Document 上 |
| 窄屏 | 390×844、320×568、280×700，默认标题与 48 字长标题 | 通过：长标题被 clamp 到两行，<23rem 时提示行隐藏；入口与页脚都不越界，未裁切 |
| 加载失败状态 | 把 `data-bilibili-src` 换成不可路由地址，等待超时 | 通过：`data-state="error"`、iframe 被移除、错误提示与原视频链接可见、`role="status"` 播报超时 |
| 键盘 | 聚焦入口按 Enter | 通过：不跳转，加载 iframe，焦点移到舞台容器 |
| autoplay 关闭 | iframe 内 `video` 状态 | 通过：`readyState=4`、`duration=143`、`paused=true` |

## 实测细节

- 点击前第三方请求里没有 `player.bilibili.com`（字体、giscus 等站内既有请求除外）。
- 点击后 iframe 内的 `video`：`readyState=4`、`duration=143`、`paused=true`，
  即 `autoplay=0` 生效；点击播放器控件后 `currentTime` 走到 2.46 秒，BGM 仍暂停。
- 失败态：超时前 iframe 一直在等响应；超时后 DOM 里没有 iframe，错误块显示
  「播放器没有加载出来…前往 B 站观看」，`data-bilibili-status` 为超时文案。
- ClientRouter 导航后重新插入的组件是 facade 状态；点击入口后页面里只有 1 个
  iframe。实测换页会清空 `<html>` 上的 data 属性（旧式 dataset 守卫因此失效），
  组件模块本身不会重复执行；守卫改挂 `Document` 对象后，即使重复执行也不会重复绑定。
- 280px 宽 + 48 字长标题：入口标题为两行、提示行隐藏，首个元素与末个元素都在
  舞台边界内；同一用例在 320/390px 也通过。

## 已知边界

- 只测了桌面 Chromium（headless）；Firefox、Safari、iOS/Android 真机未验证。
- 跨源 iframe 的 HTTP 状态与内部错误页不可读：Bilibili 返回禁止嵌入页面时
  iframe 仍会触发 `load`，组件会当成加载成功；只有「请求一直不返回」才进入
  失败态。
- 暂停发生在点击入口时，而不是 iframe 内视频真正开始播放时（后者不可观察）。
  这是 issue #9 评论里约定的做法：`music:interrupt` 只能在可观察的点击上派发。
- 入口没有视频封面：没有不依赖第三方请求的稳定封面源，视觉上是深色舞台 +
  B 站图标 + 标题。
- 分 P 只实测了 `p=1`（研究视频只有一 P）；其它 `p` 的解析交给官方播放器。
