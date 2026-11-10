# 全站审查与视觉精修

## Goal

对 12 条模板路由建立可复现的**正确性**与**视觉**两道闸门：先让正确性全绿，再在不动信息架构的前提下，按已选定的设计方向做排版、色彩、框架与状态层的精修，最终给出每个模板在 1440 / 768 / 390 三个宽度下的测量前后对照。

用户价值：把「感觉不精致」变成可度量、可回归的清单，并且下一次改动不会悄悄退化。

## Background

现有验证只覆盖"能构建"：`npm run shots`（`scripts/shots.mjs:58-73`）拍 12 条路由 × 亮暗两态，但**只有 1440 一个宽度**，且不比对外边距、字号、分区留白这类结构性指标。设计质量目前没有任何自动测量。

## Confirmed Facts

- 路由：`src/pages/` 下 12 个模板路由（`index`、`404`、`archives`、`emoji`、`about`、`shuoshuo/[...page]`、`search`、`categories/index`、`categories/[slug]`、`links`、`tags/index`、`tags/[slug]`、`posts/[id]`）。
- 基线闸门当前**全绿**（本次实测）：`npm run lint` exit 0；`npm test` 14 文件 226 用例通过；`npm run check`（astro check + 对比度审计）全部通过；`npm run build` 通过，Pagefind 索引 49 页。
- 视觉测量工具可用：`inspect.mjs`（design-taste-frontend）在本机需要 `CHROME_PATH` 指向带 `--no-sandbox` 的 Chromium 包装脚本（root 环境），已验证可跑，单页 17s。
- 首页探针（1440/768/390）结果：**11 FAIL / 10 WARN**；逐条测量与判定见 `research/inspect-probe-home.md`。
- 站点为纯 Astro 静态站，页面无 React/Vue 岛（`.trellis/spec/frontend/index.md`）；交互在 `src/scripts/`，幂等标记挂 `document.documentElement`。
- `global.css` 已有 `@theme`（:188）与 `@theme inline`（:249）两层，语义色走 `--ink / --body / --sub / --line / --surface(-2)`，组件层不得另造颜色。
- `BaseLayout.astro:103` 挂 `ClientRouter`，任何新动效必须处理换页重挂载。
- 对比度审计直接读 `global.css` 的 token，正文阈值 4.5、大字 3.0；token 改动必须跑 `npm run contrast`。

## Requirements

### R1 — 闸门 A：正确性

对全站运行并保持全绿：`npm run lint`、`npm test`、`npm run check`、`npm run build`；额外覆盖站内链接与尾斜杠一致性、canonical / sitemap / RSS 未被破坏。

### R2 — 闸门 B：视觉测量

12 条模板路由各一条代表 URL，在 1440 / 768 / 390 三宽度用真实 Chromium 测量并截图，产出一份 findings 清单：每条含规则名、宽度、测量值、判定（fix / allow / false-positive + 理由）。

### R3 — P0 修复边界

闸门 A 的问题必须修复；闸门 B 的问题**只记录不改**，除非它同时是 A 级正确性问题（例如字体未加载属于 A 级）。

### R4 — 视觉精修

在不动路由、信息架构、内容 schema 的前提下，按用户选定的方向 **C（屋规打底 + transform 类签名效果点睛）**：改 `global.css` 的 token 与尺度、`src/components/primitives/`、首屏与列表构图，并新增 `src/scripts/motion.ts` 动效层。技术决策见 `design.md` D1–D5。改完重跑闸门 B，产出前后对照。

### R5 — 回归

精修后保持 `npm run shots` 的稳定子集不退化（或明确记录并说明原因），并补一次亮/暗两态目视走查。

## Acceptance Criteria

- [x] AC1 四条命令依次 exit 0，输出留档（`research/gate-a.md`）。
- [x] AC2 14 条模板路由 × 3 宽度全部跑过 `inspect.mjs`（含补充的 `/emoji/`），报告与截图在 `.taste-skill/after/`。
- [x] AC3 逐条判定见 `research/triage-before.md` 与 `research/triage-after.md`。
- [x] AC4 首页 5 档（13/16/20/30/60），正文 16px，行宽 36em。
- [x] AC5 左右差 7.5px 全部来自 `scrollbar-gutter: stable` 预留的 15px；分区分隔改用色阶带与留白。
- [x] AC6 对比度审计全部通过；正文改用 `--ink`，对比度上升。
- [x] AC7 只写 transform/opacity；reduced-motion 下 22 个条目 0 隐藏 0 位移；`astro:page-load` + teardown 重建。
- [x] AC8 见 `research/before-after.md`。

## Out of Scope

- 引入 React / Vue 岛或任何 UI 组件库（含 Aceternity、Nuxt UI）。
- 路由、URL 形态、内容 schema、`worker/`、`scripts/admin/` 的改动。
- 更换字体或提交字体二进制；内容文案改写。
- 新增依赖（除本机验证用的 Chromium 包装脚本，仓库内不提交）。

## Technical Notes

- 视觉测量工具：`/root/.agents/skills/design-taste-frontend/scripts/inspect.mjs`，需 `CHROME_PATH` 指向 `~/.local/bin/chrome-nosandbox`。
- 规划期证据与 triage：`research/inspect-probe-home.md`。
- 阻塞性开放问题：**无**。
