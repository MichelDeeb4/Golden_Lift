import { test, expect } from '@playwright/test';
for (const [port, title] of [
  [4300, 'ERP workspace'],
  [4301, 'Platform administration'],
])
  test(title + ' actual browser shell, form, RTL, navigation and not-found', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + port);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByLabel('Display direction').selectOption('rtl');
    await page.getByRole('button', { name: 'Apply display preference' }).click();
    await expect(page.locator('.workspace')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('output')).toHaveText('Right to left');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.goto('http://127.0.0.1:' + port + '/missing');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect(errors).toEqual([]);
  });
