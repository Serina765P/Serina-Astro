# 执行计划

## 1. 扩展 hero 子集

- [ ] `scripts/build-hero-font.mjs` 增加 `collectPageTitleTexts()`：taxonomy 键、content pages frontmatter title、`src/pages/**/*.astro` 的 PageHeader/PageLayout 字面 title、404 h1、`#`
- [ ] 合并到 `texts`，日志分别打印 hero 字符数与页面标题字符数
- [ ] 运行 `npm run hero:font`，检查字符数 / 分片数 / 总大小
- [ ] 用字体 cmap 核对所有页面标题字符覆盖（缺失的应只有字体本身没有的符号）

## 2. 加载与样式

- [ ] `BaseLayout.astro`：`heroFontBuilt` 时所有页面 link `hero-mincho.css`；否则仅 `heroFont`（首页）回退 CDN
- [ ] `PageHeader.astro` 的 h1 加 `font-hero`
- [ ] `404.astro` 的 h1 加 `font-hero`
- [ ] 确认 `PostLayout` 的 `.post-title` 未变（仍是 `var(--font-serif)`）

## 3. 文档

- [ ] `visual-system.md`：页面标题与 hero 共用 `--font-hero`；hero 子集覆盖页面标题字符
- [ ] `README.md` / `AGENTS.md` / `CONTEXT.md` 的 hero 字体描述同步
- [ ] 任务 `research/verify.md` 记录字符数、产物大小、路由实测

## 4. 验证

- [ ] `npm run hero:font` + `npm run build`
- [ ] Playwright：`/archives/`、`/categories/`、`/about/`、`/tags/`、`/tags/[某个标签]/`、`/404.html` 的 h1 font-family 以 `ZhaohuaMinA Bold` 开头
- [ ] 首页 hero、文章 `.post-title` 字体不受影响
- [ ] 390 / 1024 / 1440 亮暗截图；检查长标题折行
- [ ] 回退演练：无 `hero-mincho.css` 时构建成功，首页 CDN、其它页系统衬线
- [ ] `npm run lint` / `npm test` / `npm run check` / `npm run build` 全绿

## 5. 提交

- [ ] `git diff --stat` 只含 hero 脚本、BaseLayout、PageHeader、404、spec/文档与任务文档
- [ ] 提交信息：`feat(reading): 页面标题统一朝华明朝体`
- [ ] 不 push、不部署

## 回滚

- 两处 `font-hero` class；BaseLayout link 逻辑；脚本的额外字符收集。产物重新生成即可。
