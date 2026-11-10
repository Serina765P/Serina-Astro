# Worker: Shuoshuo Email Pipeline

> `worker/` 是独立的 Cloudflare Email Worker 项目。它把邮件变成说说分片并 commit 回主仓库；安全边界优先于功能。

## 入口与数据流

- `worker/src/index.js` — Email handler：校验 → 解析 → 读分片 → 合并 → GitHub Contents API 写入。
- `worker/src/lib.js` — 纯逻辑：签名剥离、白名单、主题口令、条目构造、分片路径、合并。
- `worker/test.mjs` — 本地桩测试，不依赖 Cloudflare。
- 部署：`cd worker && npm run deploy`；secret 用 `wrangler secret put <NAME>`。

## 安全边界（不可放宽）

1. 先比较 SMTP envelope recipient 与 `PUBLISH_TO`；缺失或不等直接 `setReject`。MIME `To` 不可信。
2. 同时校验信封 `From` 与 MIME `From` 都在 `ALLOWED_SENDERS` / `ADDITIONAL_ALLOWED_SENDERS` 白名单内（大小写不敏感）。
3. 不使用 `Authentication-Results` 作为认证依据。
4. 配置 `SUBJECT_TOKEN` 后，主题必须包含口令；口令从标题中剔除。
5. 日志中的错误信息必须经过 `safeErrorValue` 脱敏，不能打印 token、`PUBLISH_TO`、收件地址。
6. `wrangler.toml` 只放公开变量；`GITHUB_TOKEN`、`ALLOWED_SENDERS`、`PUBLISH_TO`、`SUBJECT_TOKEN` 都是 secret。

## 数据契约

- 分片路径：`<SHUOSHUO_DIR>/<Asia/Shanghai 年>.json`，默认 `src/data/shuoshuo/`。
- 信封：`{ source, fetched_at, count, items }`；条目形状与 `src/content.config.ts` 的 shuoshuo schema 对齐。
- 条目 `id` 来自 `Message-ID`（去掉 `<>`）；合并时按 id 去重，新条目 prepend。
- 年份按东八区取（`yearInShanghai`），与站点展示同口径。
- 写入走 GitHub Contents API 的 base64 + sha 更新；提交信息与分支由环境变量控制。

## 测试

- `cd worker && npm test` 或根目录 `node worker/test.mjs`；CI 会跑。
- 覆盖：收件人/发件人拒绝、口令缺失、签名剥离（含手机 QQ 无分隔线）、分片路径跨年、重复 id 合并。
- 新增安全规则必须同时加拒绝路径测试；不要只测成功路径。

## 文档

- 部署、secret 配置、地址迁移步骤以 `worker/README.md` 为准；改安全行为前先读它。
- 私密收件地址与 secret 不得出现在仓库文件、日志、截图中。
