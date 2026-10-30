import {
  readAssetFile,
  readAssetRegistries,
  renameAssetPrefix,
  saveAssets,
  scanAssetUsage,
} from '../lib/assets.mjs';
import {
  createWriteQueue,
  readJsonBody,
  requireJsonContentType,
  sendFile,
  sendJson,
} from '../lib/http.mjs';

const enqueueWrite = createWriteQueue();

/** 素材注册表读取、更新与预览：支持表情与贴纸两套独立注册表。 */
export async function handleAssets(request, response, { root, kind = null, file = null }) {
  if (request.method === 'GET') {
    if (kind !== null) {
      const asset = await readAssetFile(root, kind, file);
      sendFile(response, 200, asset.contentType, asset.data);
      return;
    }

    const [registries, usage] = await Promise.all([
      readAssetRegistries(root),
      scanAssetUsage(root),
    ]);
    sendJson(response, 200, { ...registries, usage });
    return;
  }

  if (request.method === 'PUT') {
    requireJsonContentType(request);
    const body = await readJsonBody(request);
    const result = await enqueueWrite(() => saveAssets(root, body));
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 405, { error: '不支持的方法' }, { allow: 'GET, PUT' });
}

/** 批量修改套装前缀与资源文件。 */
export async function handleAssetPrefix(request, response, { root }) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: '不支持的方法' }, { allow: 'POST' });
    return;
  }

  requireJsonContentType(request);
  const body = await readJsonBody(request);
  const result = await enqueueWrite(() => renameAssetPrefix(root, body));
  sendJson(response, 200, result);
}
