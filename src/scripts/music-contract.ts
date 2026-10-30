// 媒体播放器标记与运行时之间的最小契约。
//
// 选择器只写一份：loader 要知道点到了什么才去拉运行时，运行时要用同一份表决定动作，
// 两处各写一遍就会出现「新增控件漏接」的静默 bug。中断事件名也放这里：音乐播放器与
// B 站视频运行时派发/监听的是同一个字符串，各自写字面量迟早会拼错一个。
export const MUSIC_TRIGGER_SELECTOR = '[data-music-play], [data-music-prev], [data-music-next]';

/** 播放互斥事件：任何媒体（音乐播放器、B 站视频）开始时派发，其它播放器暂停且不自动恢复 */
export const MUSIC_INTERRUPT_EVENT = 'music:interrupt';
