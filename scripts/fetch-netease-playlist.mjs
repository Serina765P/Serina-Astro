// 网易云歌单快照生成器（只在本地/发布前运行，不进站点运行时）。
//
// 为什么不用第三方 Meting 接口在浏览器里取数据：那会把读者的请求发到与本站无关的
// 服务上，且它的可用性、限流与响应结构都不受本站控制。这里只把「生成快照」这一步
// 放在构建机：产物是仓库里的 JSON，站点运行时不再访问任何第三方 API。
//
// 音频地址也不写进快照：网易云的音频直链带时效签名（几分钟后失效），必须由浏览器
// 当场访问第一方跳转地址 https://music.163.com/song/media/outer/url?id=<id>.mp3。
// 该接口对不可播曲目（版权/地区/VIP）会 302 到 music.163.com/404 的 HTML，浏览器
// 表现为 MEDIA_ERR_SRC_NOT_SUPPORTED —— 由前端展示失败态，不在这里剔除。
//
// 用法：node scripts/fetch-netease-playlist.mjs
// 需要网络；失败时不写文件、不覆盖既有快照。

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PLAYLIST_ID = '8562312822';
const API = 'https://api.i-meto.com/meting/api';
const OUT = path.resolve(
  import.meta.dirname,
  '..',
  'src',
  'data',
  'music',
  'netease-playlist.json',
);
const COVER_SIZE = 'param=300y300';
const CONCURRENCY = 4;

const log = (message) => console.log(`[music] ${message}`);

async function request(url, tries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < tries) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError;
}

/** Meting 的 url 字段里带歌曲 id，比标题可靠（同名曲目会重复） */
function songIdFromUrl(url) {
  try {
    return new URL(url).searchParams.get('id') ?? '';
  } catch {
    return '';
  }
}

/** pic 接口 302 到 p*.music.126.net 的第一方图片地址，只有最终地址可长期引用 */
async function resolveCover(picUrl) {
  const response = await request(picUrl);
  const resolved = new URL(response.url);
  resolved.search = `?${COVER_SIZE}`;
  resolved.hash = '';
  return resolved.href;
}

async function main() {
  log(`读取歌单 ${PLAYLIST_ID}`);
  const listResponse = await request(`${API}?server=netease&type=playlist&id=${PLAYLIST_ID}`);
  const raw = await listResponse.json();
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('歌单响应为空');

  const items = raw.map((entry) => ({
    id: songIdFromUrl(String(entry.url ?? '')),
    title: String(entry.title ?? '').trim(),
    artist: String(entry.author ?? '').trim(),
    pic: String(entry.pic ?? ''),
  }));
  const invalid = items.filter((item) => !item.id || !item.title);
  if (invalid.length > 0) throw new Error(`歌单条目缺少 id 或标题：${invalid.length} 条`);

  const seen = new Set();
  const tracks = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    tracks.push(item);
  }

  log(`解析 ${tracks.length} 张封面`);
  for (let index = 0; index < tracks.length; index += CONCURRENCY) {
    const slice = tracks.slice(index, index + CONCURRENCY);
    const covers = await Promise.all(slice.map((track) => resolveCover(track.pic)));
    slice.forEach((track, offset) => {
      track.cover = covers[offset];
      delete track.pic;
    });
    log(`  封面 ${Math.min(index + CONCURRENCY, tracks.length)}/${tracks.length}`);
  }

  const snapshot = {
    source: `https://music.163.com/playlist?id=${PLAYLIST_ID}`,
    provider: `${API}?server=netease&type=playlist&id=${PLAYLIST_ID}`,
    fetched_at: new Date().toISOString(),
    count: tracks.length,
    items: tracks,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  log(`已写入 ${path.relative(process.cwd(), OUT)}（${tracks.length} 首）`);
}

await main();
