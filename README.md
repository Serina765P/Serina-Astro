# Serina-Astro · 芹菜P的部落阁

个人博客（[blog.serinap.top](https://blog.serinap.top)）的源码仓库。Astro 5 + Tailwind CSS 4 + Pagefind，主题为自制的「雾粉手帖」：莫兰迪 token 体系（亮/暗双套语义色 + wash 分类色）、水彩 hero、便当盒首页与暖炭代码块。

## 本地开发

需要 Node ≥ 20（仓库作者用 fnm 管理）。

```bash
npm install
npm run dev       # http://localhost:4321，热更新（搜索页仅构建后可用）
npm run build     # astro build + pagefind 索引，产物在 dist/
npm run preview   # 预览构建产物（含搜索）
npm run check     # astro 类型检查
npm run contrast  # 核算主题 token 的 WCAG 对比度（exit 1 = 有不达标项）
```

## 目录结构

```
src/
  components/       # Header/Toc/Lightbox/CodeCopy 等组件
    skins/          # 文章皮肤（imas-album 专辑网格）
  content/posts/    # 文章 Markdown
  content.config.ts # 内容 schema（posts / shuoshuo）
  data/shuoshuo.json# 说说数据（邮件管道写入，构建时读入）
  layouts/          # Base / Page / Post 三层布局
  pages/            # 路由（首页/归档/分类/标签/说说/搜索/友链/关于）
  styles/global.css # 主题 token 与组件样式
scripts/            # contrast-audit（对比度审计）、vendor-fonts（旧字体方案，可回退）
worker/             # 说说邮件管道（Cloudflare Email Worker），见 worker/README.md
design-demos/       # 主题设计阶段的静态 demo 存档，与站点无关
```

## 内容工作流

### 写文章

往 `src/content/posts/` 丢一个 `.md`，push 到 main 即自动构建发布。frontmatter：

```yaml
---
title: 标题
date: 2026-09-07
updated: 2026-09-08        # 可选
tags: [偶像大师, Hi-Res]    # 可选，中文可用（slug 映射见 site.config.ts）
categories: [技术分享]      # 可选
description: 摘要           # 可选
skin: imas-album            # 可选，专辑网格皮肤
---
```

图片放 `public/images/`，文中以 `/images/xxx.webp` 引用。

### 发说说（邮件管道）

给 `shuo@serinap.top` 发封邮件，正文即说说内容，主题（可选）作为标题。Worker 校验后自动 commit 进 `src/data/shuoshuo.json`，push 触发 Cloudflare Pages 重建，约两分钟后上线。管道的部署、白名单与主题口令配置见 **[worker/README.md](worker/README.md)**。

也可以直接编辑 `src/data/shuoshuo.json` push，效果相同。历史条目（B 站动态，`type: OPUS`）保留点赞数与原动态链接；邮件条目（`type: MAIL`）无点赞无外链，说说页会自动隐藏对应元素。

## 部署

Cloudflare Pages 连接本仓库自动构建：

- Framework preset: Astro（自动检测）
- Build command: `npm run build`；输出目录: `dist`
- 环境变量：`NODE_VERSION = 22`
- 自定义域 `blog.serinap.top` 在 Pages 项目的 Custom domains 里绑定

旧站（Hexo 静态产物）仓库已归档为 archive，不再维护；评论（giscus）已切换到本仓库的 Discussions（General 分类）。首次部署后若评论区加载失败，需在 https://github.com/apps/giscus 给本仓库安装一次 giscus App。

## 字体

均走 [ZeoSeven Fonts](https://fonts.zeoseven.com) CDN（BaseLayout 引入）：

- 正文：**IBM Plex Sans SC**（item 389，OFL-1.1）——400 正文 / 500 UI 强调 / 600 加粗与小标题 / 700 大标题
- 首页 hero：**朝华标题明朝体**（item 2101，自定义许可）

`scripts/vendor-fonts.mjs` 是此前江城圆体自托管方案的遗留脚本，字体升级或想回退自托管时可用。

## 许可

站点内容（文章、说说、图片）版权归 芹菜P 所有；代码部分可参考主题思路，字体遵循其各自许可（见上）。
