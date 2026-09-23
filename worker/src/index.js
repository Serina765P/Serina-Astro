// 说说邮件管道：收到邮件 → 校验 → 解析 → commit 进 src/data/shuoshuo/<沪年>.json（按年分片）。
// push 触发 Cloudflare Pages 自动构建，约两分钟后说说上线。
// 部署与 secret 配置见 worker/README.md。
import PostalMime from 'postal-mime';
import {
  buildItem,
  createShard,
  fromBase64,
  isAllowed,
  mergeItem,
  parseAllowList,
  shardPath,
  stripSignature,
  stripToken,
  toBase64,
} from './lib.js';

const GITHUB_API = 'https://api.github.com';

function gh(env, path, init = {}, fetchImpl = fetch) {
  return fetchImpl(`${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'shuoshuo-mail-worker',
      'Content-Type': 'application/json',
    },
  });
}

export async function emailHandler(message, env, fetchImpl = fetch) {
  // ── 1. 先验证 SMTP envelope recipient；MIME To 可由发件人任意填写 ──
  const publishTo = String(env.PUBLISH_TO || '')
    .trim()
    .toLowerCase();
  if (!publishTo) return message.setReject('发布收件地址未配置');
  const envelopeTo = String(message.to || '')
    .trim()
    .toLowerCase();
  if (!envelopeTo || envelopeTo !== publishTo) {
    return message.setReject('收件地址不匹配');
  }

  // ── 2. 校验信封与头部发件人；Authentication-Results 不可信，不用作认证依据 ──
  const allow = parseAllowList(env.ALLOWED_SENDERS, env.ADDITIONAL_ALLOWED_SENDERS);
  const raw = await PostalMime.parse(message.raw);
  const envelopeFrom = message.from || '';
  const headerFrom = raw.from?.address || '';
  if (!isAllowed(envelopeFrom, allow) || !isAllowed(headerFrom, allow)) {
    return message.setReject('发件人不在白名单');
  }

  // ── 3. 主题口令（可选，配置 SUBJECT_TOKEN 后启用）──
  const { subject, ok } = stripToken(raw.subject || '', env.SUBJECT_TOKEN || '');
  if (!ok) return message.setReject('主题缺少发布口令');

  // ── 4. 正文：取 text/plain；只有 HTML 时做极简剥标签兜底 ──
  let text = raw.text || '';
  if (!text && raw.html) {
    text = raw.html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }
  text = stripSignature(text, raw.from);
  if (!text) return message.setReject('正文为空');

  const item = buildItem({
    id: String(raw.messageId || `${Date.now()}`).replace(/[<>]/g, ''),
    subject,
    content: text,
    publishedAt: raw.date ? new Date(raw.date) : new Date(),
  });

  // ── 5. 读取该条目所属年份的分片（不存在则新建）→ 合并 → commit（push 自动触发 Pages 构建）──
  const branch = env.GITHUB_BRANCH || 'main';
  const path = encodeURI(shardPath(env.SHUOSHUO_DIR || 'src/data/shuoshuo', item.published_at));

  let getRes;
  try {
    getRes = await gh(env, `${path}?ref=${branch}`, {}, fetchImpl);
  } catch {
    return message.defer(); // 网络抖动：重新入队，稍后重投
  }

  let meta = null;
  let data;
  if (getRes.status === 404) {
    data = createShard(item); // 该年份还没有分片：新建（PUT 不带 sha）
  } else if (getRes.ok) {
    meta = await getRes.json();
    data = JSON.parse(fromBase64(meta.content));
  } else {
    return getRes.status >= 500
      ? message.defer()
      : message.setReject(`GitHub 读取失败 ${getRes.status}`);
  }

  if (meta) {
    const { changed } = mergeItem(data, item);
    if (!changed) return; // 同一封邮件重复投递：静默跳过
  }

  const putRes = await gh(
    env,
    path,
    {
      method: 'PUT',
      body: JSON.stringify({
        message: `说说(mail): ${subject || item.published_at}`,
        content: toBase64(`${JSON.stringify(data, null, 2)}\n`),
        ...(meta ? { sha: meta.sha } : {}),
        branch,
      }),
    },
    fetchImpl,
  );
  if (!putRes.ok) {
    return putRes.status >= 500
      ? message.defer()
      : message.setReject(`GitHub 提交失败 ${putRes.status}`);
  }
  // 成功：邮件照常投递入站（不 reject），无需回执
}

export default {
  email: emailHandler,
};
