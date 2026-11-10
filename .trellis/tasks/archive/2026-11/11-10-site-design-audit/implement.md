# 执行计划：全站审查与视觉精修

## 0. 准备（一次性）

```bash
cd /root/astro-blog
export CHROME_PATH=$HOME/.local/bin/chrome-nosandbox   # 已存在；包装 --no-sandbox --disable-dev-shm-usage
node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4398 &
```

- 路由清单复用 `scripts/shots.mjs:58-73` 的 12 条，补 `/emoji/`、`/archives/`、`/shuoshuo/` 的分页形态（`/shuoshuo/2/` 若存在）。
- `.taste-skill/` 与 `.shots/` 是本地数据，不提交。

## 1. 闸门 A：正确性基线

- [ ] `npm run lint` → exit 0
- [ ] `npm test` → 226 用例通过
- [ ] `npm run check` → astro check + 对比度审计通过
- [ ] `npm run build` → 含 `check-build.mjs` 与 Pagefind
- [ ] 站内链接与尾斜杠：抓 `dist/` 内所有 `href`，确认无 404、无缺尾斜杠
- [ ] 排查探针的 `font-fallback`：确认 `IBM Plex Sans SC` 在产物里是否真的加载（查 `BaseHead.astro` 的字体引入与产物 HTML 的 `@font-face`）；属实则修

验证：四条命令按 CI 顺序重跑一次。

## 2. 闸门 B：变更前基线

- [ ] `npm run shots baseline`（1440 × 亮暗 12 路由），作为视觉回归基线
- [ ] 12 条模板路由 × 3 宽度跑 `inspect.mjs`，输出到 `.taste-skill/before/<route>/`
- [ ] 暗色态单独一轮：预置 `localStorage` 主题键后跑首页与一篇文章
- [ ] 汇总 triage 表：每条 FAIL/WARN 给 fix / allow / false-positive + 理由

验证：`/` 的结果应与 `research/inspect-probe-home.md` 一致（11 FAIL / 10 WARN）。

## 3. Token 与尺度层（`global.css`）

- [ ] 五档字号进 `@theme`（design.md D2），逐处替换消费点
- [ ] `--space-section: clamp(4.5rem, 10vw, 9rem)`，分区间距统一走它
- [ ] `--measure: 36em` 应用到 `.prose` 与首页导语
- [ ] 圆角：`--radius-card` / `--radius-media` → 0；chip 保持全圆
- [ ] 删除 `--shadow-*` 的消费点，无消费点后删 token
- [ ] 正文改用全墨色（`--ink`），`--body` 只留次要说明

验证：`npm run contrast` + `npm run build`（`check-build.mjs` 会拦 CSS 产物异常）。

## 4. 基元与组件

- [ ] `primitives/Card.astro`：去描边、去阴影、去圆角，改色阶区分
- [ ] `primitives/PageHeader.astro`：去掉 eyebrow 用法
- [ ] `Header.astro`：去 1px 下边框，改色阶或留白
- [ ] `PostCard.astro`：标题并入 lead 档，元信息并入 small 档，去 `mt-*` 的散点间距

验证：`npm run check` + 首页 `inspect.mjs`。

## 5. 首页构图（`index.astro`）

- [ ] hero 去 `linear-gradient`，改平色或色阶
- [ ] `hero-avatar` 的 `box-shadow` 描边改 `--line`
- [ ] `site-index` 的 6 张同构图标卡改为一处构图：统计与入口分区呈现，不再等宽卡片行
- [ ] 删除 4 处 eyebrow（文章 / 说说 / 持续更新 / 标签）
- [ ] `♪` 换图标库已有图标（`material-symbols` 已在 `astro.config.mjs` 白名单）
- [ ] 首屏副标题 ≥ 18px 并写清站点用途（对应 `name-only-title`）

验证：1440 / 768 / 390 三宽度 `inspect.mjs`，`eyebrow`、`gradient`、`shadow`、`hairline`、`icon-cards`、`focal-point` 应消失。

## 6. 动效层（`src/scripts/motion.ts`）

- [ ] 入场：heading → 文本 → 媒体，70ms 错位，`translateY(18px)` + opacity
- [ ] `IntersectionObserver` 只触发一次；CSS 默认可见，脚本加 `data-motion="on"`
- [ ] `astro:page-load` 重建；幂等标记 `document.documentElement.dataset.motionBound`
- [ ] `hero-parallax`：±24px，rAF 节流，`max-width: 55rem` 关闭
- [ ] `3d-card`：≤6°，`(hover: none)` 关闭
- [ ] `prefers-reduced-motion: reduce` 全关，内容保持可见

验证：`inspect.mjs` 的 `still-page` 不再 FAIL；手动在 ClientRouter 换页后确认监听器只绑一次、无重播卡顿。

## 7. 回归

- [ ] 四条闸门命令重跑
- [ ] `npm run shots`（非 baseline），稳定子集不得退化；差异项逐张目视
- [ ] 12 条路由 × 3 宽度重跑 `inspect.mjs` 到 `.taste-skill/after/`
- [ ] 暗色态重测
- [ ] 键盘走查：Tab 顺序、可见焦点、跳过导航链接
- [ ] `prefers-reduced-motion` 走查

验证：AC1–AC8 逐条打勾。

## 8. 报告

- [ ] `research/before-after.md`：关键指标数值对照（字号档数、正文尺寸、行宽、外边距、分区留白、FAIL/WARN 数）
- [ ] `allow` 规则清单与理由
- [ ] 未覆盖项（暗色、视频、首屏 CTA）写明原因

## 风险与回滚点

- **回滚点 1**：第 3 步完成后提交一次（纯 token/尺度）。若视觉不可接受，单独 revert。
- **回滚点 2**：第 5 步完成后提交一次（构图）。动效层可独立回滚。
- 第 3 步可能连带影响所有页面：完成即跑 `npm run shots`，不要等全部做完。
