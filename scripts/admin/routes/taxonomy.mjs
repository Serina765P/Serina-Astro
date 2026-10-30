import {
  createWriteQueue,
  HttpError,
  readJsonBody,
  requireJsonContentType,
  sendJson,
} from '../lib/http.mjs';
import {
  buildTaxonomyState,
  collectUsedTaxonomies,
  mergeTaxonomyPatch,
  readTaxonomy,
  writeTaxonomy,
} from '../lib/taxonomy.mjs';

const enqueueWrite = createWriteQueue();

async function loadState(root) {
  const current = await readTaxonomy(root);
  const used = await collectUsedTaxonomies(root);
  return buildTaxonomyState(current, used);
}

/** URI 对照面板：读全量映射与全站审计；补丁整体替换提交的映射。 */
export async function handleTaxonomy(request, response, { root }) {
  if (request.method === 'GET') {
    sendJson(response, 200, await loadState(root));
    return;
  }

  if (request.method === 'PUT') {
    requireJsonContentType(request);
    const patch = await readJsonBody(request);
    const state = await enqueueWrite(async () => {
      const current = await readTaxonomy(root);
      const merged = mergeTaxonomyPatch(current, patch);
      // 先完成文章扫描再落盘：扫描失败时不会出现「接口报错但文件已改」。
      const used = await collectUsedTaxonomies(root);
      try {
        await writeTaxonomy(root, merged);
      } catch (error) {
        throw new HttpError(500, '写入 taxonomy.json 失败', { cause: error });
      }
      return buildTaxonomyState(merged, used);
    });
    sendJson(response, 200, state);
    return;
  }

  sendJson(response, 405, { error: '不支持的方法' }, { allow: 'GET, PUT' });
}
