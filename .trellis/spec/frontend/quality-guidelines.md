# Quality Guidelines

> 验证命令与不可回退的检查。改代码后按改动范围选择命令，提交前跑完整门禁。

## 命令

| 命令 | 覆盖 |
| --- | --- |
| `npm test` | Vitest：`src/**/*.test.ts`、`scripts/admin/**/*.test.mjs` |
| `npm run lint` | Biome CI（含格式、import 排序） |
| `npm run check` | `astro check` + 对比度审计 |
| `npm run build` | Astro 构建 + CSS 产物断言 + Pagefind |
| `npm run contrast` | 单独跑对比度审计 |
| `npm run shots` | 截图基线（Linux 回退 Chromium） |
| `cd worker && npm test` | Worker 纯逻辑测试 |

CI（`.github/workflows/ci.yml`）顺序：`npm ci` → lint → test → check → build；`worker` job 用 `npm ci --prefix worker --omit=dev` 后跑 `node worker/test.mjs`。

## 测试

- 纯逻辑测试与源码同目录：`src/lib/bilibili.test.ts`、`src/lib/toc.test.ts`、`src/lib/taxonomy.test.ts`。
- 测试覆盖行为与边界（校验失败、空数据、跨年分片、排序），不测组件标记文本。
- 管理后台测试在 `scripts/admin/*.test.mjs`，由 Vitest 收集。
- 新逻辑先问「能否放进 `src/lib/` 并用 Vitest 覆盖」；不能才留给 preview/截图验证。

## 格式与静态检查

- Biome 2.x：2 空格、单引号、100 列、LF；`organizeImports` 开启。
- `.gitattributes` 锁定 LF；不要让编辑器把文件转成 CRLF。
- Astro 文件不在 Biome 的 `includes` 里；`.astro` 的格式跟随现有文件风格。

## URL 与构建产物

- 所有页面 URL 带尾斜杠；`astro.config.mjs` 的 `trailingSlash: 'always'` 与 `build.format: 'directory'` 不能改。
- 改路由后检查：站内链接、canonical、sitemap、RSS。
- `scripts/check-build.mjs` 会断言 `dist` 有 CSS 且 HTML 引用的 CSS 都存在；这是防「构建成功但发布无样式站点」的硬门禁，不要移除。
- Pagefind 索引在 build 末尾生成；搜索页用 `is:inline` 动态 import `/pagefind/pagefind.js`。

## 可访问性与视觉

- 对比度审计直接读 `src/styles/global.css` 的 token；阈值：正文 4.5，大字 3.0。改 token 后跑 `npm run contrast`。
- 交互元素有可见焦点；装饰图标 `aria-hidden`；状态提示 `role="status"`。
- 尊重 `prefers-reduced-motion`（TOC 滚动、页面过渡）。
- 主题切换后检查 `theme-color` meta 与 Giscus iframe 的同步（`ThemeToggle.astro`）。

## 文档与截图

- 截图/本地预览按 `scripts/shots.mjs` 的要求（先构建，脚本自身拉起 preview）。
- 不提交 `.shots/` 的临时产物，除非用户明确要求。
- 改动涉及的规范变化写回 `.trellis/spec/`，不要只留在会话里。

## 反模式

- 跳过 `npm run check` 只跑 `npm test`（会漏 Astro 类型与对比度）。
- 删除/绕过 `check-build.mjs` 的断言来让构建通过。
- 用 `!important` 压 typography；改 `--tw-prose-*` 变量。
- 在 `docs/` 里写 Tailwind 类名（`@source not` 已排除，但会造成误导）。
