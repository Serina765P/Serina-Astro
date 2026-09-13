// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

export default defineConfig({
  site: 'https://blog.serinap.top',
  // P2-13：与 build.format: 'directory' 一致 —— 页面产物是 <name>/index.html，
  // 规范 URL 一律带尾斜杠；dev/preview 会对无斜杠访问直接 404，逼出站内漏改的链接。
  // 生产侧 Cloudflare Pages 对目录型路径自动 308 补斜杠（/about → /about/），无需 _redirects。
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  // S20：正文图/组件图统一走 astro:assets。constrained 让 Markdown 相对路径图片
  // 自动获得 srcset/sizes；不开 responsiveStyles —— 尺寸约束由 Tailwind preflight
  // （img{max-width:100%;height:auto}）与组件 class 承担，避免 @layer astro.images
  // 与 Tailwind 层序产生新的不确定优先级。
  image: {
    layout: 'constrained',
  },
  integrations: [
    mdx(),
    sitemap(),
    icon({
      include: {
        // S25：material-symbols 白名单放开为通配 —— 图标只在构建期解析，产物里只有实际渲染的
        // 那些（S25 实测 21 个在用图标、未用图标不进 dist），漏加图标不再静默缺失。
        // simple-icons 保持显式列表：品牌图标数量庞大，误用/拼错更值得被构建拦住。
        'material-symbols': ['*'],
        'simple-icons': ['github', 'x', 'tencentqq', 'bilibili'],
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      // 亮/暗都用暗色 token：底色由 global.css 按模式切换为暖炭（亮 #4a443c / 暗 #1e1b18）
      themes: {
        light: 'github-dark-dimmed',
        dark: 'github-dark-dimmed',
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
