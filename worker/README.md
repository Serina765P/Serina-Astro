# 说说邮件管道（shuoshuo-mailer）

给 `shuo@serinap.top` 发邮件 → Cloudflare Email Worker 收信 → 校验 → 解析 → commit 进主仓库的 `src/data/shuoshuo/<沪年>.json`（按年分片）→ push 触发 Cloudflare Pages 自动构建 → 说说上线。全程免费额度，延迟约 2–3 分钟。

```
你写邮件（主题=标题可选，正文=说说内容）
  │
  ▼
Cloudflare Email Routing（serinap.top 的 MX 已托管）
  │  路由规则：收件人 shuo@ → 发给 Worker
  ▼
本 Worker（email handler）
  │  1. 白名单 + SPF/DKIM 校验（不在白名单 → setReject 退信）
  │  2. 主题口令校验（可选，防地址泄露后被冒发）
  │  3. postal-mime 解析：正文 text/plain（仅 HTML 时剥标签兜底）、去签名（-- 线以下丢弃）
  │  4. GitHub Contents API：读 src/data/shuoshuo/<沪年>.json（按年分片）→ 顶部插入新条目 → PUT commit
  │     （分片不存在则新建；同一 Message-ID 重复投递自动跳过；GitHub 5xx/网络抖动 defer 重试）
  ▼
push → Cloud Pages 构建（~2 分钟）→ https://blog.serinap.top/shuoshuo/
```

条目结构（type: `MAIL`，无点赞无外链；schema 见主仓库 `src/content.config.ts`）：

```json
{
  "id": "<邮件 Message-ID>",
  "title": "<主题，可空>",
  "type": "MAIL",
  "content": "<正文>",
  "images": [],
  "link": "",
  "like": 0,
  "published_at": "<邮件 Date 头>"
}
```

## 部署步骤（一次性）

1. **创建 Worker 并部署**

   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler deploy
   ```

2. **配置三个 secret**（`wrangler.toml` 里只放公开变量，敏感项走 secret）：

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   # fine-grained PAT：Repository access 仅选 Serina-Astro，
   # Permissions 只给 Contents: Read and write。建议设短有效期并定期轮换。

   npx wrangler secret put ALLOWED_SENDERS
   # 逗号分隔白名单，如：serinap@qq.com,serina@example.com

   npx wrangler secret put SUBJECT_TOKEN
   # 主题口令（可选）。配置后邮件主题必须包含该口令才会发布，
   # 口令本身会从标题中剔除。强烈建议配置。
   ```

3. **开启 Email Routing 并挂路由**（Cloudflare 面板 → serinap.top → Email → Email Routing）：

   - 启用 Email Routing（按提示添加 MX/TXT 记录）
   - Routing rules → 新建：Catch-all 或指定地址 `shuo@serinap.top` → Action: **Send to a Worker** → 选 `shuoshuo-mailer`

4. **验证**：从白名单地址发一封带口令的邮件，然后 `npx wrangler tail` 看日志；主仓库 `src/data/shuoshuo.json` 应多出一条 `type: MAIL` 的记录，Pages 构建完成后说说页可见。

## 本地测试

解析/合并逻辑与 Cloudflare 解耦在 `src/lib.js`，可不依赖 CF 直接跑断言：

```bash
npm test   # node test.mjs：解析/白名单/口令/签名/幂等/base64 往返
```

## 安全模型

- **白名单**：信封发件人（SMTP MAIL FROM）与头部 From 都必须在 `ALLOWED_SENDERS` 内。
- **SPF/DKIM**：Authentication-Results 出现 `spf=fail` 或 `dkim=fail` 直接拒收（From 可以伪造，DMARC 校验结果是最后一道闸）。
- **主题口令**：`SUBJECT_TOKEN` 配置后生效；即使邮箱地址泄露，没有口令的邮件进不来。
- **权限最小化**：GitHub token 只授予单仓库的 Contents 读写，不能碰其他任何东西。

## 后续计划

- 图片支持：邮件附件 → R2（`statics.serinap.top`），条目 `images` 填 URL。
- 编辑/删除命令：主题里写 `del <id>` 之类的指令。
- 发布回执：通过 send_email 绑定回发确认邮件。
