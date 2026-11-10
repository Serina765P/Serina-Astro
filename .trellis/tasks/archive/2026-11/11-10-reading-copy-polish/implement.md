# 执行计划

## 0. 基线

- [ ] `npm run build` 后用 `node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4398` 启服务
- [ ] 记录 `/posts/mltd-appellations-statistics/` 的正文宽度、面板宽度、5.1 表列宽、表格圆角与字号
- [ ] 记录一条长标题下 `.toc-toggle` 与 `.toc-link` 的 top 差
- [ ] 记录首页网络请求里的 `fontsapi.zeoseven.com` 数量（应为 5：1 preconnect + 4 CSS）

## 1. 宽度（`global.css` + `PostLayout.astro`）

- [ ] `--measure: 36em` → `40em`，更新注释里的实测数字
- [ ] `.post-panel { max-width: 46rem }` → `52rem`，重写注释（含 1440 / 1024 两组实测）
- [ ] 面板内文本列居中：`.post-panel > header` 与 `.prose` 同宽同边
- [ ] 复测 1920 / 1440 / 1024：正文宽度、无横向溢出、标题与正文左右边对齐

## 1b. 宽屏框架（`global.css` + `PostLayout.astro`）

- [ ] `@media (min-width: 1600px)` 覆写 `--container-wide: 80rem`、`--container-standard: 72rem`
- [ ] 文章栏 `max-w-4xl` → `max-w-5xl`
- [ ] 复测 1920：容器 1280、留白 320、文章栏 ≤1024、面板 832、文本列 640
- [ ] 确认 1440 与 1024 的数字与改动前一致（media query 不命中）

## 2. TOC（`TocTree.astro`）

- [ ] `.toc-item` 改两列 grid，子列表跨列
- [ ] 复测：长标题下 `toggleTop - linkTop < 4`，1440 与 1024 都过
- [ ] 确认没有 toggle 的条目左缘与有 toggle 的一致

## 3. 表格（`global.css`）

- [ ] 圆角 0、`font-size: 1em`
- [ ] `th/td` 加 `overflow-wrap: anywhere`
- [ ] 复测 5.1 表三列宽度 ≥ 80px；390 宽横滑仍可用
- [ ] 抽查另外两张表（第 1 张与第 10 张）不退化

## 4. 字体（`BaseLayout.astro` + `global.css` + `AGENTS.md`）

- [ ] 删 preconnect 与 4 个 CDN 样式表，更新注释
- [ ] `--font-sans` 改系统栈
- [ ] 确认 300 / 500 / 600 字重在系统栈下的实际回落（浏览器实测 `getComputedStyle` 的 `fontWeight`）
- [ ] 更新 `AGENTS.md` 的字体约定
- [ ] 复测：网络面板无 zeoseven 请求；hero 字体仍加载本地子集

## 5. 文案（Humanizer，保守）

- [ ] 逐文件读 164 条串的上下文（`components` / `layouts` / `pages` / `site.config.ts`）
- [ ] 按 26 条规则标记命中项，排除清单见 `design.md`
- [ ] 修改命中的串，写 `research/copy-audit.md`（分组、判定、前后对照）
- [ ] 用 `npm run lint` 与 `npm run build` 确认没有破坏模板字符串

## 6. 回归

- [ ] 四条闸门：`lint` / `test` / `check` / `build`
- [ ] `inspect.mjs --widths 1920,1440,1024,768,390` 复测 `/`、`/posts/mltd-appellations-statistics/`、`/posts/pcshurufa/`、`/about/`、`/links/`
- [ ] 暗色 + 390 宽目视（表格、TOC、正文列）
- [ ] `npm run shots` 对比基线（`.shots/baseline/`，26 张），差异逐张确认

## 风险与回滚点

- **回滚点 1**：宽度 + TOC + 表格完成后提交一次。这三项只碰 CSS 与两个组件。
- **回滚点 2**：字体单独提交。若系统栈观感不可接受，单独 revert 不会影响排版改动。
- 文案改动单独提交，便于逐条回退。
