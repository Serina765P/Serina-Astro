# Serina-Astro

[blog.serinap.top](https://blog.serinap.top) 的源码：Astro + Tailwind CSS 4 + Pagefind，Cloudflare Pages 构建部署。

## 本地开发

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # 构建 + pagefind 搜索索引 → dist/
npm run preview   # 预览构建产物
```

## 部署

Cloudflare Pages 连接本仓库：Build command `npm run build`，输出目录 `dist`，环境变量 `NODE_VERSION=22`。

## 写内容

- **文章**：Markdown 丢进 `src/content/posts/`，frontmatter 必填 `title`、`date`；标签/分类可直接写中文（slug 映射见 `src/site.config.ts`）；图片放 `public/images/`。
- **说说**：给 `shuo@serinap.top` 发封邮件（正文即内容，主题可选作标题），Email Worker 自动提交数据并触发构建；实现与部署见 [`worker/`](worker/README.md)。

## 字体

正文 IBM Plex Sans SC，首页标题朝华标题明朝体，均经 ZeoSeven Fonts CDN 加载，许可见各条目页。
