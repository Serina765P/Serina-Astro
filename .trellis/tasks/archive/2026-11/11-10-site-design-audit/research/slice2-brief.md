# Slice 2 简报：首页构图 + 动效层

前置：Slice 1 已建立 `text-display / text-heading / text-lead / text-base / text-note` 五档、`--space-section`、`--measure`、圆角 0、无 `--shadow-card*`、`.prose` 全墨、header 不透明。

基线截图见 `.taste-skill/before/home/`。以下是逐块改法。

## 1. hero（`index.astro` 的 `.home-hero`）

现状：`linear-gradient(112deg, var(--brand-wash), var(--surface))`；h1 `clamp(2.2rem,6vw,4rem)` + `letter-spacing:0.08em`；副标题 15.2px `--sub`；头像 `box-shadow: 0 0 0 1px`；`芹菜P / SERINA` 12px + `0.14em`。

改为：

- 背景改平色 `var(--brand-wash)`（渐变在屋规里禁用，探针 `gradient` 规则直接 FAIL）。
- h1 用 `text-display`，字距收到 `0.04em`（显示级衬线需要一点字距，但 0.08em 在 60px 上过散）。
- 副标题 `text-lead`（20px），颜色 `--ink`。这一条同时解决 `name-only-title`（首屏只有名字，说明句太小）。
- 头像：删 `box-shadow`，改 `outline: 1px solid var(--line); outline-offset: 2px`，保留内侧 `0.35rem solid var(--surface)` 的留白环。
- `hero-caption` 改 `text-note` + `letter-spacing: normal`（`micro-label` 规则命中）。
- 首屏与下一节的间距走 `--space-section`。

## 2. 最近文章列表（`.post-list`）

现状：每行底部 1px 分隔线；标题 18/20px；描述 14px；元信息 12px；左侧彩色 spine 保留。

改为：

- 删行间 1px 线，改用行内上下 `1.75rem` 留白 + hover 时整行 `--brand-wash` 底色（已存在）。
- 标题 `text-lead`（20px），描述 `text-base`，元信息与 chip `text-note`。
- 保留 spine（`categoryColor` 的竖条）—— 这是本页唯一的识别性装饰，不要连同描边一起删掉。
- 目录型行（`variant="directory"`）仍不带卡片外观。

## 3. 小站索引（`.stats-row` / `.index-grid` / `.tag-index`）

现状：`stats-row` 有 `border-block` + 每格 `border-right`（1px 网格），`site-index` 与 `tag-index` 各有上边框。

改为：

- `stats-row` 全去边框：四项横向排开，`gap: 2rem`，数字 `text-heading`（30px）`tabular-nums`，标签 `text-note` 且**去掉字距**（`letter-spacing: 0.12em` 是探针的 `eyebrow`/`micro-label` 来源）。
- `.index-label` 从 `0.72rem`（11.5px）提到 `text-note`（13px），去字距。
- `site-index`、`tag-index` 去 `border-top`，靠 `--space-section` 分区。
- `.index-grid` 去掉外层 1px 边框盒，左右两栏用色阶或留白分开。

## 4. 动效层（新增 `src/scripts/motion.ts`）

- 由 `BaseLayout.astro` 以 `<script>import '../scripts/motion';</script>` 引入（同 `music-loader`）。
- 只监听 `astro:page-load`；每次先 teardown 再重建（**不要**把幂等标记挂 `documentElement`，换页会清空其属性）。
- 入场：`[data-motion]` 容器内按 heading → 文本 → 媒体的顺序，`IntersectionObserver` 触发一次，70ms 错位，`translateY(18px)` + opacity。
- 渐进增强：CSS 默认可见；脚本给 `<html>` 加 `data-motion="on"` 后才应用初始隐藏态。脚本失败时内容必须完整可见。
- `prefers-reduced-motion: reduce`：不隐藏、不位移，只保留最少的 opacity。
- 签名效果 1 —— hero 视差：`.hero-portrait` 随滚动 `translateY`，上限 ±24px，rAF 节流，`max-width: 55rem` 关闭。
- 签名效果 2 —— 列表行 tilt：`.post-list` 的可交互行在 `pointermove` 时 `rotateX/rotateY` ≤ 4°，`pointerleave` 复位，`(hover: none)` 关闭。
- 触发条件写清楚：只有 `[data-motion]` 的下级元素参与入场，避免影响 `/shuoshuo/`、搜索页等未标记页面。

## 验收

- `inspect.mjs` 首页：`gradient`、`eyebrow`、`icon-cards`、`hairline`、`shadow`、`micro-label`、`size-count`、`still-page`、`name-only-title` 应从 FAIL/WARN 列表消失或降级。
- 768 / 390 下 hero 不溢出、tilt 不触发、视差关闭。
- 换页后回首页：入场只播一次，监听器不累积（用 `getEventListeners` 不可用，改为在 `pointermove` 里计数或手动点两次验证）。
