import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://localhost:3100';
let server;
if (!process.env.BASE_URL) server = spawn(process.execPath, ['scripts/dev.mjs'], { env: { ...process.env, PORT: '3100' }, stdio: 'ignore', windowsHide: true });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/games/demo/2d`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(ready, 'Test server did not start');
  await mkdir('artifacts', { recursive: true });
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  assert.equal(await page.getByRole('link', { name: 'ลองเล่นเกม 2D' }).count(), 1);
  // Controlled small objective exercises actual keyboard movement and win/restart UI.
  await page.route('**/api/games/demo/2d', async route => {
    const response = await route.fetch(); const data = await response.json();
    data.game = { coinCount: 1, enemyCount: 0, speed: 400, duration: 60 };
    await route.fulfill({ response, json: data });
  });
  await page.goto(`${base}/play/demo/2d`); await page.locator('#start').click();
  await page.waitForSelector('#world[data-ready="true"] canvas');
  await page.screenshot({ path: 'artifacts/2d-desktop.png', fullPage: true });
  await page.keyboard.down('ArrowLeft'); await page.waitForFunction(() => Number(document.querySelector('#world').dataset.playerX) <= 75, undefined, { timeout: 10000 }); await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowUp'); await page.waitForFunction(() => document.querySelector('#score').textContent === '1 / 1', undefined, { timeout: 10000 }); await page.keyboard.up('ArrowUp');
  await page.locator('#result:not([hidden])').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('#score').textContent(), '1 / 1');
  await page.locator('#restart').click(); await page.waitForSelector('#world[data-ready="true"] canvas');
  await page.waitForFunction(() => document.querySelector('#score').textContent === '0 / 1');
  await page.locator('#pause').click(); const timer = await page.locator('#timer').textContent();
  await page.waitForTimeout(350); assert.equal(await page.locator('#timer').textContent(), timer);
  await page.locator('#pause').click();
  console.log('PASS 2D keyboard objective, win, restart, pause/resume');
  await page.goto(`${base}/play/demo/vn`); await page.locator('#start').click();
  await page.waitForSelector('.novel-choices button');
  const before = await page.locator('.novel-dialogue p').textContent();
  await page.locator('.novel-choices button').first().click();
  assert.notEqual(await page.locator('.novel-dialogue p').textContent(), before);
  await page.screenshot({ path: 'artifacts/vn-desktop.png', fullPage: true });
  console.log('PASS Visual Novel choice changes scene');
  await page.goto(`${base}/play/demo/3d`); await page.locator('#start').click(); await page.waitForSelector('#world[data-ready="true"] canvas');
  await page.waitForTimeout(600); await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft');
  await page.screenshot({ path: 'artifacts/3d-desktop.png', fullPage: true });
  assert.equal(await page.locator('#world canvas').count(), 1);
  console.log('PASS Three.js boot and keyboard input');
  await page.goto(`${base}/play/00000000000000000000/p_0000000000000000`); await page.waitForFunction(() => document.querySelector('#start').hidden);
  console.log('PASS missing/deleted game shows an unavailable screen');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(base); assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  await mobile.goto(`${base}/play/demo/2d`); await mobile.locator('#start').tap(); await mobile.waitForSelector('#world[data-ready="true"] canvas');
  const button = mobile.locator('[data-direction="right"]'); const box = await button.boundingBox(); const touch = await mobile.context().newCDPSession(mobile);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await mobile.waitForFunction(() => Number(document.querySelector('#world').dataset.playerX) > 300);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.screenshot({ path: 'artifacts/2d-mobile.png', fullPage: true });
  console.log('PASS mobile layout and touch controls');
  assert.deepEqual(errors, [], 'Browser JS errors');
  console.log('Browser playtest passed; screenshots in artifacts/');
} finally { await browser?.close(); server?.kill(); }
