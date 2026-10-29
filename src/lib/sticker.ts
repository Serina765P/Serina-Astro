import stickerData from '../data/stickers.json';

export interface CustomSticker {
  code: string;
  label: string;
  set: string;
  setLabel: string;
  /** 动画 WebP，行内短代码直接使用。 */
  src: string;
  /** 尾帧静态 WebP，图鉴里默认显示，悬停时换成 src。 */
  poster: string;
  width: number;
  height: number;
  keywords: string[];
}

export const STICKER = stickerData as CustomSticker[];
