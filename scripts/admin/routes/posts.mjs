import {
  createWriteQueue,
  readJsonBody,
  requireJsonContentType,
  sendFile,
  sendJson,
} from '../lib/http.mjs';
import { readMultipartFile } from '../lib/multipart.mjs';
import { readPostImage, uploadPostImage } from '../lib/post-images.mjs';
import { createPost, deletePost, getPost, listPosts, updatePost } from '../lib/posts.mjs';

const enqueue = createWriteQueue();

/** 文章集合负责浏览与新建，条目路由负责读取、Frontmatter/正文保存与删除。 */
export async function handlePosts(
  request,
  response,
  { root, slug = null, images = false, imageName = null },
) {
  if (imageName !== null) {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: '不支持的方法' }, { allow: 'GET' });
      return;
    }
    const image = await readPostImage(root, slug, imageName);
    sendFile(response, 200, image.contentType, image.data);
    return;
  }

  if (images) {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: '不支持的方法' }, { allow: 'POST' });
      return;
    }
    const file = await readMultipartFile(request);
    sendJson(response, 201, await enqueue(() => uploadPostImage(root, slug, file)));
    return;
  }

  if (slug === null) {
    if (request.method === 'GET') {
      sendJson(response, 200, { posts: await enqueue(() => listPosts(root)) });
      return;
    }
    if (request.method === 'POST') {
      requireJsonContentType(request);
      const payload = await readJsonBody(request);
      sendJson(response, 201, await enqueue(() => createPost(root, payload)));
      return;
    }
    sendJson(response, 405, { error: '不支持的方法' }, { allow: 'GET, POST' });
    return;
  }

  if (request.method === 'GET') {
    sendJson(response, 200, await enqueue(() => getPost(root, slug)));
    return;
  }
  if (request.method === 'PUT') {
    requireJsonContentType(request);
    const payload = await readJsonBody(request);
    sendJson(response, 200, await enqueue(() => updatePost(root, slug, payload)));
    return;
  }
  if (request.method === 'DELETE') {
    const removeAssets = ['1', 'true'].includes(
      new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('removeAssets'),
    );
    sendJson(response, 200, await enqueue(() => deletePost(root, slug, { removeAssets })));
    return;
  }
  sendJson(response, 405, { error: '不支持的方法' }, { allow: 'GET, PUT, DELETE' });
}
