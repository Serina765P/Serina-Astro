import { createWriteQueue, readJsonBody, requireJsonContentType, sendJson } from '../lib/http.mjs';
import { createShuoshuo, deleteShuoshuo, listShuoshuo, updateShuoshuo } from '../lib/shuoshuo.mjs';

const enqueue = createWriteQueue();

/** 说说面板：集合路由负责聚合与发布，条目路由负责编辑与删除。 */
export async function handleShuoshuo(request, response, { root, id = null }) {
  if (id === null) {
    if (request.method === 'GET') {
      sendJson(response, 200, await enqueue(() => listShuoshuo(root)));
      return;
    }
    if (request.method === 'POST') {
      requireJsonContentType(request);
      const payload = await readJsonBody(request);
      sendJson(response, 201, await enqueue(() => createShuoshuo(root, payload)));
      return;
    }
    sendJson(response, 405, { error: '不支持的方法' }, { allow: 'GET, POST' });
    return;
  }

  if (request.method === 'PUT') {
    requireJsonContentType(request);
    const payload = await readJsonBody(request);
    sendJson(response, 200, await enqueue(() => updateShuoshuo(root, id, payload)));
    return;
  }
  if (request.method === 'DELETE') {
    sendJson(response, 200, await enqueue(() => deleteShuoshuo(root, id)));
    return;
  }
  sendJson(response, 405, { error: '不支持的方法' }, { allow: 'PUT, DELETE' });
}
