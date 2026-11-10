# 精修前后对照

测量方式：`inspect.mjs`（design-taste-frontend），真实 Chromium 153，三宽度 1440 / 768 / 390；变更前后各跑一次，原始报告在 `.taste-skill/before/` 与 `.taste-skill/after/`（本地数据，不提交）。

14 条路由合计：**FAIL 107 → 74，WARN 106 → 65**。剩余 FAIL 里 41 条是同三类误报/不适用规则在每条路由上的重复计数（`mono` 14、`focal-point` 14、`few-pictures` 13），逐条判定见 `triage-after.md`。

## 关键指标

| 指标 | 之前 | 之后 |
| --- | --- | --- |
| 首页可见字号档数 | 10（12/13/14/15/16/20/23/29/32/64） | 5（13/16/20/30/60） |
| 正文字号 | 14px | 16px |
| 正文行宽 | 133 字符/行 | ≤36 汉字（`--measure: 36em`） |
| 首页高度（1440） | 2487px（2.8 屏） | 2273px（2.5 屏） |
| 首页逐屏填充率 | 0.49 / 0.23 / 0.13 | 0.41 / 0.31 / 0.59 |
| 首页 FAIL / WARN | 11 / 10 | 3 / 4 |
| 动效元素（1440/768/390） | 1 | 20 / 18 / 20 |
| 分隔线 | 11 条 1px | 0 |
| 渐变 | 1 处（hero） | 0 |
| 静止阴影 | 1 处（头像环） | 0 |

## 逐路由 FAIL / WARN

| 路由 | FAIL 前 → 后 | WARN 前 → 后 |
| --- | --- | --- |
| home | 11 → **3** | 10 → **4** |
| archives | 6 → 5 | 8 → 4 |
| categories | 7 → **4** | 7 → 5 |
| category-tech | 7 → **4** | 10 → **5** |
| tags | 5 → 4 | 8 → 5 |
| tag-idolmaster | 9 → **5** | 9 → 5 |
| links | 7 → 5 | 6 → 4 |
| shuoshuo | 6 → 6 | 5 → 4 |
| search | 5 → 4 | 8 → 5 |
| about | 8 → 6 | 7 → 5 |
| emoji | 7 → 6 | 6 → 3 |
| post-pcshurufa | 9 → **5** | 8 → 5 |
| post-imas-hires | 13 → 11 | 7 → 7 |
| not-found | 7 → 6 | 7 → 4 |

剩余 FAIL 的逐条判定见 `triage-after.md`。

## 规则级变化

| 规则 | 前 | 后 |
| --- | --- | --- |
| `body-size` | 3 | 0 |
| `emoji` | 14 | 3（剩余为正文内容） |
| `eyebrow` | 3 | 0 |
| `gradient` | 1 | 0 |
| `hairline` | 8 FAIL + 6 WARN | 4（均为正文/网格内容） |
| `icon-cards` | 2 | 1（标签页带封面的文章卡） |
| `shadow` | 8 | 1（文章页素材阴影） |
| `size-count` | 1 | 0 |
| `small-text` | 13 | 1（正文表格角标） |
| `small-title` | 13 | 2 |
| `grey-body` | 3 | 0 |
| `glass` | 1 | 0 |
| `contrast` | 1 | 0 |
| `measure` | 5 | 2 |
| `name-only-title` | 13 | 12 |
| `empty-screens` | 1 | 3（短页面，见 triage） |
| `still-page` | 13 | 12（短页面首屏不播入场，见 triage） |

## 有意保留的 FAIL / WARN

| 规则 | 理由 | 证据 |
| --- | --- | --- |
| `mono` | 工具误报：CJK 全角字宽让启发式把 `IBM Plex Sans SC` 与 `ZhaohuaMinA Bold` 判成等宽 | 两族在 CDN 声明里是 sans / 明朝体，非等宽 |
| `font-fallback` | 工具误报：探针在字体就绪前取样 | `document.fonts.check('16px "IBM Plex Sans SC"')` 返回 true，`document.fonts.size = 10` |
| `off-centre` | 工具误报：`global.css:348` 的 `scrollbar-gutter: stable` 在 ≥48rem 预留 15px gutter，容器在滚动区内居中 | 实测左右 201/216，差 7.5px，消失条件与 gutter 完全一致 |
| `few-pictures` / `no-footage` | 落地页规则，文字型博客首页不适用 | 首页只有头像是位图，且这是有意的 |
| `first-action` | 博客没有主行动按钮；导航与文章本身是入口 | — |
| `focal-point` | hero 标题 60px（4.2vw），探针期望 ~8.4vw。7 个汉字的标题放大到 120px 会挤掉头像位 | 需要重构首屏为上下两段才能满足，见后续建议 |
| `headline-lines@390` | 31 字中文标题在 390 宽必然超过两行 | 标题是内容，不裁不改 |
| `covered-text` | 粘性导航滚动途中掠过标题的瞬时状态；锚点落点已核验正确 | `/about/#制作人时间线`：目标 top 87.6px > header 65px |

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/styles/global.css` | 五档字号 token、`--space-section`、`--measure`、圆角归零、删 `--shadow-card*`、`.prose` 全墨、header 不透明 |
| `src/styles/motion.css` | 新增：入场初态与 reduced-motion 降级 |
| `src/scripts/motion.ts` | 新增：`astro:page-load` 重建、teardown、入场、hero 视差、行 tilt |
| `src/components/primitives/PageHeader.astro` | h1 → `text-display`、去字距、默认下边距 2.5rem |
| `src/components/primitives/Card.astro` / `TagChip.astro` | 跟随新 recipe 与字号档 |
| `src/components/PostCard.astro` | 行内间距、2px 全圆 spine、标题 20px、描述 16px、元信息 13px |
| `src/components/Header.astro` | 去玻璃、去下边框、导航不换行 |
| `src/components/music/BgmPlayer.astro` | `♪` → `material-symbols:music-note` |
| `src/layouts/PostLayout.astro` | 标题 `clamp(1.75rem,3vw,2.5rem)`、面板去描边、46rem 面板居中、分类 chip 移到元信息行 |
| `src/layouts/BaseLayout.astro` | 引入 motion 脚本与样式 |
| `src/pages/index.astro` | 首屏平色底、列表去线、统计去网格、索引区色阶带 |
| `src/pages/categories/index.astro` | 卡片网格 → 单列索引行 |
| `src/pages/archives/index.astro` | 去年份行分隔线、字号归档 |
| `src/pages/tags/index.astro` | 计数归档（保留连续热度刻度） |
| `src/pages/emoji/index.astro`、`src/pages/shuoshuo/[...page].astro`、`Footer`、`ArticleLicense`、播放器 | 字号归档（`text-xs`→`text-note`，`text-sm`→`text-base`） |
| `src/components/Giscus.astro` | 去评论区分隔线 |
