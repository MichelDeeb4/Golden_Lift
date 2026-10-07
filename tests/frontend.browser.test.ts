import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('gl.locale')) localStorage.setItem('gl.locale', 'en');
  });
});
async function openFilters(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) >= 768) return;
  const trigger = page.getByRole('button', { name: 'Filter / Sort by', exact: true });
  await expect(trigger).toBeVisible();
  if (!(await page.getByRole('dialog').isVisible())) await trigger.click();
}
test('homepage, category/card data, history and scoped pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Engineering movement');
  await expect(page.locator('.gl-category-card')).toHaveCount(3);
  await expect(page.locator('.gl-product-card')).toHaveCount(3);
  await expect(page.locator('.gl-featured-stage')).toHaveCount(1);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.gl-category-card a').first().click();
  await expect(page).toHaveURL(/categories\/cabins/);
  await expect(page.locator('.gl-product-card')).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Engineering movement');
  for (const path of ['/about', '/contact', '/products', '/search', '/does-not-exist']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
  }
  expect(errors).toEqual([]);
  await page.goto('/contact');
  await expect(page.locator('main form')).toHaveCount(0);
});
test('button width/loading, fields/select and modal keyboard focus/restore', async ({ page }) => {
  await page.goto('/component-lab');
  await expect(page.getByRole('heading', { name: 'Component lab', exact: true })).toBeVisible();
  const loading = page.locator('button[aria-busy=true]').first();
  await expect(loading).toBeDisabled();
  expect((await loading.boundingBox())?.height).toBe(32);
  const select = page.getByLabel('Select an option', { exact: true });
  await select.click();
  await page.getByRole('option', { name: 'Option two', exact: true }).click();
  await expect(select).toContainText('Option two');
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(select).toContainText('Option one');
  await expect(page.getByLabel('Error', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Disabled', { exact: true })).toBeDisabled();
  const trigger = page.getByRole('button', { name: 'Open modal', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test('RTL language persistence, breadcrumbs, tabs, gallery and pagination', async ({ page }) => {
  await page.goto('/products/aurum-01');
  for (const locale of ['ar', 'ckb', 'en']) {
    await page.locator('.gl-utility select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
    await expect(page.locator('.gl-gallery')).toBeVisible();
    await page.reload();
    await expect(page.locator('.gl-utility select')).toHaveValue(locale);
  }
  await page.getByRole('tab', { name: 'Specifications' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Illustrative capacity');
  await page.locator('.gl-gallery-thumbnails button').nth(1).click();
  await expect(page.locator('.gl-gallery-thumbnails button').nth(1)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'View fullscreen' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.gl-gallery-thumbnails button').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.goto('/products');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.gl-product-card')).toHaveCount(1);
});
test('mobile RTL drawer, search empty state and all responsive viewports avoid overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.gl-utility select').selectOption('ar');
  await page.locator('.gl-mobile-header button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.gl-utility select').selectOption('en');
  await page.goto('/search');
  await openFilters(page);
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('nothing-matches');
  await page.getByRole('dialog').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await openFilters(page);
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.locator('.gl-product-card')).toHaveCount(4);
  await page.goto('/search?q=Aurum');
  await expect(page.locator('.gl-product-card')).toHaveCount(1);
  await page.goto('/search?q=Linea');
  await openFilters(page);
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Linea');
  await page.keyboard.press('Escape');
  await page.goBack();
  await openFilters(page);
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Aurum');
  await expect(page.locator('.gl-product-card')).toHaveCount(1);
  await page.keyboard.press('Escape');
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/', '/categories/cabins', '/products/aurum-01']) {
      await page.goto(path);
      await expect(page.locator('.gl-header .gl-brand:visible')).toHaveCount(1);
      await expect(page.locator('main')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  }
});
test('deterministic client review screenshots for Arabic/Sorani and desktop/tablet/mobile', async ({
  page,
}) => {
  for (const scenario of [
    { locale: 'en', width: 1440, path: '/', name: 'home-en-desktop' },
    { locale: 'en', width: 1440, path: '/products', name: 'listing-en-desktop' },
    { locale: 'en', width: 1440, path: '/products/aurum-01', name: 'product-en-desktop' },
    { locale: 'ar', width: 390, path: '/products/aurum-01', name: 'product-ar-mobile' },
    { locale: 'ar', width: 390, path: '/', name: 'home-ar-mobile' },
    { locale: 'ckb', width: 768, path: '/products/aurum-01', name: 'product-ckb-tablet' },
    { locale: 'ar', width: 1440, path: '/categories/cabins', name: 'category-ar-desktop' },
  ]) {
    await page.setViewportSize({ width: scenario.width, height: 1000 });
    await page.goto(scenario.path);
    await page.locator('.gl-utility select').selectOption(scenario.locale);
    await expect(page.locator('main h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.gl-skeleton')).toHaveCount(0);
    await page.locator('main img').evaluateAll(async (images) => {
      await Promise.all(
        images.map(async (element) => {
          const image = element as HTMLImageElement;
          image.loading = 'eager';
          if (!image.complete) {
            await new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            });
          }
          if (image.naturalWidth) await image.decode();
        }),
      );
    });
    await page.screenshot({
      path: '.local/s1-screenshots/' + scenario.name + '.png',
      fullPage: true,
    });
    if (process.env.GL_REDESIGN_CAPTURE) {
      await page.screenshot({
        path: `documentation/assets/major-redesign/${process.env.GL_REDESIGN_CAPTURE}/${scenario.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      continue;
    }
    await expect(page).toHaveScreenshot(scenario.name + '.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });
  }
});
