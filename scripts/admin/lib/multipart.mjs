import { HttpError } from './http.mjs';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const FINAL_MARKER = '--';

function requireBoundary(request) {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(415, '图片上传必须使用 multipart/form-data');
  }
  const match = /boundary=(?:"([^"]+)"|([^;]+))/iu.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2] ?? '').trim();
  if (!boundary) throw new HttpError(400, 'multipart 请求缺少 boundary');
  return boundary;
}

function readPartHeaders(text) {
  const headers = {};
  for (const line of text.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return headers;
}

function dispositionValue(disposition, key) {
  const quoted = new RegExp(`${key}="([^"]*)"`, 'iu').exec(disposition);
  if (quoted) return quoted[1];
  const bare = new RegExp(`${key}=([^;]*)`, 'iu').exec(disposition);
  return bare ? bare[1].trim() : '';
}

/** 只解析文件部件；普通文本字段被忽略。返回所有带文件名的部件。 */
function parseParts(buffer, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const nextMarker = Buffer.from(`\r\n--${boundary}`);
  const parts = [];
  let index = buffer.indexOf(marker);
  if (index === -1) throw new HttpError(400, 'multipart 请求体不完整');

  while (index !== -1) {
    let cursor = index + marker.length;
    if (buffer.subarray(cursor, cursor + 2).toString('latin1') === FINAL_MARKER) break;
    if (buffer.subarray(cursor, cursor + 2).toString('latin1') !== '\r\n') {
      throw new HttpError(400, 'multipart 请求体分隔符格式错误');
    }
    cursor += 2;

    const headerEnd = buffer.indexOf('\r\n\r\n', cursor);
    if (headerEnd === -1) throw new HttpError(400, 'multipart 请求体缺少部件头');
    const headers = readPartHeaders(buffer.subarray(cursor, headerEnd).toString('utf8'));
    const contentStart = headerEnd + 4;
    const contentEnd = buffer.indexOf(nextMarker, contentStart);
    if (contentEnd === -1) throw new HttpError(400, 'multipart 请求体缺结束分隔符');

    const disposition = headers['content-disposition'] ?? '';
    const filename = dispositionValue(disposition, 'filename');
    if (filename) {
      parts.push({
        filename,
        contentType: (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase(),
        data: buffer.subarray(contentStart, contentEnd),
      });
    }
    index = contentEnd + 2;
  }
  return parts;
}

/**
 * 读取 multipart 请求并返回唯一文件部件。
 * 超限时先把剩余请求体读完再报错，避免客户端还在上传时被提前断开。
 */
export async function readMultipartFile(request, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  const boundary = requireBoundary(request);
  const chunks = [];
  let size = 0;
  let exceeded = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      exceeded = true;
      chunks.length = 0;
    }
    if (!exceeded) chunks.push(chunk);
  }
  if (exceeded) throw new HttpError(413, `图片过大，单张上限 ${maxBytes / 1024 / 1024} MB`);

  const parts = parseParts(Buffer.concat(chunks), boundary);
  if (parts.length === 0) throw new HttpError(400, '没有收到图片文件');
  if (parts.length > 1) throw new HttpError(400, '一次只能上传一张图片');
  return parts[0];
}
