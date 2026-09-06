import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4321';
const OUT = 'C:/Projects/astro-blog/design-demos/shots';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function shot(url, name, dark) {
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.evaluate((d) => { localStorage.setItem('theme', d ? 'dark' : 'light'); }, dark);
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, fullPage: true, type: 'jpeg', quality: 70 });
  console.log('shot', name);
}

await shot('/', '_astro-home-light', false);
await shot('/', '_astro-home-dark', true);
await shot('/posts/pcshurufa/', '_astro-post-light', false);
await shot('/posts/pcshurufa/', '_astro-post-dark', true);
await shot('/posts/imas-cd/', '_astro-cd-light', false);

await browser.close();
console.log('done');
