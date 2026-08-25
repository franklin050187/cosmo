import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const inPath = process.argv[2] ?? 'output/shipgen/laser-100k-v1-core.json';
const json = readFileSync(inPath, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
await page.goto('http://localhost:8001/rawdata', { waitUntil: 'networkidle' });

await page.getByRole('button', { name: 'Paste JSON' }).click();
await page.locator('textarea').first().fill(json);
await page.getByRole('button', { name: 'Load JSON' }).click();

await page.waitForSelector('canvas[aria-label="Ship reconstruction"]', { timeout: 30000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[role="status"][aria-label="Generating ship image"]');
  return !el;
}, { timeout: 60000 });
await page.waitForTimeout(1500);

const canvas = page.locator('canvas[aria-label="Ship reconstruction"]');
await canvas.screenshot({ path: process.argv[3] ?? 'output/shipgen/laser-100k-v1-core-sprite.png' });
console.log('saved sprite render');
await browser.close();
