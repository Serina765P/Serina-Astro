import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createShuoshuo, deleteShuoshuo, listShuoshuo, updateShuoshuo } from './lib/shuoshuo.mjs';
import { createCleanups, createTempRoot, startApi } from './test-helpers.mjs';

const NOW = new Date('2026-03-05T09:00:00+08:00');
const MAIL_ID = 'CAO+PAtsKfC4vpDMtwkaUUqmSUCMrWk==9GJ=VSL09sdShEA0sg@mail.gmail.com';

const cleanups = createCleanups();

afterEach(async () => {
  await cleanups.run();
});

function shuoshuoItem(overrides = {}) {
  return {
    id: 'mail-1',
    title: '标题',
    type: 'MAIL',
    content: '正文',
    images: [],
    link: '',
    like: 0,
    published_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function envelope(items) {
  return {
    source: 'mail-to-github',
    fetched_at: '2025-12-31T16:00:00.000Z',
    count: items.length,
    items,
  };
}

async function createRoot() {
  return createTempRoot(cleanups, 'serina-shuoshuo-');
}

async function createWorkspace(shards = {}) {
  const root = await createRoot();
  const dir = path.join(root, 'src', 'data', 'shuoshuo');
  await mkdir(dir, { recursive: true });
  for (const [year, items] of Object.entries(shards)) {
    await writeFile(
      path.join(dir, `${year}.json`),
      `${JSON.stringify(envelope(items), null, 2)}\n`,
    );
  }
  return { root, dir };
}

async function readShard(dir, year) {
  return JSON.parse(await readFile(path.join(dir, `${year}.json`), 'utf8'));
}

async function listFiles(dir) {
  return (await readdir(dir)).sort();
}

describe('listShuoshuo', () => {
  it('聚合全部年度分片并按发布时间倒序返回', async () => {
    const { root } = await createWorkspace({
      2025: [
        shuoshuoItem({ id: 'june', published_at: '2025-06-01T10:00:00+08:00' }),
        shuoshuoItem({ id: 'december', published_at: '2025-12-31T23:00:00+08:00' }),
      ],
      2026: [shuoshuoItem({ id: 'february', published_at: '2026-02-01T09:00:00+08:00' })],
    });

    const result = await listShuoshuo(root);

    expect(result.count).toBe(3);
    expect(result.items.map((item) => item.id)).toEqual(['february', 'december', 'june']);
  });
});

describe('createShuoshuo', () => {
  it('生成 local_ ID、MAIL 类型并置顶当前东八区分片', async () => {
    const { root, dir } = await createWorkspace({
      2026: [shuoshuoItem({ id: 'older' })],
    });

    const result = await createShuoshuo(
      root,
      { title: ' 本地发布 ', content: ' 第一条本地说说 ' },
      NOW,
    );

    expect(result.year).toBe(2026);
    expect(result.item).toMatchObject({
      id: `local_${NOW.getTime()}`,
      title: '本地发布',
      type: 'MAIL',
      content: '第一条本地说说',
      images: [],
      link: '',
      like: 0,
      published_at: NOW.toISOString(),
    });

    const shard = await readShard(dir, 2026);
    expect(Object.keys(shard)).toEqual(['source', 'fetched_at', 'count', 'items']);
    expect(shard.source).toBe('mail-to-github');
    expect(shard.fetched_at).toBe(NOW.toISOString());
    expect(shard.count).toBe(2);
    expect(shard.items.map((item) => item.id)).toEqual([`local_${NOW.getTime()}`, 'older']);
  });

  it('没有分片目录时按东八区年份创建新分片', async () => {
    const root = await createRoot();
    const now = new Date('2025-12-31T16:30:00Z');

    const result = await createShuoshuo(root, { content: '跨年发布' }, now);

    expect(result.year).toBe(2026);
    const shard = await readShard(path.join(root, 'src', 'data', 'shuoshuo'), 2026);
    expect(shard.source).toBe('mail-to-github');
    expect(shard.count).toBe(1);
    expect(shard.items[0].published_at).toBe(now.toISOString());
  });

  it('相同毫秒内连续发布仍生成唯一 ID', async () => {
    const { root, dir } = await createWorkspace();

    const first = await createShuoshuo(root, { content: 'A' }, NOW);
    const second = await createShuoshuo(root, { content: 'B' }, NOW);

    expect(second.item.id).not.toBe(first.item.id);
    const shard = await readShard(dir, 2026);
    expect(shard.count).toBe(2);
  });
});

describe('updateShuoshuo', () => {
  it('同分片编辑保留 images/like 等字段并重新排序', async () => {
    const { root, dir } = await createWorkspace({
      2026: [
        shuoshuoItem({
          id: 'older',
          images: [{ url: '/a.png', width: 10, height: 20 }],
          like: 3,
        }),
        shuoshuoItem({ id: 'newer', published_at: '2026-02-01T00:00:00+08:00' }),
      ],
    });

    const result = await updateShuoshuo(
      root,
      'older',
      {
        title: '改标题',
        content: '改内容',
        published_at: '2026-03-01T00:00:00+08:00',
      },
      NOW,
    );

    expect(result).toMatchObject({ year: 2026, fromYear: null });
    expect(result.item).toMatchObject({
      title: '改标题',
      content: '改内容',
      images: [{ url: '/a.png', width: 10, height: 20 }],
      like: 3,
      type: 'MAIL',
    });

    const shard = await readShard(dir, 2026);
    expect(shard.items.map((item) => item.id)).toEqual(['older', 'newer']);
    expect(shard.count).toBe(2);
    expect(shard.fetched_at).toBe(NOW.toISOString());
  });

  it('发布时间跨年时迁移条目并同步两个分片的计数与顺序', async () => {
    const { root, dir } = await createWorkspace({
      2025: [
        shuoshuoItem({ id: 'move', published_at: '2025-12-31T23:00:00+08:00' }),
        shuoshuoItem({ id: 'stay', published_at: '2025-06-01T00:00:00+08:00' }),
      ],
      2026: [
        shuoshuoItem({ id: 'february', published_at: '2026-02-01T00:00:00+08:00' }),
        shuoshuoItem({ id: 'january', published_at: '2026-01-05T00:00:00+08:00' }),
      ],
    });

    const result = await updateShuoshuo(
      root,
      'move',
      { published_at: '2026-01-01T00:30:00+08:00' },
      NOW,
    );

    expect(result).toMatchObject({ year: 2026, fromYear: 2025 });
    expect(result.item.published_at).toBe('2025-12-31T16:30:00.000Z');

    const oldShard = await readShard(dir, 2025);
    expect(oldShard.count).toBe(1);
    expect(oldShard.items.map((item) => item.id)).toEqual(['stay']);
    expect(oldShard.fetched_at).toBe(NOW.toISOString());

    const newShard = await readShard(dir, 2026);
    expect(newShard.count).toBe(3);
    expect(newShard.items.map((item) => item.id)).toEqual(['february', 'january', 'move']);
    expect(newShard.fetched_at).toBe(NOW.toISOString());

    const aggregated = await listShuoshuo(root);
    expect(aggregated.items.map((item) => item.id)).toEqual([
      'february',
      'january',
      'move',
      'stay',
    ]);
  });

  it('目标年份分片不存在时创建符合信封格式的新分片', async () => {
    const { root } = await createWorkspace({
      2025: [shuoshuoItem({ id: 'move', published_at: '2025-12-31T23:00:00+08:00' })],
    });

    await updateShuoshuo(root, 'move', { published_at: '2026-01-01T00:30:00+08:00' }, NOW);

    const dir = path.join(root, 'src', 'data', 'shuoshuo');
    const newShard = await readShard(dir, 2026);
    expect(Object.keys(newShard)).toEqual(['source', 'fetched_at', 'count', 'items']);
    expect(newShard.count).toBe(1);
    expect(newShard.items[0].id).toBe('move');
    expect(await listFiles(dir)).toEqual(['2025.json', '2026.json']);
  });
});

describe('deleteShuoshuo', () => {
  it('删除条目后重算所属分片 count', async () => {
    const { root, dir } = await createWorkspace({
      2026: [
        shuoshuoItem({ id: 'first', published_at: '2026-02-01T00:00:00+08:00' }),
        shuoshuoItem({ id: 'second', published_at: '2026-01-01T00:00:00+08:00' }),
      ],
    });

    const result = await deleteShuoshuo(root, 'first', NOW);

    expect(result).toEqual({ id: 'first', years: [2026] });
    const shard = await readShard(dir, 2026);
    expect(shard.items.map((item) => item.id)).toEqual(['second']);
    expect(shard.count).toBe(1);
    expect(shard.fetched_at).toBe(NOW.toISOString());
  });

  it('删除最后一条后分片保留 count 0，临时文件不残留', async () => {
    const { root, dir } = await createWorkspace({ 2026: [shuoshuoItem({ id: 'only' })] });

    await deleteShuoshuo(root, 'only', NOW);

    const shard = await readShard(dir, 2026);
    expect(shard.count).toBe(0);
    expect(shard.items).toEqual([]);
    expect(await listFiles(dir)).toEqual(['2026.json']);
  });
});

describe('HTTP /api/shuoshuo', () => {
  it('GET 返回聚合后的说说列表', async () => {
    const { root } = await createWorkspace({
      2025: [shuoshuoItem({ id: 'old', published_at: '2025-06-01T00:00:00+08:00' })],
      2026: [shuoshuoItem({ id: 'new', published_at: '2026-02-01T00:00:00+08:00' })],
    });
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/shuoshuo');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.count).toBe(2);
    expect(body.items.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('POST 发布新说说并以 201 返回条目与分片年份', async () => {
    const { root, dir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.send('POST', '/api/shuoshuo', {
      title: '新说说',
      content: '来自本地后台',
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    const year = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
      }).format(new Date(body.item.published_at)),
    );
    expect(body.year).toBe(year);
    expect(body.item).toMatchObject({ type: 'MAIL', title: '新说说', content: '来自本地后台' });
    expect(body.item.id).toMatch(/^local_\d+$/u);
    const shard = await readShard(dir, year);
    expect(shard.items[0].id).toBe(body.item.id);
    expect(shard.count).toBe(1);
  });

  it('PUT 接受含 +、=、@ 的 URL 编码 ID 并完成跨年迁移', async () => {
    const { root, dir } = await createWorkspace({
      2025: [shuoshuoItem({ id: MAIL_ID, published_at: '2025-12-31T23:00:00+08:00' })],
    });
    const api = await startApi(root, cleanups);

    const response = await api.send('PUT', `/api/shuoshuo/${encodeURIComponent(MAIL_ID)}`, {
      content: '跨年改期',
      published_at: '2026-01-01T00:30:00+08:00',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ year: 2026, fromYear: 2025 });
    expect(body.item).toMatchObject({ id: MAIL_ID, content: '跨年改期' });
    expect((await readShard(dir, 2025)).count).toBe(0);
    expect((await readShard(dir, 2026)).count).toBe(1);
  });

  it('DELETE 删除条目并返回涉及的分片年份', async () => {
    const { root, dir } = await createWorkspace({ 2026: [shuoshuoItem({ id: 'gone' })] });
    const api = await startApi(root, cleanups);

    const response = await api.send('DELETE', `/api/shuoshuo/${encodeURIComponent('gone')}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'gone', years: [2026] });
    expect((await readShard(dir, 2026)).count).toBe(0);
  });

  it('并发发布不会互相覆盖', async () => {
    const { root, dir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const responses = await Promise.all([
      api.send('POST', '/api/shuoshuo', { content: '并发 A' }),
      api.send('POST', '/api/shuoshuo', { content: '并发 B' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(new Set(bodies.map((body) => body.item.id)).size).toBe(2);
    const shard = await readShard(
      dir,
      Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
        }).format(new Date(bodies[0].item.published_at)),
      ),
    );
    expect(shard.count).toBe(2);
  });

  const invalidPosts = [
    ['内容为空', { content: '   ' }],
    ['内容不是字符串', { content: 42 }],
    ['标题不是字符串', { content: '正文', title: 42 }],
    ['发布时间缺少时区', { content: '正文', published_at: '2026-03-05T09:00:00' }],
    ['发布时间非法', { content: '正文', published_at: '2026-13-40T09:00:00+08:00' }],
    ['包含未知字段', { content: '正文', like: 99 }],
    ['空对象', {}],
  ];

  it.each(invalidPosts)('POST 拒绝无效请求：%s', async (_label, payload) => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.send('POST', '/api/shuoshuo', payload);

    expect(response.status).toBe(400);
    expect(typeof (await response.json()).error).toBe('string');
  });

  const invalidPatches = [
    ['空补丁', {}],
    ['未知字段', { like: 99 }],
    ['内容为空', { content: '  ' }],
    ['发布时间缺少时区', { published_at: '2026-01-01T00:00:00' }],
  ];

  it.each(invalidPatches)('PUT 拒绝无效补丁：%s', async (_label, patch) => {
    const { root, dir } = await createWorkspace({ 2026: [shuoshuoItem({ id: 'target' })] });
    const api = await startApi(root, cleanups);

    const response = await api.send('PUT', '/api/shuoshuo/target', patch);

    expect(response.status).toBe(400);
    expect((await readShard(dir, 2026)).items[0]).toEqual(shuoshuoItem({ id: 'target' }));
  });

  it('未知 ID 的 PUT 与 DELETE 返回 404', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const [put, del] = await Promise.all([
      api.send('PUT', '/api/shuoshuo/missing', { content: '正文' }),
      api.send('DELETE', '/api/shuoshuo/missing'),
    ]);

    expect([put.status, del.status]).toEqual([404, 404]);
  });

  it('请求体不是合法 JSON 时返回 400', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.send('POST', '/api/shuoshuo', '{ not json');

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('JSON');
  });

  it('写请求必须是 application/json', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/shuoshuo', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ content: '正文' }),
    });

    expect(response.status).toBe(415);
  });

  it('不支持的方法返回 405 与 Allow 头', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const [collection, item] = await Promise.all([
      api.send('PUT', '/api/shuoshuo', { content: '正文' }),
      api.send('POST', '/api/shuoshuo/target', { content: '正文' }),
    ]);

    expect(collection.status).toBe(405);
    expect(collection.headers.get('allow')).toBe('GET, POST');
    expect(item.status).toBe(405);
    expect(item.headers.get('allow')).toBe('PUT, DELETE');
  });
});
