import { readAssetFile, readAssetRegistries } from '../lib/assets.mjs';
import { sendFile, sendJson } from '../lib/http.mjs';

/** 素材选择器只读：两套注册表与 public 下的缩略图，写入能力留给后续素材管理工单。 */
export async function handleAssets(request, response, { root, kind = null, file = null }) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: '不支持的方法' }, { allow: 'GET' });
    return;
  }

  if (kind !== null) {
    const asset = await readAssetFile(root, kind, file);
    sendFile(response, 200, asset.contentType, asset.data);
    return;
  }

  sendJson(response, 200, await readAssetRegistries(root));
}
