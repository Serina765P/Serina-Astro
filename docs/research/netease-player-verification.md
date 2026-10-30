# 网易云播放器：#12 交互与浏览器验收记录

日期：2026-10-30。实测浏览器 Chromium **153.0.0.0**（playwright-core 1.63 / chromium-1243）。
站点来源：构建产物 + `astro preview`（同源 `http://127.0.0.1:4322`）与真实线上源
`https://blog.serinap.top/`（只用于 #8 的数据链路验证）。临时冒烟文章在验收后删除，未入库。

数据链路的证据见 `netease-static-playlist.md`；本文只记 #12 的交互行为。

## 验收项与结果

| 验收项（issue #12） | 做法 | 结果 |
| --- | --- | --- |
| 全站固定歌单 8562312822 | `src/data/music/netease-playlist.json` 快照 73 首，BGM 从同源静态端点读取 | 通过 |
| 底部悬浮入口、手动启动 | 左下悬浮条；`<audio>` 初始无 `src`、`preload="none"`；首次点击才拉运行时（26KB gzip）与歌单 JSON | 通过：点击前第三方请求 0 条 |
| ClientRouter 导航不中断 | 根节点 `data-astro-transition-persist="bgm"`，Astro 用 `moveBefore` 搬运同一棵子树 | 通过：临时冒烟页 → 首页 → 后退 → 前进，四步中 `<audio>` 是同一个对象，`currentTime` 连续（0.98 → 2.49 → 7.11 → 8.33 → 9.54s） |
| 文章内单曲组件 | `ArticleMusicPlayer track="548650102"`（MDX 内导入） | 通过：`loadedmetadata` 390.19s，点击后播放，`aria-label` 播放/暂停切换 |
| 文章内歌单组件 | 省略 `track`，渲染 73 行曲目列表（`<details>` 折叠） | 通过：列表行可直接播放，当前行 `data-current` 高亮 |
| 原平台链接 | 单曲 → `music.163.com/song?id=…`；歌单 → `playlist?id=8562312822` | 通过 |
| 可访问控件 | 原生 `<button>` + Video.js 时间轴/静音；`role="status"` 播报 | 通过（无障碍树）：`button "暂停"`、`slider "定位"`、`time 0:01`、`button "静音"`、`status "正在播放 …"` |
| 键盘 | Tab 顺序进入折叠面板控件；Enter 播放；方向键在时间轴上 +1s | 通过：`aria-valuetext` 为「4秒钟，总时长 6分钟30秒钟」 |
| 焦点 | `:focus-visible` 描边在按钮、summary、滑块上都可见 | 通过（2px `--brand-strong`） |
| 失败状态 | 播放第 2 首（该曲 302 到 `music.163.com/404`） | 通过：`MediaError 4`、`state=error`、面板自动展开、文案「这首暂时不可播放。版权、地区或会员限制…」+ 网易云链接 |
| 失败不打断阅读 | 提示在卡片/面板内，不弹窗、不滚动 | 通过 |
| 不循环重试 | 失败后静置 5s，复核网络请求 | 通过：0 次重试请求；再次点击才发 1 次新请求（仍失败则再次报错） |
| 自动推进边界 | 播放自然结束才进下一首；单曲不循环 | 通过：拖动到结尾后自动进入下一首；单曲结束停在 `paused` |
| 播放互斥 | 先播文章播放器，再点 BGM | 通过：文章播放器自动暂停，BGM 继续；反向亦然 |
| 外部媒体协调（B 站） | 任意元素 `document.dispatchEvent(new CustomEvent('music:interrupt', { detail: { source } }))` | 通过：BGM 立即暂停，随后 1.5s 内不自动恢复。B 站文章组件尚未实现（独立票据），它只需按此契约派发事件 |
| 窄屏 | 390×844 文章页 | 通过：BGM 条在目录胶囊上方且不重叠、不越界、无横向滚动；控制条容器查询换行，时间数字让位 |
| 减少动态效果 | `prefers-reduced-motion: reduce` | 通过：chevron/按钮过渡时长降为 0 |
| 暗色 | `html.dark` | 通过：卡片、悬浮条、进度条均用主题 token，对比度审计含音乐配对 |

## 仍然只有推断或未验证

- 只测了桌面 Chromium；Firefox / Safari / 真机未跑（共享同一套标准控件，但没有实测记录）。
- 屏幕阅读器只做了无障碍树与 `role="status"` 检查，未用 NVDA/VoiceOver 实听。
- 系统媒体键、锁屏控制未验证。
- B 站视频的「用户手势 facade」属于 B 站组件设计范围；本票只保证 `music:interrupt` 契约可用。
