// 纯逻辑：邮件 → 说说条目（无副作用，worker/test.mjs 可直接本地跑）
// schema 对应 src/content.config.ts 的 shuoshuo collection：
// type 'OPUS' = B 站动态（历史数据），'MAIL' = 邮件发布

/** 去掉邮件签名：RFC 惯例分隔线 "-- "（或 "--"）及以下全部丢弃 */
export function stripSignature(text) {
  const m = text.match(/^-- ?$[\s\S]*/m);
  return (m ? text.slice(0, m.index) : text).replace(/\r\n/g, '\n').trim();
}

/** 发件人是否在白名单（不区分大小写；ALLOWED_SENDERS 逗号分隔） */
export function isAllowed(from, allowList) {
  return allowList.includes(String(from || '').trim().toLowerCase());
}

/** Authentication-Results 里出现 spf/dkim 硬失败视为校验未通过（伪造拦截） */
export function authFailed(authResults) {
  const s = String(authResults || '').toLowerCase();
  return /spf\s*=\s*fail/.test(s) || /dkim\s*=\s*fail/.test(s);
}

/** 主题口令：SUBJECT_TOKEN 配置后，主题不含口令的邮件一律拒绝；口令从标题中剔除 */
export function stripToken(subject, token) {
  const s = String(subject || '').trim();
  if (!token) return { subject: s, ok: true };
  if (!s.includes(token)) return { subject: '', ok: false };
  return { subject: s.replaceAll(token, '').trim(), ok: true };
}

/** 邮件解析产物 → shuoshuo.json 里的一条 item */
export function buildItem({ id, subject, content, publishedAt }) {
  return {
    id: String(id),
    title: subject || '',
    type: 'MAIL',
    content: String(content || ''),
    images: [],
    link: '',
    like: 0,
    published_at: (publishedAt instanceof Date ? publishedAt : new Date(publishedAt || Date.now())).toISOString(),
  };
}

/** 合并进 shuoshuo.json：新条目置顶；同 id（Message-ID）重复投递直接跳过，天然幂等 */
export function mergeItem(data, item, now = new Date()) {
  if (data.items.some((it) => it.id === item.id)) {
    return { data, changed: false };
  }
  data.items.unshift(item);
  data.source = 'mail-to-github';
  data.fetched_at = now.toISOString();
  data.count = data.items.length;
  return { data, changed: true };
}

/** base64 编解码（内容含中文，btoa/atob 不能直接用） */
export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
