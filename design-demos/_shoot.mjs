// 一次性工具：为 15 套 demo 生成缩略截图（jpeg，含整页）
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const demos = [
  '01-aurora-glass', '02-neo-brutalism', '03-jp-editorial', '04-y2k-retro', '05-terminal',
  '06-swiss', '07-bento', '08-linear-dark', '09-apple-hig', '10-scrapbook',
  '11-neon-cyber', '12-ikb', '13-morandi', '14-bear', '15-manga',
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

for (const name of demos) {
  const url = 'file:///' + path.join(root, `${name}.html`).replace(/\\/g, '/');
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
  } catch {
    console.warn(`[warn] networkidle timeout, continuing: ${name}`);
  }
  await page.waitForTimeout(600); // 字体/动画稳定
  await page.screenshot({ path: path.join(root, 'shots', `${name}.jpg`), fullPage: true, type: 'jpeg', quality: 72 });
  console.log('shot:', name);
}

await browser.close();
console.log('done');
