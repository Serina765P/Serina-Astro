# 执行计划

## 1. 脚本

- [ ] 新增 `scripts/build-heading-font.mjs`
  - [ ] 读取 posts md/mdx 的 frontmatter title + `##` 标题、pages md 的 `##` 标题
  - [ ] 去 Markdown 修饰、去重、去空白、排序
  - [ ] 每 400 字符一块，调 Google Fonts `text=` 子集接口
  - [ ] 解析 CSS 里的 woff2 URL，下载并缓存到 `.cache/heading-serif/<sha1>.woff2`
  - [ ] 写 `public/fonts/heading-serif/<n>.woff2` + `public/fonts/heading-serif.css`（含 unicode-range）
  - [ ] 失败 warn、保留旧产物、退出码 0
- [ ] 本地跑 `node scripts/build-heading-font.mjs`，记录字符数 / 分块 / 体积

## 2. 构建接入

- [ ] `package.json` 加 `heading:font`；`predev` / `prebuild` 改为 `npm run hero:font && npm run heading:font`
- [ ] `BaseLayout.astro` 加 `headingFontBuilt` 与 `<link rel="stylesheet" href="/fonts/heading-serif.css" />`（仅存在时）
- [ ] 确认 `.gitignore` 已忽略 `public/fonts/`（hero 产物同规则），没有则补

## 3. 字体栈

- [ ] `global.css` 的 `--font-serif` 首位加 `'Noto Serif SC'`，注释说明构建期子集与回退链

## 4. 规范

- [ ] `.trellis/spec/frontend/visual-system.md`：字体来源、358 字 / 127KB、回退栈、失败回退
- [ ] `AGENTS.md`（本地）：唯一本地字体改为 hero + 标题两个构建期子集
- [ ] `CONTEXT.md`：视需要补「标题字体子集」术语（与 hero 字体子集并列）

## 5. 验证

- [ ] `npm run heading:font` 产物存在；字符数/体积与设计一致
- [ ] `npm run build`：`dist/fonts/heading-serif.css` 存在；文章页 `<head>` 有 link；首页 hero link 仍在
- [ ] Playwright：
  - [ ] `.post-title` / `.prose h2` computed font-family 以 `Noto Serif SC` 开头
  - [ ] `document.fonts.check('700 36px "Noto Serif SC"')` true
  - [ ] 网络请求 `heading-serif/*.woff2` 状态 200
  - [ ] 亮/暗截图标题无跳变
- [ ] 回退演练：临时移走 `public/fonts/heading-serif.css` 重新 build → 无 link、构建成功、标题用系统衬线；恢复产物
- [ ] `npm run lint` / `npm test` / `npm run check` / `npm run build` 全绿
- [ ] `npm run shots`（如基线可用）或 before/after 对比：除标题字体外无意外变化

## 6. 提交

- [ ] `git diff --stat` 只含脚本、package.json、BaseLayout、global.css、spec/文档与任务文档
- [ ] 提交信息：`feat(reading): 自托管思源宋体标题子集`
- [ ] 不 push、不部署

## 回滚

- 删除脚本与 package.json 两处调用、BaseLayout link、`--font-serif` 首位，恢复系统栈；产物目录留空不影响构建。
