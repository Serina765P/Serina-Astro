import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApiHandler } from './api.mjs';

/** 每个测试文件一份清理栈，afterEach 统一回收临时目录与服务器。 */
export function createCleanups() {
  const tasks = [];
  return {
    add(task) {
      tasks.push(task);
    },
    async run() {
      while (tasks.length > 0) await tasks.pop()();
    },
  };
}

export async function createTempRoot(cleanups, prefix = 'serina-admin-') {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  cleanups.add(() => rm(root, { recursive: true, force: true }));
  return root;
}

export async function startApi(root, cleanups) {
  const server = createServer(createApiHandler({ root }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanups.add(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    port,
    request: (pathname, init) => fetch(`${base}${pathname}`, init),
    send: (method, pathname, body) =>
      fetch(`${base}${pathname}`, {
        method,
        headers: { 'content-type': 'application/json', origin: base },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    put: (pathname, body) =>
      fetch(`${base}${pathname}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: base },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    del: (pathname) => fetch(`${base}${pathname}`, { method: 'DELETE', headers: { origin: base } }),
    upload: (pathname, { file, type, name }) => {
      const form = new FormData();
      form.append('file', new Blob([file], { type }), name);
      return fetch(`${base}${pathname}`, {
        method: 'POST',
        headers: { origin: base },
        body: form,
      });
    },
  };
}
