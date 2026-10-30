// Bilibili 官方播放器的数据适配层（纯函数，无副作用）。
//
// 边界（issue #9）：只接受 BV 号与分 P，不解析 aid/cid —— 父页面拿不到 pagelist
// （对第三方 Origin 恒 403，见 docs/research/bilibili-static-embed.md），而官方播放器
// 自己支持 bvid + p。`autoplay=0` 必须显式写：播放器源码默认 autoplay=true。
//
// 这里生成的 URL 是页面打开时的唯一一份真相：组件把它写进标记，运行时原样塞给 iframe。

const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;
const PAGE_PATTERN = /^[1-9]\d*$/;

const PLAYER_URL = 'https://player.bilibili.com/player.html';
const VIDEO_URL = 'https://www.bilibili.com/video';

/** BV 号：BV + 10 位字母数字（大小写敏感，B 与 V 必须大写） */
export function isBvid(value: unknown): value is string {
  return typeof value === 'string' && BVID_PATTERN.test(value);
}

/** 分 P 从 1 开始；MDX 的非表达式属性传进来是字符串，接受去掉空白的十进制写法 */
function parsePage(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!PAGE_PATTERN.test(trimmed)) return null;
  const page = Number(trimmed);
  return Number.isSafeInteger(page) ? page : null;
}

/** 官方外链播放器：bvid + p，不传 cid（cid 存在时 p 会被忽略） */
export function bilibiliPlayerUrl(bvid: string, page = 1): string {
  return `${PLAYER_URL}?bvid=${bvid}&p=${page}&autoplay=0`;
}

/** 原视频回退链接：播放器加载失败、以及页脚「在 B 站观看」都用它 */
export function bilibiliVideoUrl(bvid: string, page = 1): string {
  return `${VIDEO_URL}/${bvid}?p=${page}`;
}

export interface BilibiliEmbed {
  bvid: string;
  page: number;
  /** iframe 地址（同一份也写进 data 属性供运行时使用） */
  playerUrl: string;
  /** B 站原视频页 */
  videoUrl: string;
  /** iframe 的 title 与入口按钮的可访问名称 */
  title: string;
}

interface BilibiliInput {
  bvid: unknown;
  p?: unknown;
  title?: unknown;
}

/**
 * 校验组件入参并一次性算出所有地址。
 * 构建期抛错比渲染一个坏 iframe 好：错误信息直接指向文章里的那一次调用。
 */
export function bilibiliEmbed({ bvid, p, title }: BilibiliInput): BilibiliEmbed {
  if (!isBvid(bvid)) {
    throw new Error(
      `BilibiliPlayer: bvid 必须是 BV + 10 位字母数字（如 BV1aYxg6DEXb），收到 ${JSON.stringify(bvid)}`,
    );
  }
  const page = p === undefined ? 1 : parsePage(p);
  if (page === null) {
    throw new Error(`BilibiliPlayer: p 必须是从 1 开始的正整数，收到 ${JSON.stringify(p)}`);
  }
  const custom = typeof title === 'string' ? title.trim() : '';
  return {
    bvid,
    page,
    playerUrl: bilibiliPlayerUrl(bvid, page),
    videoUrl: bilibiliVideoUrl(bvid, page),
    title: custom || `B 站视频 ${bvid} 第 ${page} P`,
  };
}
