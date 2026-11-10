# 闸门 B 基线 triage（14 条路由 × 1440/768/390）

测量时间：2026-11-10；构建：`dist` 于改动前；命令见 `inspect-probe-home.md`。
原始报告与截图：`.taste-skill/before/<route>/report.json`（本地数据，不提交）。

| 路由 | FAIL | WARN |
| --- | --- | --- |
| home | 11 | 10 |
| archives | 6 | 8 |
| categories | 7 | 7 |
| category-tech | 7 | 10 |
| tags | 5 | 8 |
| tag-idolmaster | 9 | 9 |
| links | 7 | 6 |
| shuoshuo | 6 | 5 |
| search | 5 | 8 |
| about | 8 | 7 |
| emoji | 7 | 6 |
| post-pcshurufa | 9 | 8 |
| post-imas-hires | 13 | 7 |
| not-found | 7 | 7 |

## 跨路由聚合与判定

| 规则 | 命中 | 判定 | 处理 |
| --- | --- | --- | --- |
| `mono` | 14/14 | **误报** | `allow`：中文全角字宽使启发式把 `IBM Plex Sans SC` / `ZhaohuaMinA` 判成等宽 |
| `emoji`（`♪`） | 14/14 | 真问题 | 全局：BGM 播放器的字符图标换 `material-symbols` 图标 |
| `emoji`（内容表情） | 3/14 | 内容 | `allow`：`✨ 🎧 📂 💡 🎵 😅` 是用户写的正文，不是装饰 |
| `no-footage` | 14/14 | 不适用 | `allow`：博客无视频素材 |
| `focal-point` | 14/14 | 部分成立 | 页面 h1 提到 `text-display`（36–60px）；不追 8.4vw |
| `few-pictures` | 13/14 | 不适用 | `allow`：文字型博客，落地页规则 |
| `small-text` | 13/14 | 真问题 | `0.72rem`（11.5px）等 → `text-note`（13px） |
| `small-title` | 13/14 | 真问题 | 页面 h1 20/24/30px → `text-display` |
| `name-only-title` | 13/14 | 真问题 | h1 下的说明文字提到 ≥16px 并写清用途 |
| `still-page` | 13/14 | 真问题 | 新增 `motion.ts` 动效层 |
| `off-centre` | 13 WARN + 4 FAIL | **误报** | `global.css:348` `scrollbar-gutter: stable`（≥48rem）预留 15px，容器在滚动区内居中；实测左右 201/216，差值 7.5px 全部来自该 gutter |
| `first-action` | 9/14 | 不适用 | `allow`：博客没有主行动按钮 |
| `hairline` | 8 FAIL + 6 WARN | 真问题 | 去 1px 分隔：header、hero 下边、`stats-row` 的 `border-block`/`border-right` |
| `shadow` | 8/14 | 真问题 | 删除 `--shadow-card*` 及其消费点 |
| `hero-void` | 6/14 | 真问题（分页） | search 60%、tags 53%、categories 47% 首屏空块；list 页首屏需要承载内容，不能只有标题 |
| `measure` | 5/14 | 真问题 | `--measure: 36em` |
| `covered-text` | 3/14 | **误报** | 实测 `/about/#制作人时间线`：目标 top 87.6px，header 高 65px，`scroll-margin-top: 88px` 生效，锚点落点正确。探针是滚动途中抓到标题正被 sticky header 掠过；这是粘性导航的正常行为 |
| `outlined-box` | 3 FAIL + 3 WARN | 混合 | `emoji` 130 个 1px 框是图鉴网格，`allow`；其余（tag/post 页 3–7 个）去描边 |
| `body-size` | 3/14 | 真问题 | 正文 14px → 16px |
| `grey-body` | 3/14 | 真问题 | `.prose.prose` 的 `--tw-prose-body` → `--ink` |
| `eyebrow` | 3/14 | 真问题 | 首页 4 处统计小标签 |
| `icon-cards` | 2/14 | 真问题 | 首页 6 张同构图标卡 |
| `headline-lines` | 2/14 | **内容约束** | 中文长标题在 390px 必然超两行；`allow`，不裁标题 |
| `empty-screens` | 1/14 | 真问题 | about 第 2/3 屏几乎空白 |
| `glass` | 1/14 | 真问题 | header `backdrop-blur-md` → 不透明 |
| `contrast` | 1/14 | 真问题 | archives 年份 `2026/2025` 4.3:1 → `text-ink` |
| `card-rows` | 1/14 | 不适用 | `emoji` 图鉴本就是网格 |
| `micro-label` | 1/14 | 真问题 | `芹菜P / SERINA` 12px + 0.14em 字距 |
| `gradient` | 1/14 | 真问题 | 首页 hero `linear-gradient` |
| `font-fallback` | 1/14 | **误报** | 见下方验证 |
| `size-count` | 1/14 | 真问题 | 10 档 → 5 档 |
| `all-centred` | 1/14 | 内容 | 文章页歌词/列表居中，`allow` |

## 已验证的两条误报

**`font-fallback`**：`document.fonts.check('16px "IBM Plex Sans SC"')` 返回 `true`，`document.fonts.size = 10`，CDN `fontsapi.zeoseven.com/389/main/result.css` 的 `FontFamilyName` 就是 `IBM Plex Sans SC`。字体确实加载，探针在字体就绪前取的样。

**`mono`**：判成等宽的 `IBM Plex Sans SC` 与 `ZhaohuaMinA Bold` 都是比例字体。CJK 全角字形使字符步进宽度一致，触发了启发式。

## 待复测确认

1. `covered-text`：看 `.taste-skill/before/about/desktop-page-0*.jpg` 与 `post-*/desktop-page-0*.jpg`，确认遮挡源。
2. `hero-void`：list 页首屏留白是排版意图还是缺内容，逐页判断。
3. 暗色态未测：`inspect.mjs` 只跑亮色；用 `localStorage.theme = 'dark'` 单独截图。
