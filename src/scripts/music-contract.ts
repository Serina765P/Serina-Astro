// 播放器标记（Astro 组件）与运行时（music.ts / music-loader.ts）之间的最小契约。
//
// 选择器只写一份：loader 要知道点到了什么才去拉运行时，运行时要用同一份表决定动作，
// 两处各写一遍就会出现「新增控件漏接」的静默 bug。
export const MUSIC_TRIGGER_SELECTOR = '[data-music-play], [data-music-prev], [data-music-next]';
