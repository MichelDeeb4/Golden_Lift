import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8081');
  await page.locator('main h1').waitFor();
  assert.equal(await page.locator('.bp-category-card').count(), 3);
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  await page.goto('http://127.0.0.1:8081/component-lab');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await mkdir('.local/s1-screenshots', { recursive: true });
  for (const scenario of [
    { locale: 'ar', path: '/products/aurum-01', name: 'product-ar-development' },
    { locale: 'ckb', path: '/', name: 'home-ckb-development' },
  ]) {
    await page.goto('http://127.0.0.1:8081' + scenario.path);
    await page.locator('.bp-utility select').selectOption(scenario.locale);
    await page.locator('main h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.bp-skeleton').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    await page.screenshot({
      path: '.local/s1-screenshots/' + scenario.name + '.png',
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS Expo development web compilation, default Arabic homepage and component lab in actual Edge.',
  );
} finally {
  await browser.close();
}
