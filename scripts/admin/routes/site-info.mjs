import { HttpError, readJsonBody, sendJson } from '../lib/http.mjs';
import { readSiteInfo, validateSiteInfoPatch, writeSiteInfo } from '../lib/site-info.mjs';

/** 同一进程内的读-改-写串行化：两个标签页同时保存时不会互相覆盖。 */
let writeQueue = Promise.resolve();

function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

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
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      throw new HttpError(415, '写请求必须使用 application/json');
    }
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
