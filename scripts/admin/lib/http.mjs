/** 带 HTTP 状态码的业务错误；路由只抛这个，统一出口负责序列化。 */
export class HttpError extends Error {
  constructor(status, message, options) {
    super(message, options);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function sendJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(body);
}

/** 本地图片回读：只用于后台预览，禁用缓存以免重传同名图片后看到旧图。 */
export function sendFile(response, status, contentType, data) {
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': data.length,
    'cache-control': 'no-store',
  });
  response.end(data);
}

const MAX_BODY_BYTES = 1024 * 1024;

/** 写接口统一要求 application/json，挡掉表单/纯文本跨站提交。 */
export function requireJsonContentType(request) {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, '写请求必须使用 application/json');
  }
}

/** 同一进程内的读-改-写串行化：两个标签页同时保存时不会互相覆盖。 */
export function createWriteQueue() {
  let queue = Promise.resolve();
  return function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** 读取并解析 JSON 请求体；超限或语法错误都按 4xx 返回，不把异常留给调用方。 */
export async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, '请求体过大');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) throw new HttpError(400, '请求体不是合法 JSON');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON');
  }
}
