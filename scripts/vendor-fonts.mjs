// 落地江城圆体（ZeoSeven item 59，OFL-1.1）的分字重 CSS + woff2 全量自托管。
// 为什么自托管：fontsapi.zeoseven.com 在部分浏览器环境（去广告/隐私拦截）下 woff2
// 请求被 204 空响应劫持，字体永远回退系统字体——本地文件不受影响。
// ZeoSeven 的分字重 CSS 不声明 font-weight（同 family 多份会全按 400 注册互相覆盖），
// 下载后补声明；src 里的 local() 一并移除（本地装有任意字重时会错配）。
// 字体升级/换字重时重跑：node scripts/vendor-fonts.mjs
import { mkdir, writeFile } from 'node:fs/promises';

const FONT_ID = 59;
// 注意：main 即 500W 切片，没有 /500w/ 路径
const WEIGHTS = [
  { weight: 400, path: '400w' },
  { weight: 500, path: 'main' },
  { weight: 700, path: '700w' },
];
const OUT_CSS_DIR = 'public/fonts';
const OUT_FILES_DIR = 'public/fonts/files';
const CDN = `https://fontsapi.zeoseven.com/${FONT_ID}`;

await mkdir(OUT_CSS_DIR, { recursive: true });

for (const { weight, path } of WEIGHTS) {
  const upstream = `${CDN}/${path}/result.css`;
  const res = await fetch(upstream);
  if (!res.ok) throw new Error(`${upstream} -> ${res.status}`);
  let css = await res.text();

  // 移除 local() 回退：三个字重共用同一 local 名，本机装过字体会错配
  css = css.replaceAll('local("JiangChengYuanTi"),', '');
  // 相对 woff2 路径 → CDN 绝对路径（后续下载与本地化改写都基于绝对路径）
  css = css.replaceAll('url("./', `url("${CDN}/${path}/`);
  // 每个 @font-face 补 font-weight（原文件缺失，缺了会全部按 400 注册）
  const blocks = css.split('@font-face').length - 1;
  css = css.replaceAll('font-family:"JiangChengYuanTi";', `font-family:"JiangChengYuanTi";font-weight:${weight};`);

  // woff2 全量下载到本地，CSS 指向 /fonts/files/<weight>/
  const urls = [...css.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((m) => m[1]);
  const seen = new Map();
  let done = 0;
  const queue = [...new Set(urls)];
  await mkdir(`${OUT_FILES_DIR}/${weight}w`, { recursive: true });
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const name = u.split('/').pop();
      const dest = `${OUT_FILES_DIR}/${weight}w/${name}`;
      seen.set(u, `/fonts/files/${weight}w/${name}`);
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const r = await fetch(u);
          if (!r.ok) throw new Error(String(r.status));
          await writeFile(dest, Buffer.from(await r.arrayBuffer()));
          break;
        } catch (e) {
          if (attempt === 3) throw new Error(`${u} -> ${e.message}`);
          await new Promise((ok) => setTimeout(ok, 800 * attempt));
        }
      }
      done++;
      if (done % 40 === 0) console.log(`  ${weight}w ${done}/${urls.length}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  for (const [u, local] of seen) css = css.replaceAll(`url("${u}")`, `url("${local}")`);

  const out = `${OUT_CSS_DIR}/jiangcheng-${weight}.css`;
  await writeFile(out, `/* 江城圆体 ${weight}W（OFL-1.1，v3.6）—— woff2 已本地自托管，vendor 时已补 font-weight */\n${css}`);
  console.log(`${out}  ${blocks} 个 @font-face（font-weight:${weight}），${urls.length} 个 woff2 本地化 ✅`);
}
console.log('完成 ✅');
