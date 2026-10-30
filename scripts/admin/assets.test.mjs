import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCleanups, createTempRoot, startApi } from './test-helpers.mjs';

const EMOJI = [
  {
    code: '765pro_wink',
    label: 'wink',
    set: '765pro',
    setLabel: '765PRO',
    src: '/emoji/765pro_wink.webp',
    width: 162,
    height: 162,
    keywords: ['wink', '765PRO'],
  },
];
const STICKERS = [
  {
    code: 'ml_加油',
    label: '加油',
    set: 'ml',
    setLabel: '偶像大师百万现场',
    src: '/sticker/ml_加油.webp',
    poster: '/sticker/ml_加油-still.webp',
    width: 312,
    height: 300,
    keywords: ['加油', 'ml'],
  },
];

const cleanups = createCleanups();

afterEach(async () => {
  await cleanups.run();
});

async function createWorkspace() {
  const root = await createTempRoot(cleanups, 'serina-assets-');
  await mkdir(path.join(root, 'src', 'data', 'shuoshuo'), { recursive: true });
  await mkdir(path.join(root, 'src', 'content', 'posts'), { recursive: true });
  await writeFile(path.join(root, 'src', 'data', 'emoji.json'), JSON.stringify(EMOJI));
  await writeFile(path.join(root, 'src', 'data', 'stickers.json'), JSON.stringify(STICKERS));
  await mkdir(path.join(root, 'public', 'emoji'), { recursive: true });
  await mkdir(path.join(root, 'public', 'sticker'), { recursive: true });
  await writeFile(path.join(root, 'public', 'emoji', '765pro_wink.webp'), 'emoji-bytes');
  await writeFile(path.join(root, 'public', 'sticker', 'ml_加油.webp'), 'sticker-bytes');
  await writeFile(path.join(root, 'public', 'sticker', 'ml_加油-still.webp'), 'poster-bytes');
  await writeFile(
    path.join(root, 'src', 'content', 'posts', 'sample.md'),
    '---\ntitle: 示例\n---\n这里引用了 :765pro_wink: 表情。\n',
  );
  await writeFile(
    path.join(root, 'src', 'data', 'shuoshuo', '2026.json'),
    JSON.stringify(
      {
        source: 'TEST',
        fetched_at: '2026-10-30T00:00:00Z',
        count: 1,
        items: [{ id: '1', content: '今天也要 :ml_加油: 呀！' }],
      },
      null,
      2,
    ),
  );
  return root;
}
describe('GET /api/assets', () => {
  it('返回表情与贴纸注册表，并给出后台可读取的预览地址', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/assets');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.emoji).toEqual([
      {
        code: '765pro_wink',
        label: 'wink',
        set: '765pro',
        setLabel: '765PRO',
        width: 162,
        height: 162,
        keywords: ['wink', '765PRO'],
        previewUrl: '/api/assets/emoji/765pro_wink.webp',
        posterUrl: '',
      },
    ]);
    expect(body.stickers).toEqual([
      {
        code: 'ml_加油',
        label: '加油',
        set: 'ml',
        setLabel: '偶像大师百万现场',
        width: 312,
        height: 300,
        keywords: ['加油', 'ml'],
        previewUrl: `/api/assets/sticker/${encodeURIComponent('ml_加油.webp')}`,
        posterUrl: `/api/assets/sticker/${encodeURIComponent('ml_加油-still.webp')}`,
      },
    ]);
    expect(body.usage).toBeDefined();
    expect(body.usage['765pro_wink']).toEqual(['src/content/posts/sample.md:4']);
    expect(body.usage.ml_加油).toEqual(
      expect.arrayContaining([expect.stringMatching(/^src\/data\/shuoshuo\/2026\.json:/)]),
    );
  });
  it('注册表缺失或损坏时返回 500', async () => {
    const root = await createTempRoot(cleanups, 'serina-assets-broken-');
    await mkdir(path.join(root, 'src', 'data'), { recursive: true });
    await writeFile(path.join(root, 'src', 'data', 'emoji.json'), '{');
    await writeFile(path.join(root, 'src', 'data', 'stickers.json'), '[]');
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/assets');

    expect(response.status).toBe(500);
  });
});

describe('GET /api/assets/:kind/:file', () => {
  it('按套装目录回读图片与贴纸文件', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    const emoji = await api.request('/api/assets/emoji/765pro_wink.webp');
    const sticker = await api.request(`/api/assets/sticker/${encodeURIComponent('ml_加油.webp')}`);

    expect([emoji.status, sticker.status]).toEqual([200, 200]);
    expect(emoji.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await emoji.arrayBuffer()).toString()).toBe('emoji-bytes');
    expect(Buffer.from(await sticker.arrayBuffer()).toString()).toBe('sticker-bytes');
  });

  it('未知套装、非图片扩展名与目录穿越都返回 404', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    const kind = await api.request('/api/assets/font/765pro_wink.webp');
    const proto = await api.request('/api/assets/__proto__/765pro_wink.webp');
    const extension = await api.request('/api/assets/emoji/emoji.json');
    const traversal = await api.request('/api/assets/emoji/..%2F..%2Fsrc%2Fdata%2Femoji.json');

    expect([kind.status, proto.status, extension.status, traversal.status]).toEqual([
      404, 404, 404, 404,
    ]);
  });
});

describe('PUT /api/assets', () => {
  it('更新显示名与关键词，写回注册表且不重命名文件', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/assets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'emoji',
        items: [
          {
            code: '765pro_wink',
            nextCode: '765pro_wink',
            label: '眨眼',
            keywords: '眨眼, 765PRO, 萌',
          },
        ],
        setLabels: { '765pro': '765艺人事务所' },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.warnings).toEqual([]);
    expect(body.records[0].label).toBe('眨眼');
    expect(body.records[0].setLabel).toBe('765艺人事务所');
    expect(body.records[0].keywords).toEqual(['眨眼', '765艺人事务所', '765pro', '765PRO', '萌']);

    const onDisk = JSON.parse(await readFile(path.join(root, 'src', 'data', 'emoji.json'), 'utf8'));
    expect(onDisk[0].label).toBe('眨眼');
    expect(onDisk[0].setLabel).toBe('765艺人事务所');
    expect(existsSync(path.join(root, 'public', 'emoji', '765pro_wink.webp'))).toBe(true);
  });

  it('两阶段安全重命名短代码与文件，并预警文章中的旧短代码引用', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/assets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'emoji',
        items: [
          {
            code: '765pro_wink',
            nextCode: '765pro_blink',
            label: 'wink',
            keywords: 'wink, 765PRO',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.records[0].code).toBe('765pro_blink');
    expect(body.records[0].previewUrl).toBe('/api/assets/emoji/765pro_blink.webp');
    expect(body.warnings).toEqual([
      ':765pro_wink: → :765pro_blink:，以下位置仍引用旧短代码：src/content/posts/sample.md:4',
    ]);

    // 文件系统断言：旧文件被安全重命名为新文件
    expect(existsSync(path.join(root, 'public', 'emoji', '765pro_wink.webp'))).toBe(false);
    expect(existsSync(path.join(root, 'public', 'emoji', '765pro_blink.webp'))).toBe(true);
    expect(await readFile(path.join(root, 'public', 'emoji', '765pro_blink.webp'), 'utf8')).toBe(
      'emoji-bytes',
    );

    // 注册表断言
    const onDisk = JSON.parse(await readFile(path.join(root, 'src', 'data', 'emoji.json'), 'utf8'));
    expect(onDisk[0].code).toBe('765pro_blink');
    expect(onDisk[0].src).toBe('/emoji/765pro_blink.webp');
  });

  it('贴纸重命名时同时安全重命名动画图与静帧 poster', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/assets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'sticker',
        items: [
          {
            code: 'ml_加油',
            nextCode: 'ml_fighting',
            label: '加油',
            keywords: '加油, ml',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.records[0].code).toBe('ml_fighting');
    expect(body.records[0].previewUrl).toBe('/api/assets/sticker/ml_fighting.webp');
    expect(body.records[0].posterUrl).toBe('/api/assets/sticker/ml_fighting-still.webp');

    expect(existsSync(path.join(root, 'public', 'sticker', 'ml_加油.webp'))).toBe(false);
    expect(existsSync(path.join(root, 'public', 'sticker', 'ml_加油-still.webp'))).toBe(false);
    expect(existsSync(path.join(root, 'public', 'sticker', 'ml_fighting.webp'))).toBe(true);
    expect(existsSync(path.join(root, 'public', 'sticker', 'ml_fighting-still.webp'))).toBe(true);
    expect(await readFile(path.join(root, 'public', 'sticker', 'ml_fighting.webp'), 'utf8')).toBe(
      'sticker-bytes',
    );
    expect(
      await readFile(path.join(root, 'public', 'sticker', 'ml_fighting-still.webp'), 'utf8'),
    ).toBe('poster-bytes');
  });

  it('短代码校验：前缀不匹配、非法字符、重名冲突或目标文件已存在时拦截', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    // 前缀不匹配
    const prefixMismatch = await api.request('/api/assets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'emoji',
        items: [{ code: '765pro_wink', nextCode: 'wrong_wink', label: 'wink' }],
      }),
    });
    expect(prefixMismatch.status).toBe(400);
    expect((await prefixMismatch.json()).error).toContain('765pro_');

    // 非法字符
    const invalidChars = await api.request('/api/assets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'emoji',
        items: [{ code: '765pro_wink', nextCode: '765pro_wink@!', label: 'wink' }],
      }),
    });
    expect(invalidChars.status).toBe(400);

    // 与另一套素材（sticker）跨表重名
    const crossDuplicate = await api.request('/api/assets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'sticker',
        items: [{ code: 'ml_加油', nextCode: '765pro_wink', label: 'wink' }],
      }),
    });
    expect(crossDuplicate.status).toBe(400);

    // 目标文件已存在于磁盘上
    await writeFile(path.join(root, 'public', 'emoji', '765pro_occupied.webp'), 'existing');
    const targetExists = await api.request('/api/assets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'emoji',
        items: [{ code: '765pro_wink', nextCode: '765pro_occupied', label: 'wink' }],
      }),
    });
    expect(targetExists.status).toBe(400);
    expect((await targetExists.json()).error).toContain('目标文件已存在');
  });
});

describe('POST /api/assets/prefix', () => {
  it('批量修改套装短代码前缀并两阶段重命名所有资源文件', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/assets/prefix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'sticker',
        set: 'ml',
        prefix: 'million',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.records[0].code).toBe('million_加油');
    expect(body.records[0].set).toBe('million');
    expect(body.records[0].previewUrl).toBe(
      `/api/assets/sticker/${encodeURIComponent('million_加油.webp')}`,
    );
    expect(body.records[0].posterUrl).toBe(
      `/api/assets/sticker/${encodeURIComponent('million_加油-still.webp')}`,
    );
    expect(body.warnings.length).toBeGreaterThan(0);

    expect(existsSync(path.join(root, 'public', 'sticker', 'ml_加油.webp'))).toBe(false);
    expect(existsSync(path.join(root, 'public', 'sticker', 'million_加油.webp'))).toBe(true);
    expect(existsSync(path.join(root, 'public', 'sticker', 'million_加油-still.webp'))).toBe(true);

    const onDisk = JSON.parse(
      await readFile(path.join(root, 'src', 'data', 'stickers.json'), 'utf8'),
    );
    expect(onDisk[0].code).toBe('million_加油');
    expect(onDisk[0].set).toBe('million');
  });

  it('非法前缀或不存在的套装被拦截', async () => {
    const root = await createWorkspace();
    const api = await startApi(root, cleanups);

    const invalidPrefix = await api.request('/api/assets/prefix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'sticker', set: 'ml', prefix: 'UPPER_CASE!' }),
    });
    expect(invalidPrefix.status).toBe(400);

    const missingSet = await api.request('/api/assets/prefix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'sticker', set: 'nonexistent', prefix: 'newprefix' }),
    });
    expect(missingSet.status).toBe(404);
  });
});
