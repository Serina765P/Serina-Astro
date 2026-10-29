# 本地管理后台（Admin Console）架构决策

为统一博客文章写作、说说发布、分类/标签映射与表情贴纸素材管理，我们在仓库内开辟 `admin/`（前端 Vite + Vue 3 SPA）与 `scripts/admin/`（后端 Node HTTP 服务），并废弃原独立单文件 `scripts/asset-editor.mjs` 及外部项目 `Astro-WebUI`。后台采用纯本地原子写入模式，不集成自动 Git 提交与发布，以严格遵守主站纯 SSG 架构和 Cloudflare Pages 静态部署边界。

界面层采用 Nuxt UI v4 仪表盘（`@nuxt/ui/vite` + `@nuxt/ui/vue-plugin` + Tailwind CSS v4）：`UDashboardGroup/Sidebar/Panel` 负责可折叠侧栏、移动端抽屉与固定 footer；Vue Router history 路由承载 `/site`、`/posts` 等面板路径；自定义 `brand` 50–950 色阶（primary `#5269ad`、neutral `slate`），明暗跟随系统。Vite + Vue 3 + Node API 的总体结构保持不变。

## Considered Options

- **外部独立 WebUI（Astro-WebUI）**：维护双仓库摩擦大，跨进程同步体验割裂。
- **单脚本内联 Vue（原 asset-editor 模式）**：无编译步骤，但无法引入富文本/Markdown 编辑器等现代 npm 生态组件，单文件极度臃肿。
- **Astro 内置 SSR 路由**：需破坏当前站点纯 SSG 与 Cloudflare Pages 静态托管架构，引入服务端渲染复杂度与线上暴露风险。
- **内嵌 Vite + Vue 3 SPA + Nuxt UI + 本地 Node API 服务（已采纳）**：开发体验流畅，Nuxt UI 提供统一的仪表盘、表单与无障碍组件，热更新零侵入线上静态构建管道。
