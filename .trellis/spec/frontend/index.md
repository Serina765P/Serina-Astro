# Frontend Development Guidelines

> Serina-Astro 前端的实际约定。规则必须能指向本仓库的真实文件或测试；没有源码支撑的规则不要写进来。

## 技术栈

- Astro 7 静态站点，`trailingSlash: 'always'` + `build.format: 'directory'`（`astro.config.mjs`）。
- Tailwind v4 + `@tailwindcss/typography`；token、utility、prose 变量都在 `src/styles/global.css`。
- 站点页面没有 React/Vue 岛；交互由 `src/scripts/` 的原生 TS 脚本承担，音乐播放器首次点击后才动态加载 Video.js。
- 纯逻辑在 `src/lib/*.ts`，同目录 `*.test.ts` 由 Vitest 覆盖（`vitest.config.ts`）。
- 管理后台是独立的 Node 服务 `scripts/admin/`，不属于 Astro 构建产物。
- `worker/` 是独立的 Cloudflare Email Worker 项目，见 [worker spec](../worker/index.md)。

## Pre-Development Checklist

1. 先读 `CONTEXT.md` 的术语与 `docs/adr/` 中与本区域相关的 ADR。
2. 页面先看 `src/pages/` 的现有路由命名；组件先找 `src/components/primitives/` 是否已有基元。
3. 改样式前读 `src/styles/global.css` 的 token 与层序说明；不要在组件里另造颜色/宽度。
4. 改 TOC 时同时读 `src/lib/toc.ts`（构树）、`src/scripts/toc.ts`（运行时）、`src/components/Toc.astro` 与 `TocTree.astro`（渲染）。
5. 加客户端脚本时确认 `astro:page-load` 绑定与 `document.documentElement.dataset.*Bound` 幂等标记。
6. 改内容 schema 时同步 `src/content.config.ts`、`src/lib/post-frontmatter.ts`、`scripts/admin/lib/frontmatter.mjs`。
7. 改 URL 或路由时检查尾斜杠、canonical、sitemap、RSS。

## Quality Check

- `npm test` — Vitest（`src/**/*.test.ts`、`scripts/admin/**/*.test.mjs`）。
- `npm run lint` — Biome CI（2 空格、单引号、100 列、LF）。
- `npm run check` — `astro check` + `scripts/contrast-audit.mjs`。
- `npm run build` — Astro 构建 + `scripts/check-build.mjs` CSS 产物断言 + Pagefind。
- `cd worker && npm test` — Worker 纯逻辑测试。
- UI 改动：本地 preview 实际走查；截图基线用 `npm run shots`。

## Spec Files

| 文件 | 内容 |
| --- | --- |
| [directory-structure.md](./directory-structure.md) | 路由、组件、布局、lib/scripts/data 的边界 |
| [component-guidelines.md](./component-guidelines.md) | `.astro` 组件、Props、基元、样式与可访问性 |
| [client-scripts.md](./client-scripts.md) | ClientRouter 下的脚本生命周期、懒加载与事件委托 |
| [state-management.md](./state-management.md) | 构建期数据、URL 状态、`localStorage`、跨组件事件 |
| [type-safety.md](./type-safety.md) | 严格 TS、schema 真值、边界校验 |
| [quality-guidelines.md](./quality-guidelines.md) | 命令、测试、CI、URL、对比度与构建断言 |

## 写作约定

- 文档用中文，代码标识符、路径、命令保持英文。
- 每条规则给出真实文件或测试；不要写「应该保持整洁」这类无法验证的话。
- 发现规则与代码不一致时，先改代码或先改规则，不要让两者长期分叉。
