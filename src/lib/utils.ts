// 文案格式化工具：日期、字数统计（复刻旧站 word-count.js helper）。

// 构建机（Cloudflare Pages）时区是 UTC：所有日期/年份必须显式按东八区取，
// 否则 14:27 (+0800) 会被渲染成 06:27，甚至日期/年份跨界偏移一天。
export const TZ = 'Asia/Shanghai';

export function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TZ,
  });
}

/** 按东八区取年份（归档页年份分组、页脚版权年份用） */
export function yearInShanghai(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric' }).format(date));
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
