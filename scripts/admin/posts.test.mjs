import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCleanups, createTempRoot, startApi } from './test-helpers.mjs';

const ALPHA = `---
# 文章顶部注释
title: 旧标题
date: 2026-10-08
tags:
  - 标签甲
  - 标签乙
categories:
  - 技术分享
description: 旧描述
cover: cover.avif
pinned: false
toc: true
customField:
  nested: true
  list: [a, b]
---

正文第一行
![图](alpha/cover.avif)
`;

const BETA = `---
title: Beta
date: 2026-10-09T20:55:00+08:00
tags: [旧标签]
categories: [资源分享]
skin: imas-album
---

Beta 正文
`.replaceAll('\n', '\r\n');

const GAMMA = `---
title: Gamma
date: 2025-12-05T15:11:29+08:00
toc: false
---

Gamma 正文
`;

const POSTS = {
  'alpha.md': ALPHA,
  'beta.mdx': BETA,
  'gamma.md': GAMMA,
  'notes.txt': '不是文章',
  'nested/ignored.md': '---\ntitle: 嵌套\n---\n',
};

const cleanups = createCleanups();

afterEach(async () => {
  await cleanups.run();
});

async function createWorkspace(posts = POSTS) {
  const root = await createTempRoot(cleanups, 'serina-posts-');
  const postsDir = path.join(root, 'src', 'content', 'posts');
  await mkdir(postsDir, { recursive: true });
  for (const [relative, content] of Object.entries(posts)) {
    const file = path.join(postsDir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  await mkdir(path.join(postsDir, 'alpha'), { recursive: true });
  await writeFile(path.join(postsDir, 'alpha', 'cover.avif'), 'fake-image');
  return { root, postsDir };
}

async function readPost(postsDir, slug) {
  return readFile(path.join(postsDir, `${slug}.md`), 'utf8');
}

describe('GET /api/posts', () => {
  it('列出顶层文章并按发布日期倒序，附带资产目录状态', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/posts');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.posts.map((post) => post.slug)).toEqual(['beta', 'alpha', 'gamma']);
    expect(body.posts[0]).toMatchObject({
      slug: 'beta',
      format: 'mdx',
      title: 'Beta',
      date: '2026-10-09T20:55:00+08:00',
      tags: ['旧标签'],
      categories: ['资源分享'],
      skin: 'imas-album',
      pinned: false,
      toc: true,
      hasAssets: false,
    });
    expect(body.posts[1]).toMatchObject({
      slug: 'alpha',
      format: 'md',
      title: '旧标题',
      categories: ['技术分享'],
      hasAssets: true,
      description: '旧描述',
      cover: 'cover.avif',
    });
  });

  it('frontmatter 损坏的文章仍出现在列表中并带上错误信息', async () => {
    const { root } = await createWorkspace({
      'broken.md': '---\ntitle: [未闭合\n---\n\n正文\n',
      'ok.md': '---\ntitle: 正常\ndate: 2026-01-01\n---\n\n正文\n',
    });
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/posts');
    const body = await response.json();

    expect(response.status).toBe(200);
    const broken = body.posts.find((post) => post.slug === 'broken');
    expect(broken.error).toContain('frontmatter');
    expect(body.posts.find((post) => post.slug === 'ok').title).toBe('正常');
  });
});

describe('GET /api/posts/:slug', () => {
  it('返回完整 frontmatter、换行风格与资产目录状态', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/posts/alpha');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      slug: 'alpha',
      format: 'md',
      lineEnding: 'lf',
      hasAssets: true,
    });
    expect(body.frontmatter).toMatchObject({
      title: '旧标题',
      date: '2026-10-08',
      tags: ['标签甲', '标签乙'],
      categories: ['技术分享'],
      customField: { nested: true, list: ['a', 'b'] },
    });
  });

  it('CRLF 文件报告 crlf 换行风格', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const body = await (await api.request('/api/posts/beta')).json();

    expect(body.lineEnding).toBe('crlf');
  });

  it('返回正文内容，并把 CRLF 归一成 LF 供编辑器使用', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const alpha = await (await api.request('/api/posts/alpha')).json();
    const beta = await (await api.request('/api/posts/beta')).json();

    expect(alpha.content).toBe('\n正文第一行\n![图](alpha/cover.avif)\n');
    expect(beta.content).toBe('\nBeta 正文\n');
    expect(beta.content).not.toContain('\r');
  });

  it('不存在的 slug 返回 404', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/posts/missing');

    expect(response.status).toBe(404);
  });
});

describe('POST /api/posts', () => {
  it('按 schema 字段新建 Markdown 文章', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.send('POST', '/api/posts', {
      slug: 'new-post',
      frontmatter: {
        title: '新文章',
        date: '2026-10-30',
        tags: ['新标签'],
        categories: ['技术分享'],
        pinned: true,
        toc: false,
      },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      slug: 'new-post',
      format: 'md',
      lineEnding: 'lf',
      hasAssets: false,
      frontmatter: {
        title: '新文章',
        date: '2026-10-30',
        tags: ['新标签'],
        categories: ['技术分享'],
        pinned: true,
        toc: false,
      },
    });
    const file = await readPost(postsDir, 'new-post');
    expect(file.startsWith('---\n')).toBe(true);
    expect(file.endsWith('---\n')).toBe(true);
    expect((await readdir(postsDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it.each([
    ['大写字母', 'Hello'],
    ['中文', '中文slug'],
    ['连续连字符', 'a--b'],
    ['首尾连字符', '-a-'],
    ['路径分隔符', 'a/b'],
    ['空格', 'a b'],
    ['点号', '..'],
    ['空字符串', ''],
  ])('拒绝非 ASCII slug：%s，且不落盘', async (_label, slug) => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.send('POST', '/api/posts', {
      slug,
      frontmatter: { title: '标题', date: '2026-10-30' },
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('slug');
    expect(await readdir(postsDir)).not.toContain(`${slug}.md`);
  });

  it('slug 与已有文章冲突时返回 409 且不覆盖原文件', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.send('POST', '/api/posts', {
      slug: 'alpha',
      frontmatter: { title: '覆盖', date: '2026-10-30' },
    });

    expect(response.status).toBe(409);
    expect(await readPost(postsDir, 'alpha')).toBe(ALPHA);
  });

  it('slug 与已有的 .mdx 冲突时同样返回 409', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.send('POST', '/api/posts', {
      slug: 'beta',
      frontmatter: { title: '覆盖', date: '2026-10-30' },
    });

    expect(response.status).toBe(409);
    expect(await readFile(path.join(postsDir, 'beta.mdx'), 'utf8')).toBe(BETA);
  });

  it('拒绝缺少标题或发布时间的 frontmatter', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const missingTitle = await api.send('POST', '/api/posts', {
      slug: 'no-title',
      frontmatter: { date: '2026-10-30' },
    });
    const missingDate = await api.send('POST', '/api/posts', {
      slug: 'no-date',
      frontmatter: { title: '标题' },
    });

    expect([missingTitle.status, missingDate.status]).toEqual([400, 400]);
  });
});

describe('PUT /api/posts/:slug', () => {
  it('更新已知字段时保留未知字段、注释与正文原文', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/alpha', {
      frontmatter: {
        title: '新标题',
        date: '2026-10-10',
        tags: ['标签甲', '新标签', '新标签'],
        pinned: true,
        skin: 'imas-album',
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.frontmatter).toMatchObject({
      title: '新标题',
      date: '2026-10-10',
      tags: ['标签甲', '新标签'],
      pinned: true,
      skin: 'imas-album',
      customField: { nested: true, list: ['a', 'b'] },
    });
    const disk = await readPost(postsDir, 'alpha');
    expect(disk).toContain('# 文章顶部注释');
    expect(disk).toContain('customField:');
    expect(disk).toContain('nested: true');
    expect(disk).toContain('tags:\n  - 标签甲');
    expect(disk).toContain('正文第一行\n![图](alpha/cover.avif)\n');
    expect(disk).not.toContain('\r\n');
    expect((await readdir(postsDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('保留无缩进块序列与紧凑 flow 集合风格', async () => {
    const { root, postsDir } = await createWorkspace({
      'delta.md': `---
title: Delta
date: 2026-01-01
tags:
- 甲
- 乙
custom:
  list: [a, b]
---

Delta 正文
`,
    });
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/delta', {
      frontmatter: { title: 'Delta 新标题' },
    });

    expect(response.status).toBe(200);
    const disk = await readPost(postsDir, 'delta');
    expect(disk).toContain('tags:\n- 甲\n- 乙');
    expect(disk).toContain('list: [a, b]');
    expect(disk).toContain('Delta 正文\n');
  });

  it('CRLF 文章保存后仍全部使用 CRLF，正文逐字节不变', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);
    const original = await readFile(path.join(postsDir, 'beta.mdx'), 'utf8');
    const originalBody = original.slice(original.indexOf('\r\n---\r\n') + 5);

    const response = await api.put('/api/posts/beta', {
      frontmatter: { title: 'Beta 新标题', description: '新摘要' },
    });

    expect(response.status).toBe(200);
    const disk = await readFile(path.join(postsDir, 'beta.mdx'), 'utf8');
    expect(disk.replaceAll('\r\n', '')).not.toContain('\n');
    expect(disk.slice(disk.indexOf('\r\n---\r\n') + 5)).toBe(originalBody);
    expect(disk).toContain('title: Beta 新标题');
    expect((await response.json()).lineEnding).toBe('crlf');
  });

  it('补丁里的未知字段整单拒绝，磁盘保持原样', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/alpha', {
      frontmatter: { description: null, cover: null, tokens: null },
    });

    expect(response.status).toBe(400);
    expect(await readPost(postsDir, 'alpha')).toBe(ALPHA);
  });

  it('只清空可选字段时按 null 删除对应键', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/alpha', {
      frontmatter: { description: null, cover: '', updated: null, skin: null },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.hasOwn(body.frontmatter, 'description')).toBe(false);
    expect(Object.hasOwn(body.frontmatter, 'cover')).toBe(false);
    expect(Object.hasOwn(body.frontmatter, 'updated')).toBe(false);
    expect(Object.hasOwn(body.frontmatter, 'skin')).toBe(false);
    expect(body.frontmatter.customField).toEqual({ nested: true, list: ['a', 'b'] });
    const disk = await readPost(postsDir, 'alpha');
    expect(disk).not.toContain('description:');
    expect(disk).not.toContain('cover:');
  });

  it.each([
    ['标题为空', { title: '  ' }],
    ['标题被删除', { title: null }],
    ['发布时间无效', { date: '昨天' }],
    ['发布时间缺少时区', { date: '2026-10-08T20:00' }],
    ['更新时间缺少时区', { updated: '2026-10-09T20:20:44' }],
    ['发布时间被删除', { date: null }],
    ['更新时间无效', { updated: '2026-13-45' }],
    ['标签不是数组', { tags: '标签' }],
    ['标签包含空项', { tags: [''] }],
    ['置顶不是布尔值', { pinned: 'yes' }],
    ['目录不是布尔值', { toc: 1 }],
    ['未知 skin', { skin: 'unknown' }],
    ['封面是绝对路径', { cover: '/etc/passwd' }],
    ['封面越出文章目录', { cover: '../cover.avif' }],
    ['注入未知字段', { injected: 'x' }],
  ])('拒绝无效 frontmatter：%s，磁盘保持原样', async (_label, frontmatter) => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/alpha', { frontmatter });

    expect(response.status).toBe(400);
    expect(await readPost(postsDir, 'alpha')).toBe(ALPHA);
  });

  it('空补丁返回 400；不存在或非法 slug 返回 404 / 400', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const empty = await api.put('/api/posts/alpha', { frontmatter: {} });
    const missing = await api.put('/api/posts/missing', {
      frontmatter: { title: '标题' },
    });
    const invalid = await api.put('/api/posts/Bad_Slug', {
      frontmatter: { title: '标题' },
    });

    expect([empty.status, missing.status, invalid.status]).toEqual([400, 404, 400]);
  });
});

describe('PUT /api/posts/:slug content', () => {
  it('只更新正文时保留 frontmatter 原文、注释与未知字段', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);
    const nextContent = '\n改写的正文\n\n第二段\n';

    const response = await api.put('/api/posts/alpha', { content: nextContent });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content).toBe(nextContent);
    expect(body.frontmatter).toMatchObject({
      title: '旧标题',
      customField: { nested: true, list: ['a', 'b'] },
    });
    const disk = await readPost(postsDir, 'alpha');
    expect(disk).toContain('# 文章顶部注释');
    expect(disk).toContain('customField:');
    expect(disk.endsWith(nextContent)).toBe(true);
    expect((await readdir(postsDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('frontmatter 与正文可以在同一次请求里一起保存', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/alpha', {
      frontmatter: { title: '新标题', tags: ['新标签'] },
      content: '# 新正文\n',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.frontmatter.title).toBe('新标题');
    expect(body.frontmatter.customField).toEqual({ nested: true, list: ['a', 'b'] });
    const disk = await readPost(postsDir, 'alpha');
    expect(disk).toContain('title: 新标题');
    expect(disk.endsWith('# 新正文\n')).toBe(true);
  });

  it('CRLF 文章写入正文时统一转换为 CRLF', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/beta', {
      content: '\n第一段\n\n第二段\n',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lineEnding).toBe('crlf');
    expect(body.content).toBe('\n第一段\n\n第二段\n');
    const disk = await readFile(path.join(postsDir, 'beta.mdx'), 'utf8');
    expect(disk.replaceAll('\r\n', '')).not.toContain('\n');
    expect(disk.endsWith('\r\n第一段\r\n\r\n第二段\r\n')).toBe(true);
    expect(disk).toContain('title: Beta');
  });

  it('允许用空正文清空文章内容', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/gamma', { content: '' });

    expect(response.status).toBe(200);
    expect((await response.json()).content).toBe('');
    expect(await readPost(postsDir, 'gamma')).toBe(
      '---\ntitle: Gamma\ndate: 2025-12-05T15:11:29+08:00\ntoc: false\n---\n',
    );
  });

  it.each([
    ['正文不是字符串', { content: ['# 标题'] }],
    ['正文为 null', { content: null }],
    ['未知字段', { body: '正文' }],
    ['空请求体', {}],
  ])('拒绝无效请求：%s，磁盘保持原样', async (_label, payload) => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/posts/alpha', payload);

    expect(response.status).toBe(400);
    expect(await readPost(postsDir, 'alpha')).toBe(ALPHA);
  });
});

describe('DELETE /api/posts/:slug', () => {
  it('默认只删文章文件，保留资源目录', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.del('/api/posts/alpha');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      slug: 'alpha',
      removed: true,
      assetsRemoved: false,
    });
    expect(await readdir(postsDir)).not.toContain('alpha.md');
    expect(await readdir(path.join(postsDir, 'alpha'))).toEqual(['cover.avif']);
  });

  it('removeAssets=1 时同时清理随文图片目录', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.del('/api/posts/alpha?removeAssets=1');

    expect(response.status).toBe(200);
    expect((await response.json()).assetsRemoved).toBe(true);
    expect(await readdir(postsDir)).not.toContain('alpha.md');
    expect(await readdir(postsDir)).not.toContain('alpha');
  });

  it('不存在的文章返回 404', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.del('/api/posts/missing');

    expect(response.status).toBe(404);
  });
});

describe('POST /api/posts/:slug/images', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  it('把图片写入文章目录并返回 Markdown 相对路径', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.upload('/api/posts/alpha/images', {
      file: PNG,
      type: 'image/png',
      name: 'shot.png',
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      slug: 'alpha',
      file: 'shot.png',
      relativePath: 'alpha/shot.png',
      markdown: '![](alpha/shot.png)',
      size: PNG.length,
    });
    expect(await readFile(path.join(postsDir, 'alpha', 'shot.png'))).toEqual(PNG);
    expect(
      (await readdir(path.join(postsDir, 'alpha'))).filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
  });

  it('重名文件自动追加序号，不覆盖已有图片', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const first = await api.upload('/api/posts/alpha/images', {
      file: PNG,
      type: 'image/png',
      name: 'shot.png',
    });
    const second = await api.upload('/api/posts/alpha/images', {
      file: Buffer.concat([PNG, Buffer.from('2')]),
      type: 'image/png',
      name: 'shot.png',
    });

    expect((await first.json()).file).toBe('shot.png');
    expect((await second.json()).file).toBe('shot-1.png');
    expect(await readFile(path.join(postsDir, 'alpha', 'shot.png'))).toEqual(PNG);
  });

  it('清洗文件名中的路径与控制字符，并统一扩展名', async () => {
    const { root, postsDir } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.upload('/api/posts/beta/images', {
      file: PNG,
      type: 'image/png',
      name: '../../截图 2026.JPG',
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.file).toBe('image-2026.png');
    expect(body.relativePath).toBe('beta/image-2026.png');
    expect(await readFile(path.join(postsDir, 'beta', body.file))).toEqual(PNG);
    await expect(readFile(path.join(postsDir, '..', '..', '截图 2026.png'))).rejects.toThrow();
  });

  it('拒绝非图片类型与空表单', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const text = await api.upload('/api/posts/alpha/images', {
      file: Buffer.from('<svg></svg>'),
      type: 'image/svg+xml',
      name: 'icon.svg',
    });
    const empty = await api.upload('/api/posts/alpha/images', {
      file: Buffer.alloc(0),
      type: 'image/png',
      name: '',
    });
    const emptyNamed = await api.upload('/api/posts/alpha/images', {
      file: Buffer.alloc(0),
      type: 'image/png',
      name: 'empty.png',
    });

    expect(text.status).toBe(415);
    expect((await text.json()).error).toContain('图片');
    expect(empty.status).toBe(400);
    expect(emptyNamed.status).toBe(400);
  });

  it('文章不存在时返回 404，非 multipart 返回 415', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const missing = await api.upload('/api/posts/missing/images', {
      file: PNG,
      type: 'image/png',
      name: 'shot.png',
    });
    const wrongType = await api.send('POST', '/api/posts/alpha/images', {
      file: PNG.toString('base64'),
    });

    expect(missing.status).toBe(404);
    expect(wrongType.status).toBe(415);
  });

  it('超过体积上限返回 413', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.upload('/api/posts/alpha/images', {
      file: Buffer.alloc(21 * 1024 * 1024, 1),
      type: 'image/png',
      name: 'huge.png',
    });

    expect(response.status).toBe(413);
  });
});

describe('GET /api/posts/:slug/images/:name', () => {
  it('回读文章目录内的图片，供编辑器预览', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/posts/alpha/images/cover.avif');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/avif');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('fake-image');
  });

  it('文章或图片不存在时返回 404', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const missingPost = await api.request('/api/posts/missing/images/cover.avif');
    const missingImage = await api.request('/api/posts/alpha/images/nope.avif');

    expect([missingPost.status, missingImage.status]).toEqual([404, 404]);
  });

  it('拒绝目录穿越与不受支持的文件名', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const traversal = await api.request('/api/posts/alpha/images/..%2Falpha%2Fcover.avif');
    const nested = await api.request('/api/posts/alpha/images/%2E%2E%2Fcover.avif');
    const script = await api.request('/api/posts/alpha/images/cover.svg');

    expect([traversal.status, nested.status, script.status]).toEqual([404, 404, 404]);
  });

  it('只接受 GET', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.send('PUT', '/api/posts/alpha/images', {});

    expect(response.status).toBe(405);
  });
});
