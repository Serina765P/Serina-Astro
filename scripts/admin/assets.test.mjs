import { mkdir, writeFile } from 'node:fs/promises';
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
  await mkdir(path.join(root, 'src', 'data'), { recursive: true });
  await writeFile(path.join(root, 'src', 'data', 'emoji.json'), JSON.stringify(EMOJI));
  await writeFile(path.join(root, 'src', 'data', 'stickers.json'), JSON.stringify(STICKERS));
  await mkdir(path.join(root, 'public', 'emoji'), { recursive: true });
  await mkdir(path.join(root, 'public', 'sticker'), { recursive: true });
  await writeFile(path.join(root, 'public', 'emoji', '765pro_wink.webp'), 'emoji-bytes');
  await writeFile(path.join(root, 'public', 'sticker', 'ml_加油.webp'), 'sticker-bytes');
  await writeFile(path.join(root, 'public', 'sticker', 'ml_加油-still.webp'), 'poster-bytes');
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
