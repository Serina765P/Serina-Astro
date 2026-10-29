import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stickerCode } from './sticker-code.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'src', 'data', 'stickers.json');
const stickerDir = path.join(root, 'public', 'sticker');
const portIndex = process.argv.indexOf('--port');
const port = portIndex > 0 ? Number(process.argv[portIndex + 1]) : 4319;

function send(response, status, type, body) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
}

function sendJson(response, status, payload) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(payload));
}

async function readRegistry() {
  return JSON.parse(await readFile(registryPath, 'utf8'));
}

function autoKeywords(record) {
  return [record.label, record.setLabel, record.set];
}

function publicRecord(record) {
  const auto = new Set(autoKeywords(record));
  return {
    code: record.code,
    label: record.label,
    src: record.src,
    poster: record.poster,
    width: record.width,
    height: record.height,
    keywords: record.keywords.filter((word) => !auto.has(word)),
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('请求体过大'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function save(items) {
  const records = await readRegistry();
  if (!Array.isArray(items) || items.length !== records.length)
    throw new Error('提交的条目数与注册表不一致，请刷新页面后重试');

  const byCode = new Map(records.map((record) => [record.code, record]));
  const planned = new Map();
  for (const item of items) {
    const record = byCode.get(item?.code);
    if (!record) throw new Error(`未知贴纸：${item?.code}`);
    if (planned.has(item.code)) throw new Error(`重复提交：${item.code}`);
    const label = String(item.label ?? '').trim();
    if (!label) throw new Error(`名称不能为空：${record.label}`);
    if (label.length > 40) throw new Error(`名称过长（最多 40 字）：${label}`);
    const keywords = (Array.isArray(item.keywords) ? item.keywords : [])
      .map((word) => String(word).trim())
      .filter(Boolean);
    planned.set(item.code, { label, keywords });
  }

  const nextCodes = new Map();
  const used = new Map();
  for (const record of records) {
    const { label } = planned.get(record.code);
    const code = stickerCode(record.set, label);
    if (used.has(code))
      throw new Error(`短代码重复：${code}（${used.get(code)} / ${record.code}）`);
    used.set(code, record.code);
    nextCodes.set(record.code, code);
  }

  const moves = [];
  for (const record of records) {
    const code = nextCodes.get(record.code);
    if (code === record.code) continue;
    for (const suffix of ['', '-still']) {
      const from = path.join(stickerDir, `${record.code}${suffix}.webp`);
      const to = path.join(stickerDir, `${code}${suffix}.webp`);
      if (!existsSync(from)) throw new Error(`缺少文件：${path.basename(from)}`);
      moves.push({ from, to });
    }
  }

  if (moves.length) {
    const sources = new Set(moves.map((move) => move.from));
    for (const move of moves) {
      if (existsSync(move.to) && !sources.has(move.to))
        throw new Error(`目标文件已存在：${path.basename(move.to)}`);
    }
    const stamps = moves.map((move, index) => `${move.from}.__tmp-${index}-${Date.now()}`);
    for (let index = 0; index < moves.length; index += 1)
      await rename(moves[index].from, stamps[index]);
    for (let index = 0; index < moves.length; index += 1)
      await rename(stamps[index], moves[index].to);
  }

  const next = records.map((record) => {
    const { label, keywords } = planned.get(record.code);
    const code = nextCodes.get(record.code);
    return {
      ...record,
      code,
      label,
      src: `/sticker/${code}.webp`,
      poster: `/sticker/${code}-still.webp`,
      keywords: [...new Set([label, record.setLabel, record.set, ...keywords])],
    };
  });

  await writeFile(registryPath, `${JSON.stringify(next, null, 2)}\n`);
  const renamed = next
    .map((record, index) => ({ before: records[index].code, after: record.code }))
    .filter((entry) => entry.before !== entry.after)
    .map((entry) => `${entry.before} → ${entry.after}`);
  return { records: next.map(publicRecord), renamed };
}

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>贴纸命名 · 偶像大师百万现场</title>
<style>
  :root { color-scheme: light dark; --line: #d8d8de; --sub: #6b6b76; --accent: #c2185b; }
  @media (prefers-color-scheme: dark) { :root { --line: #3a3a42; --sub: #9a9aa6; --accent: #f06292; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  header { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--line); background: Canvas; }
  header h1 { margin: 0; font-size: 15px; }
  header p { margin: 0; color: var(--sub); font-size: 12px; }
  .spacer { flex: 1; }
  #status { font-size: 12px; color: var(--sub); min-height: 1.2em; }
  button { font: inherit; padding: 7px 16px; border-radius: 8px; border: 1px solid var(--line); background: Canvas; color: CanvasText; cursor: pointer; }
  button.primary { border-color: var(--accent); background: var(--accent); color: #fff; font-weight: 600; }
  button:disabled { opacity: .55; cursor: progress; }
  main { padding: 10px 18px 60px; display: grid; gap: 6px; }
  .row { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 12px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
  .row.conflict .code { color: #d50000; font-weight: 700; }
  .row.conflict input.name { border-color: #d50000; }
  .thumb-wrap { position: relative; display: flex; gap: 6px; align-items: center; }
  .thumb { width: 64px; height: 64px; object-fit: contain; }
  .index { color: var(--sub); font-size: 11px; width: 22px; text-align: right; }
  .fields { display: grid; gap: 4px; min-width: 0; }
  .line { display: flex; gap: 10px; align-items: center; min-width: 0; }
  input { font: inherit; width: 100%; min-width: 0; padding: 6px 9px; border-radius: 7px; border: 1px solid var(--line); background: Canvas; color: CanvasText; }
  input.name { font-weight: 600; max-width: 320px; }
  input.keywords { max-width: 560px; font-size: 12px; color: var(--sub); }
  .code { font: 12px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .source { font: 11px/1.4 ui-monospace, Consolas, monospace; color: var(--sub); }
</style>
</head>
<body>
<header>
  <div>
    <h1>贴纸命名 · 偶像大师百万现场</h1>
    <p>编辑名称与关键词，保存后短代码、文件名同步更新。悬停缩略图播放动图。</p>
  </div>
  <div class="spacer"></div>
  <span id="status"></span>
  <button id="save" class="primary" type="button">保存</button>
</header>
<main id="list"></main>
<script>
  const list = document.querySelector('#list');
  const statusEl = document.querySelector('#status');
  const saveButton = document.querySelector('#save');
  const slug = (label) => label.replace(/[^\\p{L}\\p{N}_-]+/gu, '_').replace(/^_+|_+$/gu, '');
  let records = [];

  function row(record, index) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.dataset.code = record.code;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb-wrap';
    const indexEl = document.createElement('span');
    indexEl.className = 'index';
    indexEl.textContent = String(index + 1);
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = record.poster;
    img.dataset.animated = record.src;
    img.alt = record.label;
    img.loading = 'lazy';
    img.addEventListener('pointerenter', () => { img.src = record.src; });
    img.addEventListener('pointerleave', () => { img.src = record.poster; });
    thumbWrap.append(indexEl, img);

    const fields = document.createElement('div');
    fields.className = 'fields';
    const line = document.createElement('div');
    line.className = 'line';
    const name = document.createElement('input');
    name.className = 'name';
    name.value = record.label;
    name.spellcheck = false;
    const code = document.createElement('span');
    code.className = 'code';
    line.append(name, code);

    const keywords = document.createElement('input');
    keywords.className = 'keywords';
    keywords.value = record.keywords.join(', ');
    keywords.placeholder = '关键词，逗号分隔';

    fields.append(line, keywords);
    wrap.append(thumbWrap, fields);
    wrap.dataset.label = record.label;
    wrap.dataset.keywords = record.keywords.join(', ');
    name.addEventListener('input', () => { wrap.dataset.label = name.value; updateCodes(); });
    keywords.addEventListener('input', () => { wrap.dataset.keywords = keywords.value; });
    return wrap;
  }

  function items() {
    return [...list.querySelectorAll('.row')].map((row) => ({
      code: row.dataset.code,
      label: row.dataset.label,
      keywords: row.dataset.keywords.split(/[,，、]+/).map((word) => word.trim()).filter(Boolean),
    }));
  }

  function updateCodes() {
    const pending = items();
    const counts = new Map();
    for (const item of pending) {
      const code = 'ml_' + slug(item.label.trim());
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    let conflicts = 0;
    for (const [index, row] of [...list.querySelectorAll('.row')].entries()) {
      const label = pending[index].label.trim();
      const code = 'ml_' + slug(label);
      row.querySelector('.code').textContent = ':' + code + ':';
      const conflict = !label || counts.get(code) > 1;
      row.classList.toggle('conflict', conflict);
      if (conflict) conflicts += 1;
    }
    statusEl.textContent = conflicts ? conflicts + ' 处名称冲突或为空' : '共 ' + pending.length + ' 条';
    saveButton.disabled = conflicts > 0;
  }

  function render(next) {
    records = next;
    list.textContent = '';
    next.forEach((record, index) => list.append(row(record, index)));
    updateCodes();
  }

  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    statusEl.textContent = '保存中…';
    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: items() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '保存失败');
      render(payload.records);
      statusEl.textContent = payload.renamed.length
        ? '已保存，改名 ' + payload.renamed.length + ' 条'
        : '已保存';
    } catch (error) {
      statusEl.textContent = String(error.message ?? error);
      saveButton.disabled = false;
    }
  });

  fetch('/api/stickers')
    .then((response) => response.json())
    .then((payload) => render(payload.records))
    .catch((error) => { statusEl.textContent = String(error.message ?? error); });
</script>
</body>
</html>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (request.method === 'GET' && url.pathname === '/') {
      send(response, 200, 'text/html; charset=utf-8', page);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/stickers') {
      sendJson(response, 200, { records: (await readRegistry()).map(publicRecord) });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/save') {
      const body = JSON.parse(await readBody(request));
      sendJson(response, 200, await save(body.items));
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/sticker/')) {
      const name = decodeURIComponent(url.pathname.slice('/sticker/'.length));
      const filePath = path.join(stickerDir, name);
      if (path.dirname(filePath) !== stickerDir) {
        send(response, 403, 'text/plain; charset=utf-8', 'forbidden');
        return;
      }
      send(response, 200, 'image/webp', await readFile(filePath));
      return;
    }
    send(response, 404, 'text/plain; charset=utf-8', 'not found');
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`贴纸命名工具：http://127.0.0.1:${port}/`);
});
