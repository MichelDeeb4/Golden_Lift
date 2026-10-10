import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>, admin: APIRequestContext;
let categoryId: string, productId: string;
const translations = (name: string) =>
  ['ar', 'en', 'ckb'].map((locale) => ({ locale, name, description: null }));
test.describe.configure({ mode: 'serial' });
async function request(path: string, data?: unknown, method = data ? 'POST' : 'GET') {
  const session = await (await admin.get(fixture.gatewayOrigin + '/api/v1/auth/session')).json();
  const r = await admin.fetch(fixture.gatewayOrigin + '/api/v1' + path, {
    method,
    headers: { origin: 'http://localhost:8082', 'x-csrf-token': session.csrfToken },
    ...(data ? { data } : {}),
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return r.json();
}
test.beforeAll(async ({ playwright }) => {
  fixture = await adminBrowserFixture({
    ports: { gateway: 3400, media: 3403, catalogEvents: 3502, mediaEvents: 3503 },
  });
  admin = await playwright.request.newContext();
  const login = await admin.post(fixture.gatewayOrigin + '/api/v1/auth/login', {
    headers: { origin: 'http://localhost:8082' },
    data: { email: fixture.adminEmail, password: fixture.password },
  });
  expect(login.status()).toBe(200);
  await request('/admin/units', {
    code: 'UI-MM',
    symbol: 'mm',
    dimension: 'length',
    translations: translations('Millimetre'),
  });
  const width = await request('/admin/attributes', {
    code: 'UI-WIDTH',
    kind: 'NUMBER',
    unitCode: 'UI-MM',
    minimum: '0',
    maximum: '10000',
    allowMultiple: false,
    public: true,
    filterable: true,
    textMultiline: false,
    textMaxLength: 4000,
    translations: translations('Width'),
  });
  const unitPage = await request('/admin/units?pageSize=25');
  expect(
    unitPage.items.find((unit: { code: string }) => unit.code === 'UI-MM').attributeCount,
  ).toBe('1');
  const group = await request('/admin/attribute-groups', {
    code: 'UI-DIMENSIONS',
    attributeIds: [width.id],
    translations: translations('Dimensions'),
  });
  const duplicate = await request('/admin/attribute-groups', {
    code: 'UI-ENGINEERING',
    attributeIds: [width.id],
    translations: translations('Engineering'),
  });
  for (let i = 0; i < 24; i++)
    await request('/admin/attribute-groups', {
      code: 'UI-GROUP-' + String(i).padStart(2, '0'),
      translations: translations('Specification group ' + i),
    });
  const parent = await request('/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Elevator systems'),
  });
  const category = await request('/admin/categories', {
    parentId: parent.id,
    expectedParentVersion: parent.version,
    translations: translations('Passenger cabins'),
    groupIds: [group.id, duplicate.id],
    coverAssetId: await fixture.newReadyImage('Browser fixture image.png'),
  });
  categoryId = category.id;
  let product = await request('/admin/products', {
    categoryId,
    modelCode: 'BP-UI-630',
    translations: translations('Passenger cabin 630'),
  });
  product = await request(
    '/admin/products/' + product.id,
    {
      expectedVersion: product.version,
      expectedSchemaRevision: product.schemaRevision,
      values: [{ definitionId: width.id, value: { kind: 'NUMBER', number: '1100.000001' } }],
    },
    'PATCH',
  );
  const cover = await fixture.newReadyImage('Browser fixture image.png');
  await request('/admin/products/' + product.id + '/media', {
    expectedVersion: product.version,
    coverAssetId: cover,
    media: [{ id: randomUUID(), assetId: cover, kind: 'IMAGE', translations: [] }],
  });
  product = await request('/admin/products/' + product.id);
  await request('/admin/products/' + product.id + '/publication', {
    expectedVersion: product.version,
    active: true,
    featured: false,
    sortOrder: '1024',
    featuredOrder: '0',
  });
  productId = product.id;
});
test.afterAll(async () => {
  await admin?.dispose();
  await fixture?.dispose();
});
async function login(page: Page, superAdmin = false) {
  await page.addInitScript(
    () => !localStorage.getItem('bp.locale') && localStorage.setItem('bp.locale', 'en'),
  );
  await page.goto('/admin/login');
  await page
    .locator('input[type=email]')
    .fill(superAdmin ? fixture.superEmail : fixture.adminEmail);
  await page.locator('input[type=password]').fill(fixture.password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(
    superAdmin ? new RegExp('super-admin/admins') : new RegExp('/admin/?$'),
  );
}
async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
  await expect(page.locator('main .bp-admin-skeleton')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('main img')
        .evaluateAll((es) => es.every((e) => (e as HTMLImageElement).complete)),
    )
    .toBe(true);
  await expect(page).toHaveScreenshot(name + '.png', {
    fullPage: (await page.getByRole('dialog').count()) === 0,
    animations: 'disabled',
  });
}
async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}
test('all major Admin routes share hierarchy, density, responsive navigation and reviewed visual composition', async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const routes = [
    ['landing', '/admin'],
    ['categories', '/admin/categories/' + categoryId],
    ['products', '/admin/products'],
    ['product-editor', '/admin/products/' + productId],
    ['attributes', '/admin/attributes'],
    ['groups', '/admin/attribute-groups'],
    ['units', '/admin/units'],
    ['media', '/admin/media'],
    ['account', '/admin/account'],
  ];
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, path] of routes) {
      await page.goto(path!);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.locator('main .bp-page-heading')).toBeVisible();
      await expect(page.locator('main .bp-admin-skeleton')).toHaveCount(0);
      await noOverflow(page);
      if (width === 1440 && name !== 'account') await capture(page, name!);
      if (name === 'groups') {
        await expect(page.locator('tbody tr')).toHaveCount(25);
        if (width === 1440) {
          const heights = await page
            .locator('tbody tr')
            .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
          expect(Math.max(...heights)).toBeLessThanOrEqual(56);
        }
      }
      if (name === 'product-editor') {
        await page
          .locator('.bp-workspace-rail')
          .getByRole('button', { name: /Specifications/ })
          .click();
        await expect(page.getByLabel(/^Width/)).toHaveCount(1);
        if (width === 1440) await capture(page, 'product-specifications');
      }
    }
    if (width === 390) {
      await page.locator('.bp-admin-menu').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('link', { name: 'Attributes', exact: true })).toBeVisible();
      await capture(page, 'mobile-navigation');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  }
  for (const locale of ['ar', 'ckb']) {
    await page.goto('/admin/attributes');
    await page.locator('header select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await noOverflow(page);
    await capture(page, 'attributes-' + locale + '-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/admin/categories/' + categoryId);
    await capture(page, 'categories-' + locale);
    for (const rtlWidth of [1440, 390]) {
      await page.setViewportSize({ width: rtlWidth, height: 1000 });
      for (const [name, path] of routes) {
        await page.goto(path!);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.locator('main h1')).toHaveCount(1);
        await noOverflow(page);
        if (rtlWidth === 390 && name === 'product-editor')
          await capture(page, 'editor-' + locale + '-mobile');
      }
    }
    await page.setViewportSize({ width: 390, height: 1000 });
  }
  expect(errors).toEqual([]);
});
test('create/edit/delete and dirty close remain persistent and focus-safe without document reload', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attribute-groups');
  await page.getByRole('button', { name: 'Create Group', exact: true }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Create Group', exact: true });
  await capture(page, 'create-modal');
  await dialog.getByLabel('Code', { exact: true }).fill('UI-SAVED');
  await dialog.getByLabel('Name (ar)', { exact: true }).fill('Saved professional group');
  await dialog.getByRole('tab', { name: 'English', exact: true }).click();
  await dialog.getByLabel('Name (en)', { exact: true }).fill('Saved professional group');
  const marker = await page.evaluate(() => {
    (window as unknown as { uiMarker: string }).uiMarker = crypto.randomUUID();
    return (window as unknown as { uiMarker: string }).uiMarker;
  });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { uiMarker: string }).uiMarker)).toBe(
    marker,
  );
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('UI-SAVED');
  const row = page.locator('tbody tr');
  await expect(row).toHaveCount(1);
  await page.reload();
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /Actions/ }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit', exact: true });
  await capture(page, 'edit-modal');
  await dialog.getByLabel('Name (ar)', { exact: true }).fill('Uncommitted group');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const unsaved = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
  await capture(page, 'unsaved-dialog');
  await unsaved.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(dialog.getByLabel('Name (ar)', { exact: true })).toHaveValue('Uncommitted group');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await unsaved.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  await row.getByRole('button', { name: /Actions/ }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Deletion impact', exact: true });
  await expect(deletion).toContainText('UI-SAVED');
  await capture(page, 'delete-dialog');
  await deletion.getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await expect(deletion).not.toBeVisible();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
});
test('Super Admin keeps its authorized directory and account navigation', async ({ page }) => {
  await login(page, true);
  await expect(page.locator('.bp-admin-sidebar a')).toHaveCount(2);
  await expect(page.locator('.bp-admin-sidebar a[href="/admin/products"]')).toHaveCount(0);
  await expect(page.locator('thead')).toContainText('Updated');
  await expect(page.locator('tbody time')).toHaveAttribute('dateTime', /\.\d{6}Z$/);
  await capture(page, 'admin-accounts');
  await page.goto('/admin/products');
  await expect(page.locator('main')).toContainText('You do not have permission for this page.');
});
test('shared button icon and label centers, sizes, loading and RTL align in every semantic variant', async ({
  page,
}) => {
  await page.addInitScript(
    () => !localStorage.getItem('bp.locale') && localStorage.setItem('bp.locale', 'en'),
  );
  await page.goto('/component-lab');
  for (const locale of ['en', 'ar', 'ckb']) {
    await page.locator('header select').selectOption(locale);
    for (const variant of [
      'primary',
      'secondary',
      'neutral',
      'success',
      'warning',
      'destructive',
      'ghost',
    ])
      for (const [size, height] of [
        ['sm', 32],
        ['md', 40],
        ['lg', 44],
      ] as const) {
        const button = page
          .locator('.bp-lab-row .bp-button-' + variant + '.bp-button-' + size)
          .first();
        await expect(button).toBeVisible();
        const geometry = await button.evaluate((e) => {
          const b = e.getBoundingClientRect(),
            icon = e.querySelector('svg')!.getBoundingClientRect(),
            label = e.querySelector('.bp-button-label')!;
          return {
            height: b.height,
            iconCenter: icon.y + icon.height / 2,
            buttonCenter: b.y + b.height / 2,
            gap: getComputedStyle(label).gap,
            transform: getComputedStyle(e.querySelector('svg')!).transform,
          };
        });
        expect(geometry.height).toBe(height);
        expect(Math.abs(geometry.iconCenter - geometry.buttonCenter)).toBeLessThan(1);
        expect(geometry.gap).toBe('8px');
        expect(geometry.transform).toBe('none');
        const loading = page.locator(
          '.bp-lab-row .bp-button-' + variant + '.bp-button-' + size + '[aria-busy=true]',
        );
        await expect(loading).toBeDisabled();
        expect((await loading.boundingBox())!.height).toBe(height);
        const centerDelta = await loading.evaluate((e) => {
          const b = e.getBoundingClientRect(),
            spinner = e.querySelector('.bp-button-spinner')!.getBoundingClientRect();
          return Math.abs(spinner.y + spinner.height / 2 - (b.y + b.height / 2));
        });
        expect(centerDelta).toBeLessThan(1);
      }
    const icon = page
      .locator('.bp-icon-button:visible')
      .filter({ has: page.locator('svg') })
      .first();
    await expect(icon).toHaveAttribute('aria-label', /.+/);
    expect((await icon.boundingBox())!.width).toBeGreaterThanOrEqual(36);
  }
});

test('collection loading, safe error, retry and empty states keep controls reachable on mobile', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/admin/attributes?**', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/admin/attributes');
  await expect(page.locator('main .bp-admin-skeleton')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create Attribute', exact: true }).first(),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('loading-mobile.png', {
    fullPage: true,
    animations: 'disabled',
  });
  release();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.unroute('**/api/v1/admin/attributes?**');
  await page.route('**/api/v1/admin/attributes?**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE' } }),
    }),
  );
  await page.reload();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Prisma|SELECT|postgresql:\/\//);
  await capture(page, 'error-mobile');
  await page.unroute('**/api/v1/admin/attributes?**');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page
    .getByRole('searchbox', { name: 'Search', exact: true })
    .fill('no-matching-admin-record');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('No records match these filters.');
  await capture(page, 'empty-mobile');
  await page.locator('.bp-input-clear').click();
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toHaveValue('');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Create Attribute', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create Attribute', exact: true });
  await expect(dialog).toBeVisible();
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
