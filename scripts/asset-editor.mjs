import { existsSync } from 'node:fs';
import { readdir, readFile, rename } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStickerCode } from './sticker-code.mjs';
import { writeRegistry } from './write-registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portIndex = process.argv.indexOf('--port');
const port = portIndex > 0 ? Number(process.argv[portIndex + 1]) : 4319;
const vueFile = path.join(root, 'node_modules', 'vue', 'dist', 'vue.esm-browser.prod.js');

const KINDS = {
  sticker: { folder: 'sticker', registry: 'src/data/stickers.json', suffixes: ['', '-still'] },
  emoji: { folder: 'emoji', registry: 'src/data/emoji.json', suffixes: [''] },
};
const OTHER = { sticker: 'emoji', emoji: 'sticker' };

function send(response, status, type, body) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
}

function sendJson(response, status, payload) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(payload));
}

async function readJson(file) {
  return JSON.parse(await readFile(path.join(root, file), 'utf8'));
}

async function writeJson(file, data) {
  await writeRegistry(path.join(root, file), data);
}

function assetPath(kind, code, suffix = 0) {
  return path.join(
    root,
    'public',
    KINDS[kind].folder,
    `${code}${KINDS[kind].suffixes[suffix]}.webp`,
  );
}

function assetUrl(kind, code, suffix = 0) {
  return `/${KINDS[kind].folder}/${code}${KINDS[kind].suffixes[suffix]}.webp`;
}

function deriveCode(set, label) {
  return `${set}_${label.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/gu, '')}`;
}

function parseKeywords(value) {
  return [
    ...new Set(
      String(value ?? '')
        .split(/[,，、]+/u)
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ];
}

function customKeywords(record) {
  const auto = new Set([record.label, record.setLabel, record.set]);
  return record.keywords.filter((word) => !auto.has(word));
}

function toClient(kind, record) {
  return {
    code: record.code,
    label: record.label,
    set: record.set,
    setLabel: record.setLabel,
    src: record.src,
    poster: record.poster ?? '',
    width: record.width,
    height: record.height,
    keywords: customKeywords(record).join(', '),
    kind,
  };
}

async function listFiles(dir, extensions) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full, extensions)));
    else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) files.push(full);
  }
  return files;
}

/** 正文与说说里对短代码的引用，用于改名前提示。 */
async function scanUsage() {
  const files = [
    ...(await listFiles(path.join(root, 'src', 'content'), ['.md', '.mdx'])),
    ...(await listFiles(path.join(root, 'src', 'data', 'shuoshuo'), ['.json'])),
  ];
  const usage = new Map();
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/:([\p{L}\p{N}_-]+):/gu)) {
        const code = match[1];
        if (!usage.has(code)) usage.set(code, []);
        usage.get(code).push(`${relative}:${index + 1}`);
      }
    });
  }
  return usage;
}

function planMoves(kind, records, nextCodes) {
  const moves = [];
  for (const record of records) {
    const code = nextCodes.get(record.code);
    if (!code || code === record.code) continue;
    KINDS[kind].suffixes.forEach((suffix, index) => {
      const from = assetPath(kind, record.code, index);
      const to = assetPath(kind, code, index);
      if (!existsSync(from)) throw new Error(`缺少文件：${path.basename(from)}`);
      moves.push({ from, to, suffix });
    });
  }
  const sources = new Set(moves.map((move) => move.from));
  for (const move of moves) {
    if (existsSync(move.to) && !sources.has(move.to))
      throw new Error(`目标文件已存在：${path.basename(move.to)}`);
  }
  return moves;
}

async function applyMoves(moves) {
  const stamps = moves.map((move, index) => `${move.from}.__tmp-${index}-${Date.now()}`);
  for (let index = 0; index < moves.length; index += 1)
    await rename(moves[index].from, stamps[index]);
  for (let index = 0; index < moves.length; index += 1)
    await rename(stamps[index], moves[index].to);
}

/** 只有真正改动过的记录才重排关键词，未改动的保持原样，避免整表格式化噪声。 */
function mergeKeywords(record, label, setLabel, input) {
  const auto = new Set([record.label, record.setLabel, record.set]);
  const current = record.keywords.filter((word) => !auto.has(word));
  const sameInput =
    current.length === input.length && current.every((word, index) => word === input[index]);
  if (sameInput) {
    const replaced = record.keywords.map((word) => {
      if (word === record.label) return label;
      if (word === record.setLabel) return setLabel;
      return word;
    });
    return [...new Set(replaced)];
  }
  return [...new Set([label, setLabel, record.set, ...input])];
}

function nextRecord(kind, record, { code, label, setLabel, keywords }) {
  const updated = {
    ...record,
    code,
    label,
    setLabel,
    src: assetUrl(kind, code),
    keywords: mergeKeywords(record, label, setLabel, keywords),
  };
  if (record.poster) updated.poster = assetUrl(kind, code, 1);
  return updated;
}

async function save(kind, items, setLabels) {
  const config = KINDS[kind];
  const records = await readJson(config.registry);
  if (!Array.isArray(items) || items.length !== records.length)
    throw new Error('提交的条目数与注册表不一致，请刷新页面后重试');

  const otherCodes = new Set((await readJson(KINDS[OTHER[kind]].registry)).map((r) => r.code));
  const byCode = new Map(records.map((record) => [record.code, record]));
  const planned = new Map();
  const taken = new Set();
  for (const item of items) {
    const record = byCode.get(item?.code);
    if (!record) throw new Error(`未知短代码：${item?.code}`);
    if (planned.has(item.code)) throw new Error(`重复提交：${item.code}`);
    const label = String(item.label ?? '').trim();
    if (!label) throw new Error(`名称不能为空：${record.code}`);
    if (label.length > 40) throw new Error(`名称过长（最多 40 字）：${label}`);
    const code = String(item.nextCode ?? '').trim() || deriveCode(record.set, label);
    assertStickerCode(code);
    if (!code.startsWith(`${record.set}_`))
      throw new Error(`短代码必须以 ${record.set}_ 开头：${code}`);
    if (taken.has(code) || otherCodes.has(code)) throw new Error(`短代码重复：${code}`);
    taken.add(code);
    planned.set(item.code, { code, label, keywords: parseKeywords(item.keywords) });
  }

  const labels = new Map();
  for (const record of records) {
    const value = String(setLabels?.[record.set] ?? '').trim();
    labels.set(record.set, value || record.setLabel);
  }

  const nextCodes = new Map([...planned].map(([code, plan]) => [code, plan.code]));
  const moves = planMoves(kind, records, nextCodes);
  if (moves.length) await applyMoves(moves);

  const usage = await scanUsage();
  const warnings = [];
  const next = records.map((record) => {
    const plan = planned.get(record.code);
    if (plan.code !== record.code) {
      const refs = usage.get(record.code);
      if (refs?.length)
        warnings.push(
          `:${record.code}: → :${plan.code}:，以下位置仍引用旧短代码：${refs.join('、')}`,
        );
    }
    const updated = nextRecord(kind, record, {
      code: plan.code,
      label: plan.label,
      setLabel: labels.get(record.set),
      keywords: plan.keywords,
    });
    return updated;
  });

  await writeJson(config.registry, next);
  return { records: next.map((record) => toClient(kind, record)), warnings };
}

async function renamePrefix(kind, set, prefix) {
  if (!/^[a-z0-9]+$/u.test(prefix)) throw new Error('前缀只能使用小写英文字母和数字');
  const records = await readJson(KINDS[kind].registry);
  const affected = records.filter((record) => record.set === set);
  if (!affected.length) throw new Error(`没有代号为 ${set} 的套装`);
  const otherCodes = new Set((await readJson(KINDS[OTHER[kind]].registry)).map((r) => r.code));
  const nextCodes = new Map();
  const taken = new Set();
  for (const record of records) {
    if (record.set !== set) {
      taken.add(record.code);
      continue;
    }
    const code = `${prefix}_${record.code.slice(set.length + 1)}`;
    assertStickerCode(code);
    if (taken.has(code) || otherCodes.has(code)) throw new Error(`短代码重复：${code}`);
    taken.add(code);
    nextCodes.set(record.code, code);
  }

  const moves = planMoves(kind, records, nextCodes);
  if (moves.length) await applyMoves(moves);

  const next = records.map((record) => {
    if (record.set !== set) return record;
    const code = nextCodes.get(record.code);
    const updated = {
      ...record,
      set: prefix,
      code,
      src: assetUrl(kind, code),
      keywords: record.keywords.map((word) => (word === set ? prefix : word)),
    };
    if (record.poster) updated.poster = assetUrl(kind, code, 1);
    return updated;
  });
  await writeJson(KINDS[kind].registry, next);
  return next.map((record) => toClient(kind, record));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
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

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>素材控制台</title>
<style>
  :root {
    color-scheme: light dark;
    --line: #d5d7dd;
    --line-strong: #b9bdc6;
    --sub: #5f6470;
    --ink: #14161a;
    --surface: #ffffff;
    --surface-2: #f2f3f6;
    --accent: #b3124f;
    --danger: #c62828;
    --ok: #1b6e3c;
    --radius: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --line: #33373f;
      --line-strong: #474c56;
      --sub: #a0a6b3;
      --ink: #eef0f4;
      --surface: #191c21;
      --surface-2: #22262c;
      --accent: #f2689b;
      --danger: #ef7b7b;
      --ok: #6fcf97;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    font: 17px/1.55 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--ink);
    background: var(--surface);
  }
  [v-cloak] { display: none; }
  header {
    position: sticky; top: 0; z-index: 5;
    display: flex; flex-wrap: wrap; align-items: center; gap: 18px;
    padding: 16px 26px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    box-shadow: 0 1px 8px rgba(0,0,0,.05);
  }
  h1 { margin: 0; font-size: 19px; letter-spacing: .01em; }
  header .hint { margin: 2px 0 0; font-size: 13px; color: var(--sub); }
  .tabs { display: flex; gap: 6px; padding: 4px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface-2); }
  .tabs button {
    font: inherit; font-size: 15px; padding: 8px 18px; border: 0; border-radius: 9px;
    background: transparent; color: var(--sub); cursor: pointer;
  }
  .tabs button.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.12); font-weight: 600; }
  .tabs b { font-weight: 500; font-size: 13px; opacity: .75; margin-left: 4px; }
  .tools { display: flex; align-items: center; gap: 12px; margin-left: auto; flex-wrap: wrap; }
  .search {
    font: inherit; font-size: 15px; min-width: 260px; padding: 9px 13px;
    border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); color: var(--ink);
  }
  .check { display: flex; align-items: center; gap: 7px; font-size: 14px; color: var(--sub); }
  .check input { width: 17px; height: 17px; accent-color: var(--accent); }
  #status { font-size: 14px; color: var(--sub); min-width: 90px; }
  button.primary {
    font: inherit; font-size: 15px; font-weight: 600; padding: 10px 24px;
    border: 0; border-radius: 999px; background: var(--accent); color: #fff; cursor: pointer;
  }
  button.primary:disabled { opacity: .45; cursor: not-allowed; }
  main { padding: 22px 26px 90px; }
  .group + .group { margin-top: 34px; }
  .group-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  .group-head h2 { margin: 0; font-size: 17px; display: flex; align-items: center; gap: 10px; }
  .chip { font: 13px/1 ui-monospace, "Cascadia Mono", Consolas, monospace; padding: 6px 10px; border-radius: 999px; background: var(--surface-2); color: var(--sub); }
  .setlabel {
    font: inherit; font-size: 16px; font-weight: 600; padding: 7px 11px; min-width: 200px;
    border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--ink);
  }
  .setlabel:hover { border-color: var(--line); }
  .setlabel:focus { border-color: var(--accent); outline: none; background: var(--surface); }
  .count { font-size: 14px; color: var(--sub); }
  .prefix { display: flex; align-items: center; gap: 6px; margin-left: auto; font-size: 13px; color: var(--sub); }
  .prefix input {
    font: 14px/1 ui-monospace, Consolas, monospace; width: 88px; padding: 7px 9px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink);
  }
  .prefix button {
    font: inherit; font-size: 13px; padding: 7px 12px; border-radius: 8px;
    border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer;
  }
  .prefix button:disabled { opacity: .45; cursor: not-allowed; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); }
  .card {
    display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 14px; align-items: center;
    padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
  }
  .card.dirty { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(179,18,79,.08); }
  .card.bad { border-color: var(--danger); }
  .thumb {
    width: 104px; height: 104px; padding: 4px; border: 0; border-radius: 10px;
    background: var(--surface-2); cursor: pointer; display: grid; place-items: center;
  }
  .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .fields { display: grid; gap: 7px; min-width: 0; }
  .name {
    font: inherit; font-size: 16px; font-weight: 600; width: 100%; padding: 8px 11px;
    border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--ink);
  }
  .code-row { display: flex; align-items: center; gap: 4px; }
  .code-row .colon { color: var(--sub); font-family: ui-monospace, Consolas, monospace; }
  .code {
    font: 13.5px/1 ui-monospace, "Cascadia Mono", Consolas, monospace; flex: 1; min-width: 0; padding: 8px 9px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--ink);
  }
  .ghost {
    font: inherit; font-size: 14px; padding: 6px 9px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--surface); color: var(--sub); cursor: pointer;
  }
  .kw {
    font: inherit; font-size: 13.5px; width: 100%; padding: 7px 11px;
    border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--sub);
  }
  .name:focus, .code:focus, .kw:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .meta { margin: 0; display: flex; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--sub); }
  .meta .used { color: var(--ok); }
  .meta .err { color: var(--danger); font-weight: 600; }
  .empty { padding: 60px 0; text-align: center; color: var(--sub); }
</style>
</head>
<body>
<div id="app" v-cloak>
  <header>
    <div>
      <h1>素材控制台</h1>
      <p class="hint">改名称、短代码、关键词；保存后同步文件名。悬停缩略图播放动图。</p>
    </div>
    <nav class="tabs">
      <button type="button" :class="{ active: kind === 'sticker' }" @click="switchKind('sticker')">贴纸<b>{{ counts.sticker }}</b></button>
      <button type="button" :class="{ active: kind === 'emoji' }" @click="switchKind('emoji')">表情<b>{{ counts.emoji }}</b></button>
    </nav>
    <div class="tools">
      <input class="search" type="search" v-model="query" placeholder="筛选名称、短代码或关键词" />
      <label class="check"><input type="checkbox" v-model="onlyDirty" /> 只看已修改</label>
      <span id="status">{{ statusText }}</span>
      <button class="primary" type="button" :disabled="!canSave" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
    </div>
  </header>

  <main>
    <section class="group" v-for="group in groups" :key="group.set">
      <div class="group-head">
        <h2>
          <span class="chip">{{ group.set }}</span>
          <input class="setlabel" :value="setLabels[group.set]" @input="setSetLabel(group.set, $event.target.value)" />
        </h2>
        <span class="count">{{ group.items.length }} / {{ group.total }} 项</span>
        <span class="prefix">
          前缀
          <input :value="prefixes[group.set]" @input="prefixes[group.set] = $event.target.value" />
          <button type="button" :disabled="prefixes[group.set] === group.set" @click="applyPrefix(group)">应用</button>
        </span>
      </div>

      <div class="grid">
        <article class="card" v-for="item in group.items" :key="item.code" :class="{ dirty: isDirty(item), bad: item.error }">
          <button class="thumb" type="button" @pointerenter="hoverKey = item.code" @pointerleave="hoverKey = ''" @focus="hoverKey = item.code" @blur="hoverKey = ''">
            <img :src="hoverKey === item.code ? item.src : (item.poster || item.src)" :alt="item.label" loading="lazy" />
          </button>
          <div class="fields">
            <input class="name" :value="item.label" @input="setLabel(item, $event.target.value)" spellcheck="false" />
            <div class="code-row">
              <span class="colon">:</span>
              <input class="code" :value="item.nextCode" @input="setCode(item, $event.target.value)" spellcheck="false" />
              <span class="colon">:</span>
              <button v-if="!item.follow" class="ghost" type="button" @click="resetCode(item)" title="改回跟随名称">↺</button>
            </div>
            <input class="kw" :value="item.keywords" @input="item.keywords = $event.target.value" placeholder="关键词，逗号分隔" spellcheck="false" />
            <p class="meta">
              <span v-if="item.error" class="err">{{ item.error }}</span>
              <span v-if="usage[item.code]" class="used" :title="usageTitle(item)">正文引用 {{ usage[item.code].length }} 处</span>
              <span>{{ item.width }}×{{ item.height }}</span>
            </p>
          </div>
        </article>
      </div>
    </section>
    <p class="empty" v-if="!groups.length">没有匹配的条目</p>
  </main>
</div>

<script type="module">
  import { createApp } from '/vendor/vue.js';

  const CODE_PATTERN = /^[a-z0-9]+_[\\p{L}\\p{N}_-]+$/u;

  function slug(label) {
    return label.replace(/[^\\p{L}\\p{N}_-]+/gu, '_').replace(/^_+|_+$/gu, '');
  }

  createApp({
    data() {
      return {
        kind: 'sticker',
        records: { sticker: [], emoji: [] },
        usage: {},
        query: '',
        onlyDirty: false,
        saving: false,
        hoverKey: '',
        setLabels: {},
        prefixes: {},
        status: '',
      };
    },
    computed: {
      counts() {
        return { sticker: this.records.sticker.length, emoji: this.records.emoji.length };
      },
      current() {
        return this.records[this.kind];
      },
      groups() {
        const query = this.query.trim().toLowerCase();
        const bySet = new Map();
        for (const item of this.current) {
          const hit =
            !query ||
            item.label.toLowerCase().includes(query) ||
            item.nextCode.toLowerCase().includes(query) ||
            item.keywords.toLowerCase().includes(query);
          if (!hit || (this.onlyDirty && !this.isDirty(item))) continue;
          if (!bySet.has(item.set)) bySet.set(item.set, { set: item.set, items: [], total: 0 });
          const group = bySet.get(item.set);
          group.items.push(item);
          group.total = this.current.filter((entry) => entry.set === item.set).length;
        }
        return [...bySet.values()];
      },
      conflicts() {
        const seen = new Map();
        for (const kind of ['sticker', 'emoji']) {
          for (const item of this.records[kind]) {
            const code = item.nextCode;
            seen.set(code, (seen.get(code) ?? 0) + 1);
          }
        }
        let total = 0;
        for (const item of this.current) if (seen.get(item.nextCode) > 1) total += 1;
        return total;
      },
      dirtyCount() {
        return this.current.filter((item) => this.isDirty(item)).length;
      },
      canSave() {
        return this.dirtyCount > 0 && this.conflicts === 0 && !this.saving;
      },
      statusText() {
        if (this.status) return this.status;
        if (this.conflicts) return this.conflicts + ' 处短代码冲突';
        return this.dirtyCount ? this.dirtyCount + ' 处未保存' : '共 ' + this.current.length + ' 项';
      },
    },
    methods: {
      derive(item) {
        return item.set + '_' + slug(item.label);
      },
      isDirty(item) {
        return (
          item.label !== item.original.label ||
          item.nextCode !== item.original.nextCode ||
          item.keywords !== item.original.keywords ||
          this.setLabels[item.set] !== item.setLabel
        );
      },
      refreshErrors() {
        const counts = new Map();
        for (const kind of ['sticker', 'emoji'])
          for (const item of this.records[kind])
            counts.set(item.nextCode, (counts.get(item.nextCode) ?? 0) + 1);
        for (const item of this.current) {
          if (!item.label.trim()) item.error = '名称不能为空';
          else if (!CODE_PATTERN.test(item.nextCode)) item.error = '短代码格式无效';
          else if (!item.nextCode.startsWith(item.set + '_')) item.error = '必须以 ' + item.set + '_ 开头';
          else if (counts.get(item.nextCode) > 1) item.error = '短代码冲突';
          else item.error = '';
        }
      },
      setLabel(item, value) {
        item.label = value;
        if (item.follow) item.nextCode = this.derive(item);
        this.refreshErrors();
      },
      setCode(item, value) {
        item.nextCode = value;
        item.follow = false;
        this.refreshErrors();
      },
      resetCode(item) {
        item.follow = true;
        item.nextCode = this.derive(item);
        this.refreshErrors();
      },
      usageTitle(item) {
        return (this.usage[item.code] ?? []).join(' · ');
      },
      setSetLabel(set, value) {
        this.setLabels[set] = value;
      },
      hydrate(kind, records) {
        this.records[kind] = records.map((record) => ({
          ...record,
          nextCode: record.code,
          follow: true,
          error: '',
          original: { label: record.label, nextCode: record.code, keywords: record.keywords },
        }));
        for (const record of records) this.setLabels[record.set] = record.setLabel;
        for (const record of records) if (!this.prefixes[record.set]) this.prefixes[record.set] = record.set;
      },
      switchKind(kind) {
        this.kind = kind;
        this.query = '';
        this.onlyDirty = false;
        this.status = '';
      },
      async load() {
        const response = await fetch('/api/data');
        const payload = await response.json();
        this.usage = payload.usage;
        this.hydrate('sticker', payload.records.sticker);
        this.hydrate('emoji', payload.records.emoji);
        this.refreshErrors();
      },
      async save() {
        this.saving = true;
        this.status = '';
        const payload = {
          kind: this.kind,
          items: this.current.map((item) => ({
            code: item.code,
            nextCode: item.nextCode,
            label: item.label,
            keywords: item.keywords,
          })),
          setLabels: Object.fromEntries(
            [...new Set(this.current.map((item) => item.set))].map((set) => [set, this.setLabels[set]]),
          ),
        };
        try {
          const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          this.hydrate(this.kind, result.records);
          this.refreshErrors();
          this.usage = (await (await fetch('/api/data')).json()).usage;
          this.status = result.warnings.length
            ? '已保存，但有 ' + result.warnings.length + ' 处正文仍引用旧短代码'
            : '已保存';
          if (result.warnings.length) console.warn(result.warnings.join('\\n'));
        } catch (error) {
          this.status = String(error.message ?? error);
        } finally {
          this.saving = false;
        }
      },
      async applyPrefix(group) {
        const prefix = (this.prefixes[group.set] ?? '').trim();
        if (!/^[a-z0-9]+$/.test(prefix)) {
          this.status = '前缀只能使用小写字母和数字';
          return;
        }
        const ok = confirm('把 ' + group.set + '_* 全部改成 ' + prefix + '_*？会重命名 ' + group.total * (this.kind === 'sticker' ? 2 : 1) + ' 个文件，并让正文里的旧短代码失效。');
        if (!ok) return;
        try {
          const response = await fetch('/api/prefix', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: this.kind, set: group.set, prefix }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          this.prefixes[group.set] = prefix;
          this.hydrate(this.kind, result.records);
          this.refreshErrors();
          this.status = '前缀已改为 ' + prefix;
        } catch (error) {
          this.status = String(error.message ?? error);
        }
      },
    },
    mounted() {
      this.load().catch((error) => {
        this.status = '加载失败：' + String(error.message ?? error);
      });
    },
  }).mount('#app');
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
    if (request.method === 'GET' && url.pathname === '/favicon.ico') {
      send(response, 204, 'text/plain; charset=utf-8', '');
      return;
    }
    if (request.method === 'GET' && url.pathname === '/vendor/vue.js') {
      send(response, 200, 'text/javascript; charset=utf-8', await readFile(vueFile));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/data') {
      const [sticker, emoji, usage] = await Promise.all([
        readJson(KINDS.sticker.registry),
        readJson(KINDS.emoji.registry),
        scanUsage(),
      ]);
      sendJson(response, 200, {
        records: {
          sticker: sticker.map((record) => toClient('sticker', record)),
          emoji: emoji.map((record) => toClient('emoji', record)),
        },
        usage: Object.fromEntries(usage),
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/save') {
      const body = JSON.parse(await readBody(request));
      if (!KINDS[body.kind]) throw new Error('未知素材类型');
      const result = await save(body.kind, body.items, body.setLabels);
      sendJson(response, 200, result);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/prefix') {
      const body = JSON.parse(await readBody(request));
      if (!KINDS[body.kind]) throw new Error('未知素材类型');
      sendJson(response, 200, { records: await renamePrefix(body.kind, body.set, body.prefix) });
      return;
    }
    const match = url.pathname.match(/^\/(sticker|emoji)\/(.+\.webp)$/u);
    if (request.method === 'GET' && match) {
      const kind = match[1] === 'sticker' ? 'sticker' : 'emoji';
      const name = decodeURIComponent(match[2]);
      const file = path.join(root, 'public', KINDS[kind].folder, name);
      if (path.dirname(file) !== path.join(root, 'public', KINDS[kind].folder)) {
        send(response, 403, 'text/plain; charset=utf-8', 'forbidden');
        return;
      }
      send(response, 200, 'image/webp', await readFile(file));
      return;
    }
    send(response, 404, 'text/plain; charset=utf-8', 'not found');
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`素材控制台：http://127.0.0.1:${port}/`);
});
