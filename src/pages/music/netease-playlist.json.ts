import type { APIRoute } from 'astro';
import playlist from '../../data/music/netease-playlist.json';

// 全站 BGM 的歌单快照：静态端点，首次点击播放时才请求。
// 为什么不把 73 首直接内联进每页 HTML：那是 5KB gzip × 每页，而 BGM 是手动启动的。
export const GET: APIRoute = () =>
  new Response(JSON.stringify(playlist.items), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
