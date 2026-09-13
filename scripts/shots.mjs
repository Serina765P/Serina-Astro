// 视觉回归截图：把关键页面在亮/暗两态各拍一张全页图，供人工走查 + 稳定子集自动比对。
//
// 为什么需要它：接下来的 token / 组件替换会改动 30+ 处样式，构建通过 ≠ 视觉没变。
//
// 为什么闸门只认"稳定子集"：本机渲染存在不可消除的抖动（实测同一份代码连跑两次，
// 约 4-5/26 张图仍不一致，集中在重图页）。所以基线会连拍两轮，把两轮就不一致的图
// 标为 unstable 并从闸门里剔除；这些图只产出 PNG 供人工走查，不再冒充"回归失败"。
// 真正的硬证据是 CSS 层的两条（产物 CSS 规则骨架比对 + contrast-audit 字节一致）。
//
// 用法：
//   node scripts/shots.mjs baseline   # 连拍两轮，写出基线（含 unstable 名单）
//   node scripts/shots.mjs            # 拍一轮，与基线比对（稳定图有差异则 exit 1）
//
// 前置：先构建（node node_modules/astro/bin/astro.mjs build）。脚本自身拉起 astro preview。
// 浏览器：优先用系统 Edge（playwright-core 不下载浏览器；本机 ms-playwright 缓存的
//   chromium 是 1228，而 playwright-core 1.63 要求 1243，直接 launch 找不到可执行文件）。

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.SHOTS_PORT ?? 4399);
// 显式绑 IPv4：astro preview 默认只监听 ::1，而 fetch/navigation 用 127.0.0.1 会被拒
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS_DIR = path.join(ROOT, '.shots');

// 覆盖布局 / 列表 / 详情 / 特殊态：容器宽度、卡片、chip、分类胶囊、TOC、代码块都在其中
const ROUTES = [
  ['home', '/'],
  ['archives', '/archives/'],
  ['categories', '/categories/'],
  ['category-tech', '/categories/tech/'],
  ['tags', '/tags/'],
  ['tag-idolmaster', '/tags/idolmaster/'],
  ['links', '/links/'],
  ['shuoshuo', '/shuoshuo/'],
  ['search', '/search/'],
  ['about', '/about/'],
  ['post-pcshurufa', '/posts/pcshurufa/'],
  ['post-imas-hires', '/posts/imas-hires/'],
  ['not-found', '/404.html'],
];
const THEMES = ['light', 'dark'];
const VIEWPORT = { width: 1440, height: 900 };

const label = process.argv[2] ?? 'current';
const outDir = path.join(SHOTS_DIR, label);
const isBaseline = label === 'baseline';

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** 拉起 astro preview，返回子进程；用项目自己的预览服务器以保证与生产 URL 形态一致 */
function startPreview() {
  const bin = path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');
  return spawn(process.execPath, [bin, 'preview', '--host', HOST, '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
  });
}

/** 轮询直到预览服务器可用；失败即抛错，避免拍到半启动状态的页面 */
async function waitForServer(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      /* 尚未监听，继续等 */
    }
    await sleep(300);
  }
  throw new Error(`预览服务器 ${BASE} 在 ${timeoutMs}ms 内未就绪`);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

/**
 * 出图前把页面推稳定，并返回稳定的全页图。
 *
 * 为什么用"反复截到字节一致"而不是"等某个资源加载完"：字体 CSS 按 unicode-range 分片
 * （IBM Plex Sans SC 单份 143KB），下方字形只有全页渲染才会触发加载；懒加载图同理。
 * 而代码折叠的阈值（scrollHeight > 480）又依赖字体度量 —— 字体没落定会让折叠状态翻转。
 * 与其猜哪个资源没落地，不如直接以"像素稳定"为收敛判据。
 */
async function captureStable(page) {
  const warmup = page.evaluate(async () => {
    await document.fonts.ready;
    // 解除懒加载，让所有图进入加载队列
    for (const img of document.images) img.loading = 'eager';
    // 触底再回顶：懒加载由视口相交触发，不滚动就不会发请求
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 150));
    window.scrollTo(0, 0);
    // 等所有图落地；加载失败的也放行，避免个别坏图卡死整轮
    await Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? null
          : new Promise((r) => {
              img.addEventListener('load', r, { once: true });
              img.addEventListener('error', r, { once: true });
            }),
      ),
    );
    // 必须再显式 decode()：complete 只代表数据到手，解码是异步的（正文图带 decoding="async"）
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    await document.fonts.ready;
  });
  // 兜底上限：外链字体/图片被拦截时不至于把整轮卡死
  await Promise.race([warmup, new Promise((r) => setTimeout(r, 20000))]);

  let prev = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const buf = await page.screenshot({ fullPage: true });
    if (prev !== null && prev.equals(buf)) return buf;
    prev = buf;
    // 这次全页渲染本身会触发新的字体分片请求，等它落定再截下一张
    await Promise.race([
      page.evaluate(() => document.fonts.ready).catch(() => {}),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    await sleep(120);
  }
  return prev; // 4 次仍未收敛：交出最后一张
}

/** 出图一轮。write=true 时落盘 PNG 并打印体积（供人工走查） */
async function shoot(write) {
  const hashes = {};
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const theme of THEMES) {
      // 一个主题一个 context：localStorage 在 context 内共享，addInitScript 保证
      // 内联的 FOUC 防护脚本在首帧前就能读到主题，不会出现亮->暗闪变
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce', // 走站点自身的降级路径冻结 wash 漂移等动画
      });
      await context.addInitScript((t) => {
        try {
          localStorage.setItem('theme', t);
        } catch {
          /* 隐私模式下 storage 不可用，交给系统偏好兜底 */
        }
      }, theme);

      const page = await context.newPage();
      for (const [name, route] of ROUTES) {
        await page.goto(BASE + route, { waitUntil: 'load' });
        const file = `${name}.${theme}.png`;
        const buf = await captureStable(page);
        if (write) {
          await writeFile(path.join(outDir, file), buf);
          console.log(`  ${theme.padEnd(5)} ${name.padEnd(16)} ${String(buf.length).padStart(9)} B  ${sha256(buf)}`);
        }
        hashes[file] = sha256(buf);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return hashes;
}

async function capture() {
  // 构建健康检查：本环境的 astro build 会偶发静默丢弃 CSS 产物（退出码仍是 0）。
  // 若在无样式页面上出图，会把"构建坏了"误报成一屏"视觉回归"，所以先断言产物完整。
  const emitted = await readdir(path.join(ROOT, 'dist', '_astro')).catch(() => []);
  if (!emitted.some((f) => f.endsWith('.css'))) {
    throw new Error('dist 缺少 CSS 产物 —— 构建不可信（疑似 astro build 静默丢包），请重建后再出图');
  }

  await mkdir(outDir, { recursive: true });

  if (!isBaseline) return { hashes: await shoot(true), unstable: [] };

  // 基线连拍两轮：两轮就不一致的图标记为 unstable，后续闸门不对它们负责
  const probe = await shoot(false);
  const kept = await shoot(true);
  const unstable = Object.keys(kept).filter((f) => probe[f] !== kept[f]);
  console.log(`\n本机不稳定（本次两轮即不一致，已从闸门剔除）：${unstable.length} 张`);
  if (unstable.length) console.log('  ' + unstable.join('\n  '));
  return { hashes: kept, unstable };
}

/** 逐图比对：只对基线里判为稳定的图负责 */
async function compare(current) {
  let baseline;
  try {
    baseline = JSON.parse(await readFile(path.join(SHOTS_DIR, 'baseline', 'manifest.json'), 'utf8'));
  } catch {
    console.log('\n未找到 baseline（先跑一次 node scripts/shots.mjs baseline），跳过比对');
    return true;
  }
  const unstable = new Set(baseline.unstable ?? []);
  const changed = [];
  const skipped = [];
  for (const [file, hash] of Object.entries(current.hashes)) {
    if (baseline.hashes[file] === hash) continue;
    (unstable.has(file) ? skipped : changed).push(file);
  }

  const total = Object.keys(current.hashes).length;
  const stable = total - unstable.size;
  console.log('\n── 与 baseline 比对 ──');
  if (changed.length === 0) {
    console.log(`✅ 稳定子集全部一致（${stable}/${total} 张；另 ${skipped.length} 张不稳定已跳过）`);
  } else {
    console.log(`❌ 稳定图有变化（${changed.length} 张）：\n  ${changed.join('\n  ')}`);
  }
  if (skipped.length) console.log(`ℹ 不稳定图（仅人工走查，不作为失败）：${skipped.length} 张\n  ${skipped.join('\n  ')}`);
  console.log(`\n对比目录：.shots/${label}/  ←→  .shots/baseline/`);
  return changed.length === 0;
}

const server = startPreview();
let ok = true;
try {
  await waitForServer();
  const result = await capture();
  const manifest = { hashes: result.hashes, unstable: result.unstable };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (isBaseline) console.log(`\n基线已写入 .shots/baseline/（${Object.keys(result.hashes).length} 张）`);
  else ok = await compare(result);
} catch (err) {
  console.error(`\n失败：${err.message}`);
  ok = false;
} finally {
  server.kill();
  await sleep(300);
}

process.exit(ok ? 0 : 1);
