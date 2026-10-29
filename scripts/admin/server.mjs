import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ui from '@nuxt/ui/vite';
import vue from '@vitejs/plugin-vue';
import { createServer as createViteServer } from 'vite';
import { createApiHandler } from './api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADMIN_ROOT = path.join(ROOT, 'admin');
const HOST = '127.0.0.1';
const PORT = 4320;

function sendHtml(response, status, body, method) {
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (method === 'HEAD') {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  response.writeHead(status, headers);
  response.end(body);
}

async function serveIndex(vite, request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' });
    response.end();
    return;
  }
  if (!request.headers.accept?.includes('text/html')) {
    response.writeHead(404, { 'cache-control': 'no-store' });
    response.end('Not found');
    return;
  }
  try {
    const template = await readFile(path.join(ADMIN_ROOT, 'index.html'), 'utf8');
    const html = await vite.transformIndexHtml(request.url ?? '/', template);
    sendHtml(response, 200, html, request.method);
  } catch (error) {
    vite.ssrFixStacktrace(error);
    console.error('[admin] 渲染管理界面失败', error);
    sendHtml(response, 500, '管理界面渲染失败，请查看终端日志。', request.method);
  }
}

async function main() {
  const vite = await createViteServer({
    root: ADMIN_ROOT,
    appType: 'custom',
    server: { middlewareMode: true },
    plugins: [
      vue(),
      ui({
        dts: false,
        ui: {
          colors: { primary: 'brand', neutral: 'slate' },
        },
      }),
    ],
  });
  const handleApi = createApiHandler({ root: ROOT });

  const server = createServer((request, response) => {
    const pathname = request.url?.split('?')[0] ?? '/';
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      void handleApi(request, response);
      return;
    }
    vite.middlewares(request, response, (error) => {
      if (error) {
        console.error('[admin] 静态资源处理失败', error);
        if (!response.headersSent) {
          response.writeHead(500, { 'cache-control': 'no-store' });
          response.end('资源加载失败');
        }
        return;
      }
      void serveIndex(vite, request, response);
    });
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, HOST, resolve);
    });
  } catch (error) {
    await vite.close();
    if (error.code === 'EADDRINUSE') {
      throw new Error(`端口 ${PORT} 已被占用；先停止占用该端口的进程。`);
    }
    throw error;
  }

  console.log(`[admin] 管理后台已启动：http://${HOST}:${PORT}/`);
  console.log(`[admin] 数据目录：${ROOT}`);

  const shutdown = async () => {
    server.close();
    server.closeAllConnections();
    await vite.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(`[admin] 启动失败：${error.message}`);
  process.exitCode = 1;
});
