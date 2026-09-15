import { chromium } from '@playwright/test';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('docs/mcp-apps-runtime-animation/.recording-tmp');
const outputPath = resolve('docs/mcp-apps-runtime-animation/dsh-github-trending.webm');
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const warmup = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const warmupPage = await warmup.newPage();
await warmupPage.goto('http://127.0.0.1:43188/', { waitUntil: 'networkidle' });
await warmup.close();

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: outputDirectory, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:43188/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const prompt = '请调用 wise_mcp__github-trending__show-trending，参数使用 period=week、language=all，并显示交互卡片。';
await page.locator('textarea[placeholder="Describe what you want to build"]').fill(prompt);
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Send message' }).click();

const deadline = Date.now() + 120_000;
let appFrame = null;
while (Date.now() < deadline) {
  for (const frame of page.frames()) {
    const body = await frame.locator('body').textContent().catch(() => '');
    if (body?.includes('GitHub Trending') && body.includes('Today')) {
      appFrame = frame;
      break;
    }
  }
  if (appFrame) break;
  await page.waitForTimeout(800);
}
if (!appFrame) throw new Error('GitHub Trending MCP App did not appear before timeout.');

await page.waitForTimeout(1800);
const today = appFrame.getByRole('button', { name: 'Today' });
if (await today.count()) {
  await today.click();
  await page.waitForTimeout(3500);
}
await page.waitForTimeout(1200);

await page.close();
await context.close();
await browser.close();

const files = await readdir(outputDirectory);
const webm = files.find(file => file.endsWith('.webm'));
if (!webm) throw new Error('Playwright did not create a WebM recording.');
await rm(outputPath, { force: true });
await rename(resolve(outputDirectory, webm), outputPath);
await rm(outputDirectory, { recursive: true, force: true });
console.log(outputPath);
