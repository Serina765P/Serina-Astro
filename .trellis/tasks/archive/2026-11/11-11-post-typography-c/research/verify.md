# 验证记录：文章正文排版精修（C 方向）

日期：2026-11-11。构建：`npm run build`（Astro 7.4.1 + Tailwind 4 + typography 0.5.20）。
preview：`127.0.0.1:4399`，Chromium 1248（playwright-core 1.63）。

## 环境说明

- 本机为截图临时安装了 Noto Sans CJK SC / Noto Serif CJK SC；页面继续走系统字体栈，正文落到 Noto Sans CJK SC，标题落到 Noto Serif CJK SC。用户机器上会按 `--font-serif` 回退到 Songti SC / SimSun / 思源宋体，字形不同但度量规则一致。
- `.shots/baseline` 生成于 2026-11-10 17:51，早于 commit `1445031`（40em / 宽屏 / TOC 调整）且早于本机装 CJK 字体，不能作为本次的判据。改用「同一环境、改动前后各跑一轮 shots」的 A/B 对比（见下）。

## 计算样式（/posts/datastructure-02/，1440 宽，亮色）

| 元素 | 实测 |
| --- | --- |
| `.prose` | 17px / 31.45px（1.85）/ 字距 0.17px / 颜色 `--body` #3f474d |
| `.prose` 宽度 | 680px（`--measure = 40 × --prose-size`），两侧各 36px |
| `.post-title` | 36px / 50.4px / 700 / `--font-serif` |
| h2 | 26.35px / 38.2px / 700 / `--font-serif` / 上 63.24 下 23.72 |
| h3 | 20.06px / 31.09px / 600 / `--font-sans` |
| h4 | 18.02px / 27.03px / 600 / `--ink` |
| blockquote | 背景透明、左边线 2px `--wash-mist-deep`、左内边距 1.15em |
| callout | 17px、左边框 3px |
| 行内 code | 14.62px（0.86em）、无边框、5px 圆角、`--wash-clay-deep` |
| 表格 | 外框 0、`border-collapse: collapse`、字号 17px；表头上下线各 1px；单元格下边线 1px |
| 代码块 | 13.94px（0.82em）/ 24.4px；顶部内边距 38.4px |
| 语言标签 | 10.88px（0.68rem），与首行代码 bounding box 不相交（`langLineOverlap=false`） |
| 图片（pcshurufa） | 514px 宽，左右各 83px 对称（居中） |

## 宽度与溢出

| 视口 | `.prose` 宽 | 页面横向溢出 |
| --- | --- | --- |
| 390 | 318 | 0 |
| 1024 | 625 | 0（scrollWidth-clientWidth = -15，gutter 预留） |
| 1440 | 680 | 同上 |
| 1920 | 680 | 同上 |

## 视觉回归 A/B（before / after 同环境）

用 `git stash` 暂存 3 个源文件 → `npm run build` → `node scripts/shots.mjs before-typography`；
恢复 → 重新构建 → `node scripts/shots.mjs after-typography`；逐图比较像素。

- 变化：`about.*`（高度 1961→2119）、`links.*`（1112→1192）、`post-pcshurufa.*`（10259→10902）、`post-imas-hires.*`（5276→5649）—— 全部是使用 `.prose` 的页面，符合预期。
- 逐像素一致：archives、categories、category-tech、tags、tag-idolmaster、shuoshuo、search、not-found（亮暗各一对）。
- `home.*`：0.75% 像素差，定位在首页文章卡片的摘要行（含日文假名的那一行折行位置不同）；同一构建连续两次截图完全一致，差异来自不同构建进程的 CJK 假名回退字体选择，与 `.prose` 规则无关（首页没有 `.prose` 元素，卡片 p 的 computed font/size/width 未变）。

## 闸门

- `npm run lint`：通过。
- `npm test`：226 passed。
- `npm run check`：astro check 通过；`contrast-audit` 全部通过（正文 4.5 / 大字 3.0）。
- `npm run build`：通过，`check-build` 5 个 CSS 产物 / 64 处引用全部存在。
- `npm run contrast`：全部通过。

## 已知限制

- 标题衬线依赖系统字体：Windows 无思源宋体时落 SimSun，观感与截图（Noto Serif CJK SC）不同；这是「不引 webfont」的代价。
- 若后续要统一标题观感，可扩展现有 `scripts/build-hero-font.mjs` 的 ZeoSeven 子集给 h1/h2（另开任务）。
- 管理后台 `md-editor-v3` 预览未同步（只共享了 callout 字号），另开任务。
