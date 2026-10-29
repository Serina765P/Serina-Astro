import { HttpError, sendJson } from './lib/http.mjs';
import { handleSiteInfo } from './routes/site-info.mjs';

const ROUTES = new Map([['/api/site-info', handleSiteInfo]]);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Host / Origin 可能是裸主机名，也可能是完整 URL；只认回环地址，挡住 DNS rebinding。 */
function isLoopback(value) {
  if (!value) return false;
  let hostname;
  try {
    hostname = new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(hostname);
}

/**
 * API 分发器与 HTTP 服务器解耦：测试直接挂在临时端口上，生产入口再叠加 Vite 中间件。
 * `root` 是仓库根目录，便于测试指向临时工作区。
 */
export function createApiHandler({ root }) {
  return async function handleApi(request, response) {
    try {
      if (!isLoopback(request.headers.host)) {
        sendJson(response, 403, { error: '只接受本机请求' });
        return;
      }
      const origin = request.headers.origin;
      if (request.method !== 'GET' && origin && !isLoopback(origin)) {
        sendJson(response, 403, { error: '拒绝跨站写入' });
        return;
      }
      const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');
      const route = ROUTES.get(pathname.replace(/\/+$/u, '') || '/');
      if (!route) {
        sendJson(response, 404, { error: '接口不存在' });
        return;
      }
      await route(request, response, { root });
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error('[admin]', error);
      sendJson(response, status, {
        error: error instanceof HttpError ? error.message : '服务器内部错误',
      });
    }
  };
}
