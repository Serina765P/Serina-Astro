// 本地桩测试：不依赖 Cloudflare，直接验证 邮件解析 → 条目构造 → 合并 的完整逻辑。
// 用法：cd worker && npm install && npm test
import assert from 'node:assert/strict';
import PostalMime from 'postal-mime';
import {
  authFailed,
  buildItem,
  createShard,
  fromBase64,
  isAllowed,
  mergeItem,
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
assert.equal(authFailed('spf=fail (sender IP is ...)'), true);
assert.equal(authFailed('spf=pass dkim=pass'), false);

const { subject, ok } = stripToken(mail.subject, '[s3cret]');
assert.equal(ok, true);
assert.equal(subject, '深夜咖啡速报');

assert.equal(stripToken('没有口令的主题', '[s3cret]').ok, false);

// ── 签名剥离 ──
const text = stripSignature(mail.text);
assert.equal(text, '今天冲了杯新豆子，柑橘调很惊喜。');

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

console.log('✅ 全部断言通过：解析/白名单/口令/签名/幂等/分片路径/base64 往返均符合预期');
