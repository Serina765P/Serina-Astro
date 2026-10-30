import { HttpError, sendJson } from './lib/http.mjs';
import { handleAssetPrefix, handleAssets } from './routes/assets.mjs';
import { handlePosts } from './routes/posts.mjs';
import { handleShuoshuo } from './routes/shuoshuo.mjs';
import { handleSiteInfo } from './routes/site-info.mjs';
import { handleTaxonomy } from './routes/taxonomy.mjs';

const ROUTES = [
  { pattern: /^\/api\/site-info$/u, handler: handleSiteInfo },
  { pattern: /^\/api\/shuoshuo$/u, handler: handleShuoshuo },
  { pattern: /^\/api\/taxonomy$/u, handler: handleTaxonomy },
  { pattern: /^\/api\/assets\/prefix$/u, handler: handleAssetPrefix },
  { pattern: /^\/api\/assets$/u, handler: handleAssets },
  {
    pattern: /^\/api\/assets\/([^/]+)\/([^/]+)$/u,
    handler: handleAssets,
    params: ([, kind, file]) => ({
      kind: decodeURIComponent(kind),
      file: decodeURIComponent(file),
    }),
  },
  { pattern: /^\/api\/posts$/u, handler: handlePosts },
  {
    pattern: /^\/api\/posts\/([^/]+)\/images\/([^/]+)$/u,
    handler: handlePosts,
    params: ([, slug, name]) => ({
      slug: decodeURIComponent(slug),
      imageName: decodeURIComponent(name),
    }),
  },
  {
    pattern: /^\/api\/posts\/([^/]+)\/images$/u,
    handler: handlePosts,
    params: ([, encoded]) => ({ slug: decodeURIComponent(encoded), images: true }),
  },
  {
    pattern: /^\/api\/posts\/([^/]+)$/u,
    handler: handlePosts,
    params: ([, encoded]) => ({ slug: decodeURIComponent(encoded) }),
  },
  {
    pattern: /^\/api\/shuoshuo\/([^/]+)$/u,
    handler: handleShuoshuo,
    params: ([, encoded]) => ({ id: decodeURIComponent(encoded) }),
  },
];
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
      const routePath = pathname.replace(/\/+$/u, '') || '/';
      for (const route of ROUTES) {
        const match = route.pattern.exec(routePath);
        if (!match) continue;
        let params = {};
        if (route.params) {
          try {
            params = route.params(match);
          } catch {
            throw new HttpError(400, '路径参数无效');
          }
        }
        await route.handler(request, response, { root, ...params });
        return;
      }
      sendJson(response, 404, { error: '接口不存在' });
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
