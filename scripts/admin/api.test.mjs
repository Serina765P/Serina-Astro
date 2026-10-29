import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCleanups, createTempRoot, startApi } from './test-helpers.mjs';

const FIXTURE = {
  heroTitle: '芹菜P的部落阁',
  heroMark: 'せりな',
  description: '这里是芹菜P，写博客记录生活和学习的点滴。',
  social: [
    { name: 'GitHub', icon: 'simple-icons:github', href: 'https://github.com/Serina765P' },
    { name: '邮箱', icon: 'material-symbols:mail', href: 'mailto:serinap@qq.com' },
  ],
  friendLinks: [{ name: '偶像大师中文维基', href: 'https://wikimas.org' }],
};

const cleanups = createCleanups();

afterEach(async () => {
  await cleanups.run();
});

async function createWorkspace() {
  const root = await createTempRoot(cleanups);
  const file = path.join(root, 'src', 'data', 'site-info.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(FIXTURE, null, 2)}\n`);
  return { root, file };
}

function rawRequest(port, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: '127.0.0.1', port, method, path: '/api/site-info', headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

describe('GET /api/site-info', () => {
  it('返回当前的侧栏信息与友链', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/site-info');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(FIXTURE);
  });

  it('源文件损坏时返回 500 且不泄露堆栈', async () => {
    const { root, file } = await createWorkspace();
    await writeFile(file, '{ 不是 JSON');
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/site-info');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(typeof body.error).toBe('string');
    expect(body.error).not.toContain('at ');
  });
});

describe('PUT /api/site-info', () => {
  it('更新简介、社交外链与友链，保留首页标题字段', async () => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);
    const patch = {
      description: '新的简介。',
      social: [
        { name: 'GitHub', icon: 'simple-icons:github', href: 'https://github.com/Serina765P' },
        { name: 'X', icon: 'simple-icons:x', href: 'https://x.com/Serina765P' },
      ],
      friendLinks: [
        { name: '偶像大师中文维基', href: 'https://wikimas.org' },
        { name: '示例站点', href: 'https://example.com/' },
      ],
    };

    const response = await api.put('/api/site-info', patch);

    expect(response.status).toBe(200);
    const expected = { ...FIXTURE, ...patch };
    expect(await response.json()).toEqual(expected);
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(expected, null, 2)}\n`);
    expect(await readdir(path.dirname(file))).toEqual(['site-info.json']);
  });

  it('并发保存不同字段时不会互相覆盖', async () => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const [first, second] = await Promise.all([
      api.put('/api/site-info', { description: '并发 A' }),
      api.put('/api/site-info', {
        friendLinks: [{ name: '并发 B', href: 'https://b.example/' }],
      }),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    const disk = JSON.parse(await readFile(file, 'utf8'));
    expect(disk.description).toBe('并发 A');
    expect(disk.friendLinks).toEqual([{ name: '并发 B', href: 'https://b.example/' }]);
  });

  const invalidPatches = [
    ['简介不是字符串', { description: 42 }],
    [
      '社交外链图标不是 Iconify 名称',
      { social: [{ name: 'X', icon: 'x', href: 'https://x.com' }] },
    ],
    [
      '社交外链协议不安全',
      { social: [{ name: 'X', icon: 'simple-icons:x', href: 'javascript:alert(1)' }] },
    ],
    ['友链缺少名称', { friendLinks: [{ href: 'https://example.com/' }] }],
    ['友链不是 http(s) 地址', { friendLinks: [{ name: 'X', href: 'ftp://example.com/' }] }],
    ['试图改写未开放的字段', { heroTitle: '被篡改的标题' }],
    ['字段类型错误', { friendLinks: 'nope' }],
    [
      '友链列表超长',
      {
        friendLinks: Array.from({ length: 201 }, (_, i) => ({
          name: `站点 ${i}`,
          href: `https://example.com/${i}`,
        })),
      },
    ],
  ];

  it.each(invalidPatches)('拒绝无效请求：%s，磁盘保持原样', async (_label, patch) => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/site-info', patch);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(typeof body.error).toBe('string');
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(FIXTURE, null, 2)}\n`);
  });

  it('请求体不是合法 JSON 时返回 400', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.put('/api/site-info', '{ not json');

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('JSON');
  });
});

describe('请求来源防护', () => {
  it('拒绝 DNS rebinding 的非本机 Host', async () => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);
    const payload = JSON.stringify({ description: '劫持' });

    const response = await rawRequest(api.port, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        host: 'evil.example',
        'content-length': Buffer.byteLength(payload),
      },
      body: payload,
    });

    expect(response.status).toBe(403);
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(FIXTURE, null, 2)}\n`);
  });

  it('拒绝跨站 Origin 的写请求', async () => {
    const { root, file } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/site-info', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ description: '劫持' }),
    });

    expect(response.status).toBe(403);
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(FIXTURE, null, 2)}\n`);
  });

  it('写请求必须是 application/json', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/site-info', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ description: '劫持' }),
    });

    expect(response.status).toBe(415);
  });
});

describe('API 路由边界', () => {
  it('未知 API 返回 404', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/unknown');

    expect(response.status).toBe(404);
  });

  it('不支持的 HTTP 方法返回 405 与 Allow 头', async () => {
    const { root } = await createWorkspace();
    const api = await startApi(root, cleanups);

    const response = await api.request('/api/site-info', { method: 'DELETE' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, PUT');
  });
});
