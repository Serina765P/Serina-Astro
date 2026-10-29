# Serina-Astro

[blog.serinap.top](https://blog.serinap.top) 的源码：Astro + Tailwind CSS 4 + Pagefind，由 GitHub Actions 构建并部署到 Cloudflare Pages。

## 本地开发

```bash
npm install --include=dev
npm run dev       # http://localhost:4321
npm run build     # 构建 + pagefind 搜索索引 → dist/
npm run preview   # 预览构建产物
```

## 部署

线上站点由 GitHub Actions 构建并上传到 Cloudflare Pages（`.github/workflows/deploy.yml`）。除说说邮件管道外，普通 push 只跑 CI（`.github/workflows/ci.yml`），不会更新线上内容。

| 场景 | 触发 |
| --- | --- |
| 显式发布 | 在 main 头部打 `deploy-*` 标签并推送 |
| 手动发布 | Actions → Deploy → Run workflow（或 `gh workflow run deploy.yml`） |
| 说说邮件管道 | Worker 提交 `src/data/shuoshuo/**` 后自动发布 |

标签和手动发布都要求目标提交是 main 头部：Deploy workflow 会先校验，其他提交直接失败。

```bash
git fetch origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "标签必须打在 main 头部"; exit 1; }
tag="deploy-$(date +%Y%m%d-%H%M%S)"
git tag "$tag"
git push origin "$tag"
```

Deploy workflow 依次跑 `lint`、`test`、`check`、`build`，然后把 `dist/` 上传。上传命令等价于：

```bash
npx wrangler@4 pages deploy dist --project-name=<项目名> --branch=main
```

workflow 还会附加 `--commit-hash` 与 `--commit-message`。

### 一次性配置

1. Cloudflare Pages 项目 → Settings → Builds & deployments → Branch control：关闭 **Enable automatic production branch deployments**，Preview deployments 设为 **None**。构建命令与输出目录保留即可，不再使用。
2. 创建 API token（Account API token 或 user token 均可，Pages 对两者都支持）：
   - 权限只选 **Account → Cloudflare Pages → Edit**；
   - Account resources 限定到本站所在账户，Zone resources 留空；
   - 不要设 Client IP 过滤（GitHub runner 出口 IP 不固定），TTL 设为 1 年后轮换；
   - 不要用 Global API Key，也不需要 Workers 权限（邮件 Worker 仍单独 `wrangler deploy`）。
3. 在 GitHub 仓库写入凭据和项目名：

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh variable set CLOUDFLARE_ACCOUNT_ID --body "<account id>"
gh variable set CLOUDFLARE_PAGES_PROJECT --body "<pages project name>"
```

站点仍受 Pages 的 20,000 文件 / 25 MiB 单文件限制；当前 `dist` 751 个文件、最大约 1 MB。

回滚：重新勾选自动部署（并按 `AGENTS.md` 同步更新 README 与 CONTEXT）、删除 Deploy workflow、吊销 API token。

## 写内容

- **文章**：Markdown 丢进 `src/content/posts/`，frontmatter 必填 `title`、`date`；标签/分类可直接写中文（slug 映射见 `src/site.config.ts`）。正文图片放在对应文章目录中；可选封面写 `cover: ./cover.webp`，需要置顶时写 `pinned: true`。
- **说说**：给 `shuo@serinap.top` 发封邮件（正文即内容，主题可选作标题），Email Worker 自动提交数据并触发 Deploy workflow；实现与部署见 [`worker/`](worker/README.md)。

说说数据按上海时区分片存放于 `src/data/shuoshuo/<年份>.json`，每个文件保留 `{ source, fetched_at, count, items }` 信封结构。

## 字体

正文 IBM Plex Sans SC，首页标题朝华标题明朝体，均经 ZeoSeven Fonts CDN 加载，许可见各条目页。
