# PRD：移除全站 BGM，并去掉首页索引底色

## 背景

上一轮视觉减重（B 版）把全站 BGM 悬浮胶囊从 `BaseLayout` 摘掉但保留了组件与 CSS。
用户确认不再需要这个功能；同时首页「小站索引」虽然已压成一行，但仍铺了一条 brand-wash 色带，
用户要求去掉底色。另外个人主页已迁移到 `www.serina.top`（旧域 301），页脚链接需要跟上。

## 范围

1. 删除 `src/components/music/BgmPlayer.astro`（组件本体）。
2. 删除 `src/styles/music.css` 里 189 行 BGM 专属样式（`.bgm*`、悬浮定位、面板展开、reduced-motion），
   并把文件头注释改成「文章卡片 + 共用控制条」的现状。
3. `src/scripts/music-loader.ts` 注释去掉 BGM 语境（加载逻辑本身仍服务文章内音乐，保留）。
4. `CONTEXT.md`：「全站 BGM」由「已下线」改为「已移除」，音乐播放器词条同步。
5. 首页 `.site-index` 去掉 `background: var(--brand-wash)` 与 `padding-block`，只保留分区间距；
   索引行成为页脚上方一行注脚。
6. `src/components/Footer.astro` 个人主页链接 `www.serinap.top` → `www.serina.top`（旧域已验证 301 到新域）。

## 不做

- 文章内音乐（`ArticleMusicPlayer`、`MusicTransport`、`music.ts`、歌单快照与端点）保留；
  当前没有文章使用，等首次用到再决定去留。
- 说说页保持现状（用户确认）。

## 验收

- `npm run build` / `npm run lint` / `npm test` / `npm run check` 全部通过
- 产物里 `id="bgm"` 为 0；`src/` 内无 `bgm` 代码引用
- 首页 HTML 无 `serinap` 残留；页脚链接为 `https://www.serina.top/`
- 首页整页高 1851 → 1814（去掉 1.15rem 上下内边距后的净变化）
- 视觉：索引行上方与文章列表的分区间距不变，下方紧接页脚，无底色块

## 验证记录（本机，2026-11-11）

- `npm run build`：50 页构建成功；`npm run lint` 通过；`npm test` 226 项通过；`npm run check` 通过
- `grep -rn bgm src`：无代码引用（仅 `_astro` 产物与历史文档）
- 截图：`/tmp/audit/final/home-1440.png`、`home-390.png`（本地临时目录，未入库）

## 用户仍需确认（外部，不在仓库）

- Cloudflare Pages 是否用新构建重新部署（本次未推送、未打 deploy 标签）
- 说说邮件管道域名是否从 `@serinap.top` 迁到 `@serina.top`（涉及 Email Routing、`PUBLISH_TO` secret、
  Worker 重新部署；详见对话里的迁移清单）
