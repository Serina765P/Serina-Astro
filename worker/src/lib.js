// 纯逻辑：邮件 → 说说条目（无副作用，worker/test.mjs 可直接本地跑）
// schema 对应 src/content.config.ts 的 shuoshuo collection：
// type 'OPUS' = B 站动态（历史数据），'MAIL' = 邮件发布
// 说说数据按年分片存放（src/data/shuoshuo/<沪年>.json），写入路径由 shardPath() 决定。

/**
 * 去掉邮件签名：
 * 1) RFC 惯例分隔线 "-- "（或 "--"）及以下全部丢弃；
 * 2) 手机 QQ 邮箱等客户端不加分隔线，直接在尾部追加「显示名 + 邮箱地址」，
 *    此时按发件人身份（from.name / from.address）识别签名块并从尾部剥离。
 */
export function stripSignature(text, from = {}) {
  let s = String(text || '').replace(/\r\n/g, '\n');
  const m = s.match(/^-- ?$[\s\S]*/m);
  if (m) s = s.slice(0, m.index);

  const lines = s.split('\n');
  const cut = signatureTailStart(lines, from);
  return (cut >= 0 ? lines.slice(0, cut).join('\n') : s).trim();
}

/** 尾部签名块的起始行号；识别不出则 -1（只认发件人自己的身份行，避免误伤正文） */
function signatureTailStart(lines, from) {
  const name = String(from?.name || '').trim();
  const address = String(from?.address || '').trim();
  if (!address) return -1;

  const tail = [];
  for (let i = lines.length - 1; i >= 0 && tail.length < 2; i--) {
    if (lines[i].trim()) tail.push({ index: i, text: lines[i].trim() });
  }
  if (tail.length < 2) return -1;

  const [last, prev] = tail;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();

  // ① 末两行恰为「显示名 + 邮箱地址」（顺序不限）
  if (
    name &&
    ((same(last.text, name) && same(prev.text, address)) ||
      (same(last.text, address) && same(prev.text, name)))
  ) {
    return prev.index;
  }
  // ② 末行是发件邮箱、且两行签名块与正文之间隔有空行（From 昵称与签名不一致时兜底）
  if (same(last.text, address) && prev.index > 0 && !lines[prev.index - 1].trim()) {
    return prev.index;
  }
  return -1;
}

/** 发件人是否在白名单（不区分大小写；ALLOWED_SENDERS 逗号分隔） */
export function isAllowed(from, allowList) {
  return allowList.includes(
    String(from || '')
      .trim()
      .toLowerCase(),
  );
}

/** 合并逗号分隔的地址白名单，并统一大小写与首尾空格。 */
export function parseAllowList(...values) {
  return values
    .flatMap((value) => String(value || '').split(','))
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

/** 主题口令：SUBJECT_TOKEN 配置后，主题不含口令的邮件一律拒绝；口令从标题中剔除 */
export function stripToken(subject, token) {
  const s = String(subject || '').trim();
  if (!token) return { subject: s, ok: true };
  if (!s.includes(token)) return { subject: '', ok: false };
  return { subject: s.replaceAll(token, '').trim(), ok: true };
}

/** 邮件解析产物 → 说说分片里的一条 item */
export function buildItem({ id, subject, content, publishedAt }) {
  return {
    id: String(id),
    title: subject || '',
    type: 'MAIL',
    content: String(content || ''),
    images: [],
    link: '',
    like: 0,
    published_at: (publishedAt instanceof Date
      ? publishedAt
      : new Date(publishedAt || Date.now())
    ).toISOString(),
  };
}

/** 东八区年份：站内日期展示都按 Asia/Shanghai，分片路径必须同口径，否则跨年条目会写错文件 */
export function yearInShanghai(date) {
  const d = date instanceof Date ? date : new Date(date);
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(d),
  );
}

/** 说说分片路径：<dir>/<沪年>.json（与主仓库 src/content.config.ts 的 loader 契约一致） */
export function shardPath(dir, publishedAt) {
  return `${String(dir).replace(/\/+$/, '')}/${yearInShanghai(publishedAt)}.json`;
}

/** 新年份分片的初始信封（结构同既有分片：source / fetched_at / count / items） */
export function createShard(item, now = new Date()) {
  return {
    source: 'mail-to-github',
    fetched_at: now.toISOString(),
    count: 1,
    items: [item],
  };
}

/** 合并进某年的说说分片：新条目置顶；同 id（Message-ID）重复投递直接跳过，天然幂等 */
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
