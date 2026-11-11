# 执行计划

## 0. 基线（改前）

- [ ] `npm run build` 后用 `node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4399` 起服务
- [ ] 记录 `/posts/pcshurufa/`、`/posts/datastructure-02/`、`/about/` 的 `.prose` 字号 / 行高、h2 / h3 / h4 字号、正文列宽
- [ ] 记录语言标签与首行代码的 bounding box（应相交）
- [ ] 记录表格 computed border / 表头背景、图片 computed margin-inline
- [ ] 截图：1440 亮 / 暗、390 宽各一张（对照用）

## 1. 字体 token 与正文档（`global.css`）

- [ ] `@theme` 增加 `--font-serif`：`'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', 'SimSun', serif`
- [ ] 更新 `--font-sans` 注释：说明正文档 / 标题的分工
- [ ] `@layer utilities` 的 `.prose.prose`：`font-size: 17px`、`line-height: 1.85`、`letter-spacing: 0.01em`、`--tw-prose-body: var(--body)`
- [ ] `.prose > p`：`margin: 1.05em 0`、`text-wrap: pretty`
- [ ] 更新 `--measure`：`calc(40 * --prose-size)` = 680px @17px；同 token 给 PostLayout 头部，保证标题列与正文列同宽
- [ ] 复测：1440 正文列 680px；1024 收窄不溢出

## 2. 标题（`global.css` + `PostLayout.astro`）

- [ ] `PostLayout.astro` 的 `.post-title`：`font-family: var(--font-serif)`、`clamp(1.75rem, 2.5vw, 2.3rem)`、`line-height: 1.4`、`letter-spacing: 0.02em`
- [ ] `@layer utilities` 增加 `.prose h2` / `h3` / `h4` 字号、行高、字重、字距、上下 margin（见 design.md 3.2）
- [ ] `.prose :is(h2, h3, h4) + * { margin-top: 0 }`
- [ ] 删除 components 层被接管的旧 h 规则残留（`letter-spacing` / `text-wrap` 若与新值冲突则合并）
- [ ] 复测 computed：h1 serif；h2 26.35px/700；h3 20.06px/600；h4 18.02px/600

## 3. 引用、callout、行内 code

- [ ] `@layer utilities` 增加 `.prose.prose blockquote`（2px 左线、1.15em 内边距、去底色 / 圆角）
- [ ] 删除 components 层旧的 `.prose blockquote` 底色 / 圆角规则
- [ ] `post-prose.css`：`.callout { font-size: 1em; border-left-width: 3px; padding: 0.8em 1.1em }`
- [ ] 行内 code：utilities 新规则替换 components 旧 chip（`font-size: .86em`、无边框、5px 圆角、surface-2 55% 底、clay-deep 字色）
- [ ] 复测：callout 17px；blockquote 背景透明；行内 code 无边框

## 4. 表格

- [ ] 重写 `.prose.prose table` / `thead th` / 单元格规则（去外框、表头上下线、行分隔线、hover）
- [ ] 保留 `overflow-wrap: anywhere`、≥48rem `min-width: 5rem`、≤40rem 横滑
- [ ] 复测：外框 0；表头上下线存在；390 宽页面横向溢出 0；5.1 表列宽不退化

## 5. 图片

- [ ] `.prose img` 增加 `display: block; margin-inline: auto; margin-block: 2em`
- [ ] 复测：514px 图片在 680px 列中左右居中；srcset / width / height 不变

## 6. 代码块

- [ ] `@layer utilities` 增加 `.prose.prose .astro-code { padding: 2.4rem 1.15rem 1.05rem; font-size: .82em; line-height: 1.75 }`
- [ ] `components` 层 `.code-language` 去底色 / 内边距 / 圆角，left 1rem、top 0.65rem
- [ ] 复测：语言标签与首行代码 bounding box 不相交；复制按钮可点；折叠逻辑不变

## 7. 清理与规范

- [ ] 搜索 `global.css` 中因新规则失效的旧 prose 规则，删除死规则（避免两套真值）
- [ ] 更新 `.trellis/spec/frontend/visual-system.md`：正文档 17px 例外、明朝体标题与回退栈、表格新样式、`--measure` @17px 口径
- [ ] 检查 `CONTEXT.md` / `AGENTS.md` 是否有与字体 / 字号冲突的表述，必要时补一句

## 8. 验证

- [ ] 计算样式断言脚本（临时放 `.shots/`，不入库）：字号 / 行高 / 字族 / 表格边框 / 图片 margin / 角标相交
- [ ] 五宽度横向溢出 0：390 / 1024 / 1440 / 1920
- [ ] 亮 / 暗目视 `/posts/pcshurufa/`、`/posts/datastructure-02/`、`/posts/imas-cd/`、`/about/`、`/links/`
- [ ] `npm run lint`、`npm test`、`npm run check`、`npm run build`、`npm run contrast` 全绿
- [ ] `npm run shots` 对比基线，逐张确认文章页差异与本任务一致，非文章页无意外变化
- [ ] 结果写入 `research/verify.md`

## 9. 提交（Phase 3.4）

- [ ] `git diff --stat` 只含：`src/styles/global.css`、`src/styles/post-prose.css`、`src/layouts/PostLayout.astro`、`src/../.trellis/spec/frontend/visual-system.md`、任务文档
- [ ] 提交信息：`feat(reading): 正文 17px 与明朝体标题，表格/图片/代码块精修`
- [ ] 不 push、不部署（等用户要求）

## 回滚点

- 回滚点 1：第 1–2 步完成后，可单独 revert 字体与标题改动，正文 17px 保留。
- 回滚点 2：第 3–6 步组件细节单独 revert，不动字体。
