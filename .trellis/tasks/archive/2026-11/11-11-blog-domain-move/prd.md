# PRD：博客域名迁移到 blog.serina.top

## 背景

站点域名由 `blog.serinap.top` 更换为 `blog.serina.top`；用户侧已在域名/Cloudflare 层配置 301 跳转。
仓库内所有指向站点自身的绝对 URL、文档里的站点地址必须同步，否则 canonical、sitemap、RSS、分享卡片仍会指向旧域名。

## 范围

改（站点自身域名）：

- `astro.config.mjs` 的 `site`
- `src/site.config.ts` 的 `SITE.url`
- `public/robots.txt` 的 `Sitemap:` 绝对地址
- `src/content/posts/765-music-collection.md`：原先写死旧域名的站内链接，改为站内相对路径 `/posts/imas-hires/`（以后再换域名不用再改正文）
- 文档：`README.md`、`CONTEXT.md`、`AGENTS.md`、`worker/README.md`

不改（明确保留）：

- 邮箱域名 `@serinap.top`（Worker 邮件管道、Cloudflare Email Routing）
- 个人主页 `www.serinap.top`（`Footer.astro`、`site-info.json`）
- `docs/research/*`：带调研日期的历史记录，记录的是当时的线上地址，不改写历史

## 验收

- `npx astro build` 通过；产物里 `blog.serinap.top` 零残留
- 首页 canonical、`og:url` 为 `https://blog.serina.top/`
- `sitemap-0.xml`、`rss.xml`、`dist/robots.txt` 均为新域名
- 改动后的站内链接在产物中为 `/posts/imas-hires/`
- `npm run lint`、`npm test`、`npm run check` 全部通过

## 验证记录

均在本机执行（2026-11-11）：

- `npx astro build` → 50 页构建成功
- canonical / og:url → `https://blog.serina.top/`
- `grep -rl 'blog.serinap.top' dist` → 空；新域名出现在 54 个产物文件
- `sitemap-0.xml` 首条 `<loc>https://blog.serina.top/</loc>`；`rss.xml` 的 `<link>` 为新域名；`robots.txt` 的 Sitemap 行已更新
- `npm run lint` → 90 文件通过；`npm test` → 14 文件 / 226 项通过；`npm run check` → astro check + 对比度审计全通过

## 用户侧仍需确认（不在仓库内）

- Cloudflare Pages 项目的自定义域已切到 `blog.serina.top`
- 旧域 `blog.serinap.top` 的 301 指向新域且保留路径
- 旧域名若曾用于 RSS 订阅，阅读器跟随 301 即可，无需改 `_redirects`
