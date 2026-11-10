# 技术设计：全站审查与视觉精修

## 改动边界

只动四层，按影响面从小到大：

| 层 | 文件 | 说明 |
| --- | --- | --- |
| Token / 尺度 | `src/styles/global.css` | 字号刻度、间距节奏、圆角、阴影消费点；`@theme` 与 `@theme inline` 两层结构不动 |
| 基元 | `src/components/primitives/*.astro` | `Container`、`Card`、`PageHeader`、`TagChip` |
| 首屏与列表构图 | `src/pages/index.astro`、`src/components/PostCard.astro`、`src/components/Header.astro` | 删除 eyebrow、同构图标卡、1px 分隔线；重排首屏 |
| 动效 | 新增 `src/scripts/motion.ts` | 入场分层 + 两个签名效果 |

不改：路由、URL 形态、`src/content.config.ts` 与内容 schema、`worker/`、`scripts/admin/`、字体族与字体文件、`scripts/check-build.mjs`、`scripts/shots.mjs` 的闸门逻辑。

## 决策

### D1 — 只移植 Aceternity 的 transform 类交互

Aceternity 的招牌效果里，spotlight、aurora、background beams、moving border 全部依赖 `linear-gradient` / `conic-gradient` / `radial-gradient`，与本仓库屋规（无渐变）和 `inspect.mjs` 的 `gradient` 规则直接冲突。探针已经因为一处 `linear-gradient(112deg, …)` 判 FAIL。

因此 B 部分只取**纯 transform** 的两式：

1. `hero-parallax`（对应 `components/hero-parallax`）：首屏人像随滚动 `translateY`，上限 ±24px，`requestAnimationFrame` 节流。
2. `3d-card`（对应 `components/3d-card`，其 registry 零依赖）：首页最近文章卡在 `pointermove` 时 `rotateX/rotateY`，上限 6°，`pointerleave` 复位。

两者都是 `transform` + `opacity`，可被 `prefers-reduced-motion` 整体关闭，且不产生任何渐变或阴影。

### D2 — 字号收敛到五档

现状 10 档（12,13,14,15,16,20,23,29,32,64）。目标五档，全部落在 `@theme`：

| 角色 | 值 | 用途 |
| --- | --- | --- |
| display | `clamp(2.5rem, 5.2vw, 4rem)` | 首屏 h1 / 文章页标题 |
| heading | `1.5rem` | 分区标题 h2 |
| lead | `1.125rem` | 首屏副标题、分区导语、卡片标题 |
| body | `1rem`（正文 prose `1.0625rem`） | 正文与界面文字 |
| small | `0.8125rem` | 元信息、时间、标签 |

卡片标题从 `text-lg → sm:text-xl`（18/20 两档）并入 lead 一档，元信息从 12/13 并入 small。

### D3 — 节奏与框架

- 分区间距 `--space-section: clamp(4.5rem, 10vw, 9rem)`（390 宽 72px，1440 宽 144px），替代当前按组件各写一档的做法。
- 正文量度 `--measure: 36em`（中文口径约 36 字/行），探针当前 133 字符/行。
- 圆角：媒体与卡片 0（当前 `--radius-card: 1rem`、`--radius-media: 0.75rem`），chip 保持全圆。二选一，不留在中间档。
- 删除 `--shadow-card`、`--shadow-card-hover`、`--shadow-media`、`--shadow-media-hover` 的消费点；token 无消费点后一并删除（AGENTS.md：不留死代码）。
- 分隔：`header` 与 hero 的 `border-b`、卡片描边改为留白或 `--bg` 与 `--surface` 的色阶差。

### D4 — 动效层

`src/scripts/motion.ts`，模块脚本，由 `BaseLayout.astro` 以 `<script>` 引入（与 `music-loader` 同法）：

- ClientRouter 换页会**清空 `documentElement` 的属性**（`src/scripts/bilibili.ts` 的注释已记录该行为），所以幂等标记不能挂 `<html>`。改用模块级状态 + 显式 teardown：每次 `astro:page-load` 先断开上一轮的 `IntersectionObserver` / 移除 `pointermove` 监听，再按当前 DOM 重建。
- 只监听 `astro:page-load`（ClientRouter 在首次加载与每次换页后都会派发），不在模块顶层直接初始化。
- 入场：分区内 heading → 文本 → 媒体，70ms 错位，`translateY(18px)` + opacity，`IntersectionObserver` 触发一次。
- **渐进增强**：CSS 默认可见，脚本加 `data-motion="on"` 后才进入初始隐藏态；脚本失败或未执行时内容完整可读。
- `prefers-reduced-motion: reduce` 时只保留 opacity 或不加动效，且不注册指针视差。
- 断点：视差在 `max-width: 55rem` 关闭（与现有容器断点一致），tilt 在 `(hover: none)` 关闭。

### D5 — ClientRouter 兼容

`BaseLayout.astro:103` 挂了 `ClientRouter`。换页后：入场动画会重播（接受，这是页面切换的自然行为），但 scroll 监听必须重新绑定到新的 `window` 状态，`IntersectionObserver` 必须重新 observe 新节点。实现上用 `astro:page-load` 全量重建，不做跨页持久化。

## 兼容与风险

| 风险 | 处理 |
| --- | --- |
| 对比度审计读 token，改色可能跌破阈值 | 每次改 `--ink/--body/--sub` 后跑 `npm run contrast`；正文改全墨色只会升高 |
| `.astro` 不受 Biome 覆盖，格式需手工保持一致 | 跟随现有文件风格；`npm run lint` 仍会覆盖 `.ts` |
| 卡片去圆角/去阴影是明显视觉变化 | 先改一个模板（首页），跑 `npm run shots` + 目视确认，再铺开 |
| 探针的三条全局误报（`mono`、`off-centre`、`few-pictures`）会在 12 条路由重复出现 | 判定一次，报告里统一 `allow` 并写理由；不逐页 triage |
| 暗色态未被 `inspect.mjs` 覆盖 | 用 `ThemeToggle` 的 localStorage 键预置暗色后单独跑一轮首页与文章页 |

## 回滚

改动集中在 6 个文件（`global.css`、4 个 primitives/组件、`index.astro`）+ 1 个新脚本。回滚按 git 提交粒度整段 revert；`global.css` 的 token 删除集中在一次提交内，避免部分回滚留下悬空引用。
