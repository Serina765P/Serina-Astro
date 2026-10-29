import {
  createWriteQueue,
  HttpError,
  readJsonBody,
  requireJsonContentType,
  sendJson,
} from '../lib/http.mjs';
import { readSiteInfo, validateSiteInfoPatch, writeSiteInfo } from '../lib/site-info.mjs';

const enqueueWrite = createWriteQueue();

async function loadCurrent(root) {
  try {
    return await readSiteInfo(root);
  } catch (error) {
    throw new HttpError(500, '读取 site-info.json 失败', { cause: error });
  }
}

/** 站点与友链面板的唯一接口：读全量、写本面板负责的三个字段。 */
export async function handleSiteInfo(request, response, { root }) {
  if (request.method === 'GET') {
    sendJson(response, 200, await loadCurrent(root));
    return;
  }

  if (request.method === 'PUT') {
    requireJsonContentType(request);
    const patch = validateSiteInfoPatch(await readJsonBody(request));
    const next = await enqueueWrite(async () => {
      const merged = { ...(await loadCurrent(root)), ...patch };
      try {
        await writeSiteInfo(root, merged);
      } catch (error) {
        throw new HttpError(500, '写入 site-info.json 失败', { cause: error });
      }
      return merged;
    });
    sendJson(response, 200, next);
    return;
  }

  sendJson(response, 405, { error: '不支持的方法' }, { allow: 'GET, PUT' });
}
