// 文章文件的 frontmatter 切分与重组。
// 只替换 frontmatter 块：正文按原字节保留，换行风格（LF / CRLF）跟随源文件。

const FRONTMATTER_PATTERN = /^(---[ \t]*)(\r\n|\n)([\s\S]*?)(\r?\n)(---[ \t]*)(\r?\n)?/u;

function eolOf(kind) {
  return kind === 'crlf' ? '\r\n' : '\n';
}

/** 以文件第一行的换行判定风格：只重写 frontmatter，正文保持原字节。 */
export function detectLineEnding(raw) {
  const index = raw.indexOf('\n');
  return index > 0 && raw.charCodeAt(index - 1) === 13 ? 'crlf' : 'lf';
}

/**
 * 切成 BOM、前后分隔线、YAML 文本与正文；没有 frontmatter 时返回 null。
 * 分隔线本身的空格与结尾换行都保留，重组时不会平白多出空行。
 */
export function splitPostSource(raw) {
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  const source = bom ? raw.slice(1) : raw;
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) return null;
  return {
    bom,
    opener: match[1],
    closer: match[5],
    yaml: match[3],
    hasClosingEol: match[6] !== undefined,
    body: source.slice(match[0].length),
    lineEnding: detectLineEnding(raw),
  };
}

/** YAML 序列化统一用 LF；写回 CRLF 文件时再整体转换，避免混入裸 \n。 */
export function joinPostSource(part, yamlText) {
  const eol = eolOf(part.lineEnding);
  const frontmatter = yamlText.replace(/\n+$/u, '');
  const lines = frontmatter
    ? `${part.opener}${eol}${frontmatter.replace(/\n/gu, eol)}${eol}`
    : `${part.opener}${eol}`;
  const closing = `${part.closer}${part.hasClosingEol ? eol : ''}`;
  return `${part.bom}${lines}${closing}${part.body}`;
}

export function createPostSource(yamlText) {
  const frontmatter = yamlText.replace(/\n+$/u, '');
  return `---\n${frontmatter}${frontmatter ? '\n' : ''}---\n`;
}

/**
 * 保留源文件已有的块序列缩进与 flow 集合留白风格。
 * 仓库里既有 `tags:\n  - x` 也有 `tags:\n- x`，reserialize 时不能一刀切。
 */
export function detectYamlStyle(yamlText) {
  const lines = yamlText.split(/\r?\n/u);
  const indentedSequence = lines.some((line) => /^[ \t]+- /u.test(line));
  const flushSequence = lines.some((line) => /^- /u.test(line));
  const flowLines = lines.filter((line) => /\[[^\]]*\]|\{[^}]*\}/u.test(line));
  const paddedFlow = flowLines.some((line) => /\[\s+\S|\S\s+\]|\{\s+\S|\S\s+\}/u.test(line));
  const tightFlow = flowLines.some((line) => /\[[^\s\]]|\{\s*\}|\S\]/u.test(line));

  return {
    indentSeq: !(flushSequence && !indentedSequence),
    ...(tightFlow && !paddedFlow ? { flowCollectionPadding: false } : {}),
  };
}

export function yamlOptionsFor(part) {
  return { lineWidth: 0, ...detectYamlStyle(part.yaml) };
}
