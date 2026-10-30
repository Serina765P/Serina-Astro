# CONTEXT

Serina-Astro 的领域词汇表。术语在这里只有一个含义；新增或改写术语走
`/domain-modeling`。实现细节以源码为准，这里只记「叫什么、指什么、别叫成什么」。

站点：`https://blog.serinap.top`（Astro 7 + Tailwind v4 + Pagefind + Vue 小部件）。
仓库里有两个独立 Node 项目：根站点与 `worker/`（Cloudflare Email Worker）。

## 站点与内容

| 术语 | 位置 | 含义 |
| --- | --- | --- |
| 文章 / post | `src/content/posts/**/*.{md,mdx}` | 带 frontmatter 的长文；`id` 由文件路径决定，路由在 `/posts/<id>/`。封面走 `getPostCover()` 的构建期资产映射。 |
| 独立页面 / page | `src/content/pages/*.md` | 关于页这类单页；`id` 是文件名（`about.md` → `about`），用 `getEntry('pages', id)` 读取。 |
| 分类 / category | frontmatter `categories` | 中文名经 `src/data/taxonomy.json` 映射为 URL slug，并映射到莫兰迪 wash 色与胶囊填充类。 |
| 标签 / tag | frontmatter `tags` | 与分类共用同一份 taxonomy JSON，不在组件里维护第二份清单。 |
| 文章皮肤 / skin | frontmatter `skin` | 按文章挂载的版式组件，目前只有 `imas-album`。与亮/暗主题（theme）是两件事。 |
| 原创文章 / original post | frontmatter `license: original` | 由作者显式标记、按 CC BY-NC-SA 4.0 授权的文章；未标记不等于放弃版权，第三方素材不因文章标记而改变权利归属。 |
| 全站 BGM / global BGM | 固定网易云歌单 `8562312822` | 手动启动的跨页背景音乐；与文章内音乐、视频是不同播放源。文章媒体开始时暂停，结束后不自动恢复。 |
| 歌单快照 / playlist snapshot | `src/data/music/netease-playlist.json` + `scripts/fetch-netease-playlist.mjs` | 构建期冻结的网易云歌单元数据（id / 标题 / 歌手 / 第一方封面），`npm run music:snapshot` 刷新。音频地址不入库：直链带短时效签名，播放时才拼成第一方跳转 URL `song/media/outer/url?id=<id>.mp3`。可播性随版权/地区/账号变化，快照不据此增删条目。 |
| 音乐播放器 / music player | `src/components/music/*`、`src/scripts/music*.ts`、`src/lib/music.ts`、静态端点 `/music/netease-playlist.json` | BGM 悬浮条与文章卡片共用一套标记、一套运行时：手动启动、播放互斥（`music:interrupt`）、失败只报一次且不自动重试、单曲不循环。Video.js 10 运行时按需加载，首屏不加载；文章组件 `<ArticleMusicPlayer track="<id>" />` 或省略 `track` 渲染整张歌单。任何其它媒体（如 B 站视频）要停 BGM 时派发 `document.dispatchEvent(new CustomEvent('music:interrupt', { detail: { source } }))`，暂停后不会自动恢复。 |
| 说说 / shuoshuo | `src/data/shuoshuo/` + `src/lib/shuoshuo.ts` | 短条目流。页面 `/shuoshuo/`，搜索/筛选接口 `index.json.ts`。 |
| 年度分片 / shard | `src/data/shuoshuo/<沪年>.json` | 信封 `{ source, fetched_at, count, items }`。年份按 `Asia/Shanghai` 取；分片路径契约与 `worker/src/lib.js` 的 `shardPath()` 共享，站点 loader 与 Worker 都按「按 ID 去重、新条目在前」处理。 |
| 条目 / item | shard 的 `items[]` | `type` 为 `MAIL`（邮件发布，可无标题/无外链/无点赞）或 `OPUS`（历史 B 站动态）。时间来自邮件 `Date` 头，展示时统一换算东八区。 |
| 邮件发布管道 | `worker/` | 私密收件地址 → Cloudflare Email Routing → Worker 校验 SMTP envelope 收件人与发件人白名单 → 解析正文 → GitHub Contents API 写分片 → Deploy workflow 构建并上传 Pages。拒绝路径不得访问 GitHub；GitHub 5xx 不自动重试。 |
| 短代码 / shortcode | `:code:` | 表情与贴纸共用的行内语法。代码块、行内代码、链接地址、HTML 属性里不展开；未知短代码保持字面量。 |
| 表情 / emoji | `src/data/emoji.json`, `public/emoji/` | 按套装分组的 WebP 小图；短代码为 `<套装>_<名称>`。 |
| 贴纸 / sticker | `src/data/stickers.json`, `public/sticker/` | 300px 级动画 WebP。`src` 是动图，`poster` 是自动生成的尾帧静图；当前唯一套装是 `ml`。 |
| 套装 / set | 注册表字段 | `set` 是短代码前缀（机器键），`setLabel` 是图鉴显示名。两套素材（表情 ↔ 贴纸）的短代码不得冲突。 |
| 管理后台 / admin console | `admin/`, `scripts/admin/` | `npm run admin`，本机 `127.0.0.1:4320`。界面层为 Nuxt UI v4 仪表盘（Vite + Vue 3、Vue Router、品牌蓝、明暗跟随系统）；已接入站点与友链、说说、分类/标签 URI 对照、文章列表与写作台（Frontmatter 表单 + `md-editor-v3` 正文、随文图片直传、短代码选择器、词条内联登记）、素材管理（表情/贴纸图鉴、两阶段重命名、前缀维护与全站引用扫描）。原独立「素材控制台」（`scripts/asset-editor.mjs`）已正式退役收敛入后台。 |
| 目录树 / TOC | `src/lib/toc.ts` | 扁平 headings 经栈式归并折成嵌套树。参与深度 2–5；跳级标题挂到最近更浅节点，不造中间层。折叠条件：一级节多于 3 个且节点总数达到 28。桌面侧栏、移动端目录、客户端脚本共用同一棵树。 |
| hero 字体子集 | `scripts/build-hero-font.mjs` | 从 `src/data/site-info.json` 的 `heroTitle` / `heroMark` 算码点，把 ZeoSeven 分片 CSS 再子集化成只含这几个字的 woff2。产物不入库；生成失败时回退 CDN 完整 CSS，不中断构建。 |
| 构建护栏 | `scripts/check-build.mjs`, `contrast-audit.mjs`, `shots.mjs` | 构建后硬断言 CSS 产物存在；对比度审计按字节比对；视觉回归只对「稳定子集」的截图判失败，其余仅供人工走查。 |

## 跨层约束

| 约束 | 口径 |
| --- | --- |
| 东八区 | 所有日期、年份、月份、当天分组显式按 `Asia/Shanghai` 计算（构建机是 UTC），统一走 `src/lib/utils.ts` 与 `src/lib/shuoshuo.ts` 的导出。 |
| 页面宽度 | 只通过 `Container` 组件控制；其 `max-width` 是含内边距的 border-box 宽度。 |
| 锚点偏移 | 只由 `src/styles/global.css` 的全局 `[id]` 规则提供 `scroll-margin-top`，组件不得另加偏移。 |
| ClientRouter | 导航后不保留模块作用域的 DOM 引用；当前页元素在 `astro:page-load` 重新查询，需跨导航存活的初始化守卫挂在 `document.documentElement` 上。 |
| 样式层 | Tailwind v4 自定义 utility 用 `@apply` 写；prose 正文字色由 utilities 层的变量控制，components 层覆盖可能无效；`docs/` 保持在 Tailwind 扫描范围之外。 |
| URL | 站内页面一律尾斜杠；canonical、sitemap、RSS 与 `astro.config.mjs` 保持一致。 |
| 视觉验证 | 构建通过不等于视觉没变；相关改动要跑 `npm run check`，涉及样式/布局时按 `scripts/shots.mjs` 的既有流程比对。 |
| 部署触发 | 普通 push 只跑 CI；只有 main 头部的 `deploy-*` 标签、main 头部的手动 `workflow_dispatch`、或 main 上 `src/data/shuoshuo/**` 的推送会由 Deploy workflow 构建并上传 Cloudflare Pages。标签与手动运行都会校验 main 头部。CF 自动部署保持关闭。 |

## 词汇禁区

- **说说** 不叫「动态」「微博」「moment」，也不等于文章（post）。`OPUS` 只是历史来源类型。
- **贴纸** 与 **表情** 是两套独立注册表和资源目录，不能互相代称，也不要合并描述。
- **分片** 是有跨仓库契约的存储单元，不是普通「文件」或「缓存」。
- **文章皮肤** 不是**主题**；主题指亮/暗配色。
- **管理后台**（admin console）是覆盖文章、说说、分类映射与素材管理的本地统一工作台；各面板均已落地，原「素材控制台」（`scripts/asset-editor.mjs`）已正式退役收敛，旧名「命名控制台」已彻底废弃。
- **TOC 数据**（`src/lib/toc.ts` 产出的树）与 **TOC 运行时**（`src/scripts/toc.ts` 的交互）分开说，避免「目录」一词同时指两者。
