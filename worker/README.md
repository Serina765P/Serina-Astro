# 说说邮件管道（shuoshuo-mailer）

给一条高熵私密收件地址发邮件 → Cloudflare Email Worker 校验 SMTP 信封收件人和发件人白名单 → 解析正文 → commit 到主仓库的 `src/data/shuoshuo/<沪年>.json` → Cloudflare Pages 自动构建并更新说说页。发信时不需要手动输入口令。

```
你发邮件（主题=标题可选，正文=说说内容）
  │
  ▼
Cloudflare Email Routing（serinap.top）
  │  仅将新生成的私密地址路由到 Worker
  ▼
Worker：先对比 SMTP envelope recipient 与 PUBLISH_TO，再检查 envelope From + MIME From 白名单
  │  postal-mime 解析正文、去签名；GitHub Contents API 更新年度分片
  ▼
push → Cloudflare Pages 构建 → https://blog.serinap.top/shuoshuo/
```

## 私密收件地址迁移

按此顺序操作，避免旧公开地址继续触发发布：

1. 在本机生成至少 128 bit 随机地址。本例生成 128 bit（32 个十六进制字符）的随机本地部分；只在本机终端查看并保存，不要把实际地址写进仓库、截图或公开日志：

   ```powershell
   $bytes = [byte[]]::new(16)
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   $rng.Dispose()
   $localPart = 'shuo-' + [Convert]::ToHexString($bytes).ToLowerInvariant()
   $publishTo = "$localPart@serinap.top"
   $publishTo
   ```

2. 配置 Worker secrets。`PUBLISH_TO` 必填；缺失时 Worker 会拒绝所有邮件。为避免覆盖 Cloudflare 中已有但当前不可读取的 `ALLOWED_SENDERS`，保留现有 secret 原值，单独用 `ADDITIONAL_ALLOWED_SENDERS` 添加新 Gmail 地址：

   ```bash
   npx wrangler secret put PUBLISH_TO
   # 粘贴上一步本机生成的完整地址

   npx wrangler secret put ADDITIONAL_ALLOWED_SENDERS
   # 输入：serina765p@gmail.com

   npx wrangler secret put GITHUB_TOKEN
   # 仅需在首次配置或轮换时执行；fine-grained PAT 只授予本仓库 Contents: Read and write
   ```

   保留当前 `ALLOWED_SENDERS`，它仍是原发件人白名单；运行时会把它与可选的 `ADDITIONAL_ALLOWED_SENDERS` 合并。若还未配置 `ALLOWED_SENDERS`，请先按已知的原有获准发件人清单设置，不能用新增 Gmail 列表代替原清单。

3. 部署当前 Worker 代码：

   ```bash
   npx wrangler deploy
   ```

4. 在 Cloudflare Email Routing 中，只为刚生成的私密地址建立指向 `shuoshuo-mailer` 的规则。删除或停用原 `shuo@serinap.top` 到 Worker 的规则；不要设置会把旧公开地址或其他地址转发给此 Worker 的 catch-all 规则。确认只有新地址路由到该 Worker。

5. 验证迁移：
   - 从 `serina765p@gmail.com` 发到新地址，确认说说成功发布。
   - 从未获准地址发到新地址，确认邮件被拒绝且 GitHub 仓库没有新提交。
   - 检查 `shuo@serinap.top` 已不再路由到 Worker；即使旧路由误留，Worker 的信封收件人检查也会拒绝旧地址。
   - 可用 `npx wrangler tail` 查看 Worker 运行情况；不要在日志或截图中暴露私密地址。

## 邮件内容与条目

主题是可选标题，正文是说说内容。Worker 优先读取 `text/plain`；只有 HTML 时才剥除标签。签名分隔线 `-- ` 及以下内容会被去掉；手机 QQ 等客户端不加分隔线时，会按发件人显示名和地址剥离尾部签名块。

条目结构（`type: MAIL`，无点赞无外链；schema 见主仓库 `src/content.config.ts`）：

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

## 本地测试

```bash
npm test
```

测试覆盖 SMTP envelope 收件人 fail-closed 校验、旧公开地址和错误地址拒绝、大小写/空格规范化、伪造 MIME To、发件人白名单合并，以及拒绝路径不访问 GitHub。

## 安全边界

- **私密收件人**：Worker 在解析邮件和发起任何 GitHub 请求之前，要求 SMTP envelope 的 `message.to` 与必填 `PUBLISH_TO` 完全匹配（忽略大小写与首尾空格）。MIME `To` 由发件人控制，不参与此判断。
- **发件人白名单**：SMTP envelope From 和 MIME From 都必须在 `ALLOWED_SENDERS` 或 `ADDITIONAL_ALLOWED_SENDERS` 中。新增 Gmail 只放在附加列表，避免替换已有 secret。
- **Authentication-Results**：不作为 SPF、DKIM 或 DMARC 的验证依据。邮件自带的该 MIME 头可伪造，Worker 不会据此宣称已完成发件域认证。
- **邮箱安全**：私密地址降低被发现和滥用的机会；邮箱账户或获准发件人账户被盗时，攻击者仍可能向该地址发布。可选 `SUBJECT_TOKEN` 可增加一道检查，但会要求邮件主题包含口令。
- **GitHub 权限**：token 只授予本仓库 Contents 读写权限。
