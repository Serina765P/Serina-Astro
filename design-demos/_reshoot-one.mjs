import { chromium } from 'playwright-core';
const target = process.argv[2] || '07-bento';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(`file:///C:/Projects/astro-blog/design-demos/${target}.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: `design-demos/shots/${target}.jpg`, fullPage: true, type: 'jpeg', quality: 72 });
await browser.close();
console.log('reshot', target);
