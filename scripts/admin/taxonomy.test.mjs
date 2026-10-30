import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCleanups, createTempRoot, startApi } from './test-helpers.mjs';

const TAXONOMY = {
  categorySlugs: {
    公告: 'notice',
    技术分享: 'tech',
  },
  tagSlugs: {
    站务: 'site',
  },
  categoryColors: {
    公告: 'var(--wash-sand)',
    技术分享: 'var(--wash-mist)',
  },
};

const POSTS = {
  'alpha.md': `---
title: Alpha
tags:
  - 站务
  - 漫画
  - 漫画
categories:
  - 技术分享
  - 技术分享
description: 正文里的 tags 不算数
---

tags: [不应出现]
`,
  'series/nested.mdx': `---
title: Nested
tags: [漫画, 旧标签]
categories: [技术分享, 新分类]
---

正文
`,
  'notes.txt': `---
tags: [不应出现]
---
`,
  'body-only.md': '没有 frontmatter 的文件不参与审计。\n',
};

const cleanups = createCleanups();

afterEach(async () => {
  await cleanups.run();
});

async function createWorkspace({ taxonomy = TAXONOMY, posts = POSTS } = {}) {
  const root = await createTempRoot(cleanups, 'serina-taxonomy-');
  const dataDir = path.join(root, 'src', 'data');
  const postsDir = path.join(root, 'src', 'content', 'posts');
  await mkdir(dataDir, { recursive: true });
  if (taxonomy !== null) {
    await writeFile(path.join(dataDir, 'taxonomy.json'), `${JSON.stringify(taxonomy, null, 2)}\n`);
  }
  for (const [relative, content] of Object.entries(posts)) {
    const file = path.join(postsDir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return { root, file: path.join(dataDir, 'taxonomy.json'), postsDir };
}

async function readTaxonomy(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

describe('GET /api/taxonomy', () => {
  it('返回映射、已用词条与未映射词条', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/taxonomy');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.taxonomy).toEqual(TAXONOMY);
    expect(body.used).toEqual({
      categories: [
        { name: '技术分享', count: 2 },
        { name: '新分类', count: 1 },
      ],
      tags: [
        { name: '站务', count: 1 },
        { name: '漫画', count: 2 },
        { name: '旧标签', count: 1 },
      ],
    });
    expect(body.unmapped).toEqual({
      categories: [{ name: '新分类', count: 1 }],
      tags: [
        { name: '漫画', count: 2 },
        { name: '旧标签', count: 1 },
      ],
    });
  });

  it('taxonomy.json 缺失或损坏时返回 500 且不泄露堆栈', async () => {
    const missing = await createWorkspace({ taxonomy: null });
    const missingApi = await startApi(missing.root, cleanups);
    const missingResponse = await missingApi.request('/api/taxonomy');

    expect(missingResponse.status).toBe(500);

    const broken = await createWorkspace();
    await writeFile(broken.file, '{ 不是 JSON');
    const brokenApi = await startApi(broken.root, cleanups);
    const brokenResponse = await brokenApi.request('/api/taxonomy');
    const body = await brokenResponse.json();

    expect(brokenResponse.status).toBe(500);
    expect(typeof body.error).toBe('string');
    expect(body.error).not.toContain('at ');
  });
});

describe('PUT /api/taxonomy', () => {
  it('补录未映射词条并按 2 空格原子写回', async () => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/taxonomy', {
      categorySlugs: { ...TAXONOMY.categorySlugs, 新分类: 'news' },
      tagSlugs: { ...TAXONOMY.tagSlugs, 漫画: 'comic', 旧标签: 'legacy' },
      categoryColors: { ...TAXONOMY.categoryColors, 新分类: 'var(--wash-rose)' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.unmapped).toEqual({ categories: [], tags: [] });
    expect(body.taxonomy).toEqual({
      categorySlugs: { 公告: 'notice', 技术分享: 'tech', 新分类: 'news' },
      tagSlugs: { 站务: 'site', 漫画: 'comic', 旧标签: 'legacy' },
      categoryColors: {
        公告: 'var(--wash-sand)',
        技术分享: 'var(--wash-mist)',
        新分类: 'var(--wash-rose)',
      },
    });
    const disk = await readTaxonomy(file);
    expect(disk).toEqual(body.taxonomy);
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(body.taxonomy, null, 2)}\n`);
    expect(await readdir(path.dirname(file))).toEqual(['taxonomy.json']);
  });

  it('修改与删除映射时保留未提交的映射', async () => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/taxonomy', {
      categorySlugs: { 技术分享: 'technology' },
      categoryColors: { 技术分享: 'var(--wash-clay)' },
    });

    expect(response.status).toBe(200);
    expect(await readTaxonomy(file)).toEqual({
      categorySlugs: { 技术分享: 'technology' },
      tagSlugs: { 站务: 'site' },
      categoryColors: { 技术分享: 'var(--wash-clay)' },
    });
  });

  it('并发提交不同映射补丁时按顺序合并', async () => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const [first, second] = await Promise.all([
      api.put('/api/taxonomy', {
        tagSlugs: { ...TAXONOMY.tagSlugs, 漫画: 'comic' },
      }),
      api.put('/api/taxonomy', {
        categoryColors: { ...TAXONOMY.categoryColors, 技术分享: 'var(--wash-sage)' },
      }),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await readTaxonomy(file)).toEqual({
      categorySlugs: TAXONOMY.categorySlugs,
      tagSlugs: { ...TAXONOMY.tagSlugs, 漫画: 'comic' },
      categoryColors: { ...TAXONOMY.categoryColors, 技术分享: 'var(--wash-sage)' },
    });
  });

  it('保留 frontmatter 词条原样，可按空格差异补录', async () => {
    const { root, file } = await createWorkspace({
      posts: {
        'spaced.md': `---
title: Spaced
tags:
  - " 站务"
---
`,
      },
    });
    const api = await startApi(root, cleanups);

    const before = await (await api.request('/api/taxonomy')).json();
    expect(before.unmapped.tags).toEqual([{ name: ' 站务', count: 1 }]);

    const response = await api.put('/api/taxonomy', {
      tagSlugs: { ...TAXONOMY.tagSlugs, ' 站务': 'site-spaced' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.unmapped.tags).toEqual([]);
    expect((await readTaxonomy(file)).tagSlugs[' 站务']).toBe('site-spaced');
  });

  const invalidPatches = [
    ['空补丁', {}],
    ['未知顶层字段', { categoryNames: {} }],
    ['映射不是对象', { tagSlugs: ['site'] }],
    ['slug 不是 ASCII kebab-case', { tagSlugs: { 站务: 'Site Page' } }],
    ['slug 带下划线', { tagSlugs: { 站务: 'site_page' } }],
    ['同一映射内 slug 重复', { tagSlugs: { 站务: 'site', 漫画: 'site' } }],
    ['分类颜色不是莫兰迪 wash 变量', { categoryColors: { 公告: 'red' } }],
    ['为不存在的分类配置颜色', { categoryColors: { 不存在: 'var(--wash-pink)' } }],
    ['新增分类缺少莫兰迪配色', { categorySlugs: { ...TAXONOMY.categorySlugs, 新分类: 'news' } }],
    ['删除分类时保留其颜色', { categorySlugs: { 公告: 'notice' } }],
    ['词条名为空', { tagSlugs: { '  ': 'blank' } }],
  ];

  it.each(invalidPatches)('拒绝无效补丁：%s，磁盘保持原样', async (_label, patch) => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/taxonomy', patch);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(typeof body.error).toBe('string');
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(TAXONOMY, null, 2)}\n`);
  });

  it('请求体不是合法 JSON 时返回 400', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/taxonomy', '{ not json');

    expect(response.status).toBe(400);
  });
});
