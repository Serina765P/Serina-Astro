// 后台「插入媒体组件」的纯逻辑：把表单参数变成可直接放进 .mdx 正文的 import 与标签，
// 并算出光标处的插入位置。
//
// 为什么单独一层：后台编辑器只认纯文本，组件要同时满足「顶部有 import」和「光标处有
// 标签」；这些字符串拼装、转义与去重都容易出错，放在 Vue 外面才测得到。DOM 与
// CodeMirror 的调度留在 MarkdownEditor.vue。

import playlist from '../data/music/netease-playlist.json';
import { bilibiliEmbed } from './bilibili';
import { isTrackId } from './music';

export const MEDIA_COMPONENTS = {
  music: {
    name: 'ArticleMusicPlayer',
    path: '../../components/music/ArticleMusicPlayer.astro',
    label: '网易云音乐播放器',
  },
  bilibili: {
    name: 'BilibiliPlayer',
    path: '../../components/media/BilibiliPlayer.astro',
    label: 'B 站视频播放器',
  },
} as const;

export type MediaKind = keyof typeof MEDIA_COMPONENTS;

/** 文章播放器只认快照里的曲目（ArticleMusicPlayer 构建期会校验），后台提前拦下 */
const SNAPSHOT_TRACK_IDS = new Set(playlist.items.map((item) => item.id));

export type MediaEmbedInput =
  | { kind: 'music'; track?: string | null }
  | { kind: 'bilibili'; bvid: string; p?: number | string; title?: string; cover?: string };

export interface MediaSnippet {
  kind: MediaKind;
  name: string;
  path: string;
  importLine: string;
  tag: string;
}

export interface MediaChange {
  from: number;
  to: number;
  insert: string;
}

export interface MediaInsertion {
  /** 已按 from 升序排列；CodeMirror 一个事务里一次应用 */
  changes: MediaChange[];
  /** 插入完成后光标应落在的文档位置 */
  anchor: number;
}

/**
 * JSX 属性值统一用带实体的双引号形式：引号/反斜杠/换行写成字符引用。
 * 不用 `{JSON.stringify(...)}` —— MDX 能编译，但 markdown-it 不把它当 HTML 标签，
 * 后台预览就认不出这个组件；实体形式两边都能解析。
 */
function attributeValue(value: string): string {
  return `"${value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('\\', '&#92;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;')}"`;
}

/**
 * 生成组件标签与 import。参数校验复用站点侧的真实规则（BV/p、曲目 id），
 * 后台不会造出构建期才报错的标签。
 */
export function mediaSnippet(input: MediaEmbedInput): MediaSnippet {
  const component = MEDIA_COMPONENTS[input.kind];
  const importLine = `import ${component.name} from '${component.path}';`;
  if (input.kind === 'music') {
    const track = input.track?.trim() ?? '';
    if (track && !isTrackId(track)) {
      throw new Error(`track 必须是纯数字的网易云曲目 id，收到 ${JSON.stringify(input.track)}`);
    }
    if (track && !SNAPSHOT_TRACK_IDS.has(track)) {
      throw new Error(
        `曲目 ${track} 不在歌单快照里；先运行 npm run music:snapshot，或从快照里选一首。`,
      );
    }
    return {
      kind: input.kind,
      name: component.name,
      path: component.path,
      importLine,
      tag: track ? `<${component.name} track="${track}" />` : `<${component.name} />`,
    };
  }

  const embed = bilibiliEmbed({
    bvid: input.bvid,
    p: input.p,
    title: input.title,
    cover: input.cover,
  });
  const title = input.title?.trim() ?? '';
  const attrs = [`bvid="${embed.bvid}"`];
  if (embed.page !== 1) attrs.push(`p={${embed.page}}`);
  if (title) attrs.push(`title=${attributeValue(title)}`);
  if (embed.cover) attrs.push(`cover=${attributeValue(embed.cover)}`);
  return {
    kind: input.kind,
    name: component.name,
    path: component.path,
    importLine,
    tag: `<${component.name} ${attrs.join(' ')} />`,
  };
}

/** 正文是否已有该组件的 import（容忍单双引号、行尾分号与缩进） */
export function hasMediaImport(body: string, snippet: MediaSnippet): boolean {
  const path = snippet.path.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(
    `^[\\t ]*import[\\t ]+${snippet.name}[\\t ]+from[\\t ]+(['"])${path}\\1[\\t ]*;?[\\t ]*$`,
    'm',
  );
  return pattern.test(body);
}

/** 文档开头连续的 import/空行之后的插入点；用于把光标在 0 位的标签排到 import 块下方 */
function importBlockEnd(doc: string): number {
  let offset = 0;
  let end = 0;
  let seenImport = false;
  for (const line of doc.split('\n')) {
    const trimmed = line.trim();
    if (/^import\s.+?from\s+['"].+?['"];?$/u.test(trimmed)) {
      seenImport = true;
      offset += line.length + 1;
      end = Math.min(offset, doc.length);
      continue;
    }
    if (seenImport && trimmed === '') {
      offset += line.length + 1;
      end = Math.min(offset, doc.length);
      continue;
    }
    break;
  }
  return end;
}

/** 标签前是否需要补空行：光标前有正文，或上一行有正文 */
function leadingBlank(doc: string, from: number): string {
  const start = doc.lastIndexOf('\n', from - 1) + 1;
  if (doc.slice(start, from).trim()) return '\n\n';
  if (start === 0) return '';
  const previousEnd = start - 1;
  const previousStart = doc.lastIndexOf('\n', previousEnd - 1) + 1;
  return doc.slice(previousStart, previousEnd).trim() ? '\n' : '';
}

/** 标签后是否需要补空行：光标后同一行有正文，或下一行有正文 */
function trailingBlank(doc: string, to: number): string {
  const nextNewline = doc.indexOf('\n', to);
  const end = nextNewline === -1 ? doc.length : nextNewline;
  if (doc.slice(to, end).trim()) return '\n\n';
  if (end >= doc.length) return '';
  const nextStart = end + 1;
  const followingNewline = doc.indexOf('\n', nextStart);
  const nextEnd = followingNewline === -1 ? doc.length : followingNewline;
  return doc.slice(nextStart, nextEnd).trim() ? '\n' : '';
}

/**
 * 计算「补 import + 在光标处插入标签」的事务。标签会被空行隔开，避免落进段落中间；
 * 光标原有选区会被替换，插入后停在标签末尾。
 */
export function planMediaInsertion(
  doc: string,
  from: number,
  to: number,
  snippet: MediaSnippet,
): MediaInsertion {
  // 用「替换/删除之后」的正文判断 import 是否还在：整段选中 import 再插入时不能把它弄丢
  const remaining = doc.slice(0, from) + doc.slice(to);
  const needsImport = !hasMediaImport(remaining, snippet);
  const prefix = needsImport ? `${snippet.importLine}\n\n` : '';
  // 光标停在开头且已有 import 时，标签排到 import 块之后，不把 import 和正文隔开
  const at = from === 0 && to === 0 ? importBlockEnd(doc) : from;
  const end = at === from ? to : at;
  const lead = leadingBlank(doc, at);
  const trail = trailingBlank(doc, end);
  const text = `${lead}${snippet.tag}${trail}`;

  // 插入点在 0 位时两个插入点重合，合并成一个 change，避免同位置插入的先后次序问题
  if (at === 0) {
    return {
      changes: [{ from: 0, to: end, insert: prefix + text }],
      anchor: prefix.length + lead.length + snippet.tag.length,
    };
  }

  const changes: MediaChange[] = [];
  if (prefix) changes.push({ from: 0, to: 0, insert: prefix });
  changes.push({ from: at, to: end, insert: text });
  return {
    changes,
    anchor: at + prefix.length + lead.length + snippet.tag.length,
  };
}
