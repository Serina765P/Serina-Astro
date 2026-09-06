// 文案格式化工具：日期、字数统计（复刻旧站 word-count.js helper）。

export function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 剥离 Markdown 与 HTML 标记后统计：中文字符按字计，英文按词计 */
export function wordcount(text: string): number {
  const plain = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~\-|]/g, ' ');
  const cjk = plain.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0;
  const words = plain.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ').match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjk + words;
}

export function readingTime(text: string): number {
  return Math.max(1, Math.ceil(wordcount(text) / 250));
}

export function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return String(n);
}
