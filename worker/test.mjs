// 本地桩测试：不依赖 Cloudflare，直接验证 邮件解析 → 条目构造 → 合并 的完整逻辑。
// 用法：cd worker && npm install && npm test
import assert from 'node:assert/strict';
import PostalMime from 'postal-mime';
import { emailHandler } from './src/index.js';
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
  yearInShanghai,
} from './src/lib.js';

const RAW_MAIL = [
  'From: 芹菜P <me@example.com>',
  'To: shuo@serinap.top',
  'Subject: [s3cret] 深夜咖啡速报 [s3cret]',
  'Date: Sat, 05 Sep 2026 14:30:00 +0800',
  'Message-ID: <abc123@example.com>',
  'Authentication-Results: spf=pass dkim=pass',
  'Content-Type: text/plain; charset=utf-8',
  '',
  '今天冲了杯新豆子，柑橘调很惊喜。',
  '',
  '-- ',
  '芹菜P |Sent from my phone',
].join('\r\n');

// ── 解析 ──
const mail = await PostalMime.parse(RAW_MAIL);
assert.equal(mail.from.address, 'me@example.com');
assert.match(mail.headers.find((h) => h.key === 'authentication-results').value, /spf=pass/);

// ── 校验逻辑 ──
assert.equal(isAllowed('Me@Example.com ', ['me@example.com']), true);
assert.equal(isAllowed('stranger@evil.com', ['me@example.com']), false);
assert.deepEqual(parseAllowList(' Me@Example.com,', 'SERINA765P@GMAIL.COM '), [
  'me@example.com',
  'serina765p@gmail.com',
]);

const { subject, ok } = stripToken(mail.subject, '[s3cret]');
assert.equal(ok, true);
assert.equal(subject, '深夜咖啡速报');

assert.equal(stripToken('没有口令的主题', '[s3cret]').ok, false);

// ── 签名剥离 ──
const text = stripSignature(mail.text);
assert.equal(text, '今天冲了杯新豆子，柑橘调很惊喜。');

// ── 签名剥离：手机端 QQ 无 `-- ` 分隔线，尾部「显示名 + 邮箱地址」按发件人身份剥离 ──
const PHONE_MAIL = [
  'From: 芹菜P <serinap@qq.com>',
  'To: shuo@serinap.top',
  'Subject: 寝室楼的洗衣机真的不够用',
  'Date: Sat, 13 Sep 2026 21:27:00 +0800',
  'Message-ID: <phone1@qq.com>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  '我就拿个洗衣粉的15秒功夫就被抢了😅',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '芹菜P',
  'serinap@qq.com',
].join('\r\n');
const phone = await PostalMime.parse(PHONE_MAIL);
assert.equal(phone.from.name, '芹菜P');
assert.equal(
  stripSignature(phone.text, phone.from),
  '我就拿个洗衣粉的15秒功夫就被抢了😅',
  '手机端尾部「显示名 + 邮箱」签名应剥离',
);

const qq = { name: '芹菜P', address: 'serinap@qq.com' };
assert.equal(stripSignature('今天好累\nserinap@qq.com\n芹菜P', qq), '今天好累');
assert.equal(stripSignature('今天好累\n芹菜P', qq), '今天好累\n芹菜P', '只有显示名的落款不动');
assert.equal(
  stripSignature('今天好累\nserinap@qq.com', qq),
  '今天好累\nserinap@qq.com',
  '只有邮箱一行不动',
);
assert.equal(
  stripSignature('今天好累\n\n阿猫\nserinap@qq.com', qq),
  '今天好累',
  '昵称不匹配但块与正文隔空行：按 QQ 形态兜底',
);
assert.equal(stripSignature('芹菜P\nserinap@qq.com', qq), '', '全是签名 → 空正文');

// ── 条目构造 + 合并 + 幂等 ──
const item = buildItem({ id: mail.messageId, subject, content: text, publishedAt: mail.date });
assert.equal(item.type, 'MAIL');
assert.equal(item.title, '深夜咖啡速报');
assert.equal(item.link, '');
assert.deepEqual(item.images, []);
assert.equal(item.published_at, new Date('2026-09-05T06:30:00.000Z').toISOString());

const db = {
  host_mid: '1726354044',
  source: 'https://api.bilibili.com/...',
  fetched_at: '2026-01-01T00:00:00.000Z',
  count: 1,
  items: [
    {
      id: 'legacy',
      type: 'OPUS',
      title: '',
      content: '旧说说',
      images: [],
      link: 'https://b23.tv/x',
      like: 3,
      published_at: '2026-01-01T00:00:00.000Z',
    },
  ],
};
const first = mergeItem(db, item);
assert.equal(first.changed, true);
assert.equal(first.data.items[0].id, mail.messageId);
assert.equal(first.data.items.length, 2);
assert.equal(first.data.count, 2);
assert.equal(first.data.source, 'mail-to-github');

const again = mergeItem(first.data, item);
assert.equal(again.changed, false, '同一 Message-ID 重复投递应跳过');

// ── base64 往返（含中文）──
const roundtrip = `${JSON.stringify(first.data, null, 2)}\n`;
assert.deepEqual(JSON.parse(fromBase64(toBase64(roundtrip))), first.data);

// ── 按年分片（东八区口径，与站内日期展示一致）──
assert.equal(yearInShanghai(new Date('2025-06-01T00:00:00.000Z')), 2025);
assert.equal(
  yearInShanghai(new Date('2025-12-31T16:30:00.000Z')),
  2026,
  'UTC 跨年夜 = 沪元旦凌晨，应归入 2026',
);
assert.equal(
  shardPath('src/data/shuoshuo', '2026-09-05T06:30:00.000Z'),
  'src/data/shuoshuo/2026.json',
);
assert.equal(
  shardPath('src/data/shuoshuo/', new Date('2025-12-31T16:30:00.000Z')),
  'src/data/shuoshuo/2026.json',
  '目录结尾斜杠不应产生双斜杠',
);

// ── 新分片信封 + 在新分片里同样幂等 ──
const shard = createShard(item, new Date('2026-09-07T06:30:00.000Z'));
assert.equal(shard.source, 'mail-to-github');
assert.equal(shard.fetched_at, '2026-09-07T06:30:00.000Z');
assert.equal(shard.count, 1);
assert.deepEqual(shard.items, [item]);
assert.equal(mergeItem(shard, item).changed, false, '同一 Message-ID 在新分片里也应跳过');

// ── handler 安全边界：收件地址必须先匹配 SMTP envelope，拒绝路径不能访问 GitHub ──
const PRIVATE_TO = 'private-inbox-test@example.test';
const handlerEnv = {
  PUBLISH_TO: PRIVATE_TO,
  ALLOWED_SENDERS: 'me@example.com',
  ADDITIONAL_ALLOWED_SENDERS: '',
  GITHUB_REPO: 'owner/repo',
  GITHUB_TOKEN: 'test-token',
};
let githubCalls = 0;
const githubFetch = async (_url, init = {}) => {
  githubCalls++;
  if (init.method === 'PUT') return new Response('{}', { status: 201 });
  return new Response('{}', { status: 404 });
};
function mockMessage({ to, from = 'me@example.com', raw = RAW_MAIL } = {}) {
  const result = { rejected: null, deferred: false };
  return {
    result,
    to,
    from,
    raw,
    setReject(reason) {
      result.rejected = reason;
    },
    defer() {
      result.deferred = true;
    },
  };
}

const missingConfig = mockMessage({ to: PRIVATE_TO, raw: null });
const missingPublishToEnv = { ...handlerEnv };
delete missingPublishToEnv.PUBLISH_TO;
await emailHandler(missingConfig, missingPublishToEnv, githubFetch);
assert.equal(missingConfig.result.rejected, '发布收件地址未配置');
assert.equal(githubCalls, 0);

for (const recipient of ['shuo@serinap.top', 'another-private@example.test']) {
  const mismatch = mockMessage({ to: recipient, raw: null });
  await emailHandler(mismatch, handlerEnv, githubFetch);
  assert.equal(mismatch.result.rejected, '收件地址不匹配');
  assert.equal(githubCalls, 0, `${recipient} must not reach GitHub`);
}

const forgedMimeTo = mockMessage({
  to: 'shuo@serinap.top',
  raw: RAW_MAIL.replace('To: shuo@serinap.top', `To: ${PRIVATE_TO}`),
});
await emailHandler(forgedMimeTo, handlerEnv, githubFetch);
assert.equal(forgedMimeTo.result.rejected, '收件地址不匹配');
assert.equal(githubCalls, 0, 'a forged MIME To must not override the SMTP envelope recipient');

const unknownSender = mockMessage({ to: PRIVATE_TO, from: 'stranger@evil.test' });
await emailHandler(unknownSender, handlerEnv, githubFetch);
assert.equal(unknownSender.result.rejected, '发件人不在白名单');
assert.equal(githubCalls, 0);

// SMTP 收件人匹配才控制发布；伪造 MIME To 和 Authentication-Results 不提供认证。
const mimeToSpoof = mockMessage({ to: ` ${PRIVATE_TO.toUpperCase()} ` });
await emailHandler(mimeToSpoof, handlerEnv, githubFetch);
assert.equal(mimeToSpoof.result.rejected, null);
assert.equal(
  githubCalls,
  2,
  'accepted message should GET and PUT through the injected GitHub stub',
);

const gmailMail = RAW_MAIL.replace(
  'From: 芹菜P <me@example.com>',
  'From: Serina <serina765p@gmail.com>',
).replace(
  'Authentication-Results: spf=pass dkim=pass',
  'Authentication-Results: spf=fail dkim=fail',
);
const gmailAllowed = mockMessage({
  to: PRIVATE_TO,
  from: ' SERINA765P@GMAIL.COM ',
  raw: gmailMail,
});
const githubCallsBeforeGmail = githubCalls;
await emailHandler(
  gmailAllowed,
  { ...handlerEnv, ADDITIONAL_ALLOWED_SENDERS: ' serina765p@gmail.com ' },
  githubFetch,
);
assert.equal(gmailAllowed.result.rejected, null);
assert.equal(githubCalls - githubCallsBeforeGmail, 2, 'additional Gmail sender should be accepted');

console.log(
  '✅ 全部断言通过：解析/白名单/口令/签名（-- 线 + 手机端尾部块）/幂等/分片路径/base64 往返均符合预期',
);
