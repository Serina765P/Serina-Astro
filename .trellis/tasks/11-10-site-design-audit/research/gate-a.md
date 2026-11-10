# 闸门 A 证据（改造前后）

## 基线（改动前）

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | exit 0 |
| `npm test` | 14 文件 / 226 用例通过 |
| `npm run check` | astro check 通过；对比度审计「全部通过」 |
| `npm run build` | exit 0；`check-build.mjs` 通过；Pagefind 索引 49 页 |
| 站内链接 | 50 个 HTML、1337 条内部 `href`、**0 条断链** |
| 尾斜杠 | 无缺尾斜杠的站内链接（0 条） |
| canonical | 50 个页面各 1 条，唯一 50 |
| sitemap | 49 条 URL，全部带尾斜杠 |

命令：

```bash
node -e "…遍历 dist/**/*.html，解析 href，比对目录式产物…"
```

## 变更后（最终提交前）

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | exit 0 |
| `npm test` | 14 文件 / 226 用例通过 |
| `npm run check` | astro check 0 error / 0 warning；对比度审计「全部通过」 |
| `npm run build` | exit 0；`check-build.mjs` 通过；Pagefind 索引 49 页 |
| 站内链接 | 50 个 HTML、1337 条内部 `href`、**0 条断链** |
| 尾斜杠 | 0 条缺尾斜杠 |
| canonical | 50 条，唯一 50 |
| sitemap | 49 条 URL，全部带尾斜杠 |
| `npm run shots baseline` | 26 张，0 张不稳定（本机两轮一致） |
| 减少动效 | `prefers-reduced-motion: reduce` 下 22 个入场条目 0 隐藏、0 位移 |
| 键盘 | 前 12 个 Tab 落点顺序正确（跳过导航→站点名→导航→搜索→主题），全部 `outline: solid 2px` |
| 暗色 | 5 条路由 × 2 宽度截图，`document.documentElement.classList` 含 `dark`，0 隐藏条目 |
| 控制台 | 首页无 `pageerror` / `console.error` |

期间发现并修复的一处真实错误：`src/scripts/motion.ts` 没有 import/export，被 TypeScript 当作全局脚本，与 `src/scripts/toc.ts` 的顶层 `teardown` 撞名（ts2451 ×2），导致 `astro check` 失败。补 `export {};` 后归零。
