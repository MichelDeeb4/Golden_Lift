import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>, admin: APIRequestContext;
let sequence = 0;
let parent: string,
  a1: string,
  a2: string,
  material: string,
  width: string,
  gold: string,
  silver: string,
  p1: string,
  p2: string,
  p3: string;
const translations = (name: string) =>
  ['ar', 'en', 'ckb'].map((locale) => ({
    locale,
    name,
    description: 'Engineered systems with clear technical specifications.',
  }));
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
async function publicRows(categoryId: string, filters: unknown[] = []) {
  const r = await admin.get(fixture.gatewayOrigin + '/api/v1/products', {
    params: { locale: 'en', categoryId, filters: JSON.stringify(filters) },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
test.describe.configure({ mode: 'serial' });
test.beforeAll(async ({ playwright }) => {
  test.setTimeout(180000);
  fixture = await adminBrowserFixture({
    ports: { gateway: 3400, media: 3403, catalogEvents: 3502, mediaEvents: 3503 },
  });
  admin = await playwright.request.newContext();
  const login = await admin.post(fixture.gatewayOrigin + '/api/v1/auth/login', {
    headers: { origin: 'http://localhost:8082' },
    data: { email: fixture.adminEmail, password: fixture.password },
  });
  expect(login.status()).toBe(200);
  const createCategory = async (
    name: string,
    parentId: string | null = null,
    groupIds: string[] = [],
  ) => {
    const current = parentId ? await request('/admin/categories/' + parentId + '?locale=en') : null;
    return request('/admin/categories', {
      parentId,
      expectedParentVersion: current?.version ?? null,
      translations: translations(name),
      groupIds,
      coverAssetId: await fixture.newReadyImage(),
    });
  };
  const a = await createCategory('Category A');
  parent = a.id;
  const other = await createCategory('Drive systems');
  for (const name of ['Doors', 'Control systems', 'Safety components', 'Architectural finishes'])
    await createCategory(name);
  const attribute = async (name: string, kind: string) =>
    request('/admin/attributes', {
      code: name.toLowerCase(),
      kind,
      unitCode: null,
      minimum: null,
      maximum: null,
      allowMultiple: false,
      public: true,
      filterable: true,
      textMultiline: false,
      textMaxLength: 4000,
      translations: translations(name),
    });
  const m = await attribute('Material', 'CHOICE'),
    w = await attribute('Width', 'NUMBER');
  material = m.id;
  width = w.id;
  gold = (
    await request('/admin/attributes/' + material + '/options', {
      code: 'gold',
      sortOrder: '0',
      translations: translations('Gold').map((t) => ({ ...t, description: null })),
    })
  ).id;
  silver = (
    await request('/admin/attributes/' + material + '/options', {
      code: 'silver',
      sortOrder: '1024',
      translations: translations('Silver').map((t) => ({ ...t, description: null })),
    })
  ).id;
  const g = await request('/admin/attribute-groups', {
    code: 'public-specifications',
    attributeIds: [material, width],
    translations: translations('Specifications'),
  });
  const duplicate = await request('/admin/attribute-groups', {
    code: 'public-materials',
    attributeIds: [material],
    translations: translations('Materials'),
  });
  a1 = (await createCategory('Leaf A1', parent, [g.id, duplicate.id])).id;
  a2 = (await createCategory('Leaf A2', parent, [g.id])).id;
  const product = async (name: string, categoryId: string, optionId?: string, number?: string) => {
    let p = await request('/admin/products', {
      categoryId,
      modelCode: 'BP-' + name,
      translations: translations(name),
    });
    if (optionId)
      p = await request(
        '/admin/products/' + p.id,
        {
          expectedVersion: p.version,
          expectedSchemaRevision: p.schemaRevision,
          values: [
            { definitionId: material, value: { kind: 'CHOICE', optionIds: [optionId] } },
            { definitionId: width, value: { kind: 'NUMBER', number } },
          ],
        },
        'PATCH',
      );
    const asset = await fixture.newReadyImage();
    await request('/admin/products/' + p.id + '/media', {
      expectedVersion: p.version,
      coverAssetId: asset,
      media: [{ id: randomUUID(), assetId: asset, kind: 'IMAGE', translations: [] }],
    });
    p = await request('/admin/products/' + p.id);
    await request('/admin/products/' + p.id + '/publication', {
      expectedVersion: p.version,
      active: true,
      featured: false,
      sortOrder: String(++sequence * 1024),
      featuredOrder: '0',
    });
    return p.id;
  };
  p1 = await product('P1', a1, gold, '1100');
  p2 = await product('P2', a1, silver, '1400');
  p3 = await product('P3', a2, gold, '1600');
  for (let i = 0; i < 10; i++) await product('Supporting-' + i, other.id);
});
test.afterAll(async () => {
  await admin?.dispose();
  await fixture?.dispose();
});
async function english(page: Page) {
  await page.addInitScript(() => localStorage.setItem('bp.locale', 'en'));
}
async function screenshot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('main .bp-skeleton')).toHaveCount(0);
  await page.locator('main img').evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (node) => {
        const image = node as HTMLImageElement;
        image.loading = 'eager';
        if (!image.complete)
          await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          });
        if (image.naturalWidth) await image.decode();
      }),
    );
  });
  await expect(page).toHaveScreenshot(name, { fullPage: true });
}
async function cards(page: Page, names: string[]) {
  await expect(page.locator('.bp-product-grid .bp-product-card')).toHaveCount(names.length);
  for (const name of names)
    await expect(
      page.locator('.bp-product-card').getByRole('heading', { name, exact: true }),
    ).toBeVisible();
}
test('visitor filters use real descendant/typed results, persist through refresh/history and preserve pagination', async ({
  page,
}) => {
  await english(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/products');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Products', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.bp-product-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.bp-product-card')).toHaveCount(1);
  await page
    .locator('.bp-category-filter')
    .getByRole('button', { name: 'Category A', exact: true })
    .click();
  await cards(page, ['P1', 'P2', 'P3']);
  await page
    .locator('.bp-category-filter')
    .getByRole('button', { name: 'View categories — Category A', exact: true })
    .click();
  await page
    .locator('.bp-category-filter')
    .getByRole('button', { name: 'Leaf A1', exact: true })
    .click();
  await cards(page, ['P1', 'P2']);
  await page
    .locator('.bp-category-filter')
    .getByRole('button', { name: 'Category A', exact: true })
    .click();
  await cards(page, ['P1', 'P2', 'P3']);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByRole('checkbox', { name: 'Gold', exact: true })).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Gold', exact: true }).check();
  await page
    .locator('.bp-dynamic-filters')
    .getByRole('button', { name: 'Filter', exact: true })
    .click();
  await cards(page, ['P1', 'P3']);
  await page.getByLabel('Minimum', { exact: true }).fill('1500');
  await page
    .locator('.bp-dynamic-filters')
    .getByRole('button', { name: 'Filter', exact: true })
    .click();
  await cards(page, ['P3']);
  await expect(page.locator('.bp-active-filters')).toContainText('Material: Gold');
  await expect(page.locator('.bp-active-filters')).toContainText('Width: ≥ 1500');
  await page.reload();
  await cards(page, ['P3']);
  await page.goBack();
  await cards(page, ['P1', 'P3']);
  await page.goForward();
  await cards(page, ['P3']);
  await page
    .locator('.bp-active-filters')
    .getByRole('button', { name: /Width:/ })
    .click();
  await cards(page, ['P1', 'P3']);
  await page.getByRole('checkbox', { name: 'Silver', exact: true }).check();
  await page
    .locator('.bp-dynamic-filters')
    .getByRole('button', { name: 'Filter', exact: true })
    .click();
  await cards(page, ['P1', 'P2', 'P3']);
  await page.goto(
    '/products?categoryId=' +
      a1 +
      '&filters=' +
      encodeURIComponent(
        JSON.stringify([
          { definitionId: material, kind: 'CHOICE', optionIds: [gold] },
          { definitionId: width, kind: 'NUMBER', minimum: '1200' },
        ]),
      ),
  );
  await expect(page.locator('.bp-product-card')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'No products match these filters.', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('staff Attribute edits and Category moves change anonymous public filter results; API errors remain errors', async ({
  page,
}) => {
  const p = await request('/admin/products/' + p3);
  await request(
    '/admin/products/' + p3,
    {
      expectedVersion: p.version,
      expectedSchemaRevision: p.schemaRevision,
      values: [{ definitionId: width, value: { kind: 'NUMBER', number: '1450' } }],
    },
    'PATCH',
  );
  expect(
    (await publicRows(parent, [{ definitionId: width, kind: 'NUMBER', minimum: '1500' }])).items,
  ).toHaveLength(0);
  const current = await request('/admin/products/' + p3),
    category = await request('/admin/categories/' + a1 + '?locale=en');
  const command = {
    categoryId: a1,
    expectedVersion: current.version,
    expectedSchemaRevision: current.schemaRevision,
    expectedCategoryVersion: category.version,
  };
  const impact = await request('/admin/products/' + p3 + '/placement/preview', command);
  await request('/admin/products/' + p3 + '/placement', {
    ...command,
    precondition: impact.precondition,
    confirm: true,
  });
  expect((await publicRows(a1)).items.map((p: { id: string }) => p.id).sort()).toEqual(
    [p1, p2, p3].sort(),
  );
  expect((await publicRows(a2)).items).toHaveLength(0);
  await english(page);
  await page.route('**/api/v1/products?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"code":"DEPENDENCY_UNAVAILABLE"}',
    }),
  );
  await page.goto('/products');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.locator('.bp-product-card')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'No products match these filters.', exact: true }),
  ).toHaveCount(0);
});
test('public grids and contextual Category/detail layouts remain accessible and proportional across widths and RTL', async ({
  page,
}) => {
  await english(page);
  for (const viewport of [1440, 1280, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    for (const path of ['/', '/products', '/categories/' + parent, '/products/' + p1]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      if (path === '/') {
        await expect(page.locator('.bp-category-card')).toHaveCount(6);
        const ratios = await page.locator('.bp-category-card-image').evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return r.width / r.height;
          }),
        );
        for (const ratio of ratios) expect(ratio).toBeCloseTo(4 / 3, 1);
        if ([1440, 1024, 390].includes(viewport))
          await screenshot(page, 'home-' + viewport + '.png');
      }
      if (path === '/products/' + p1) {
        await expect(page.locator('.bp-gallery')).toBeVisible();
        await page.getByRole('tab', { name: 'Specifications', exact: true }).click();
        await expect(page.locator('.bp-specification-groups .bp-specifications > div')).toHaveCount(
          2,
        );
        await expect(page.locator('.bp-specification-groups')).toContainText('1100');
        await expect(page.locator('.bp-product-grid')).toBeVisible();
      }
      if (path === '/categories/' + parent) {
        await expect(page.locator('.bp-category-hero h1')).toHaveText('Category A');
        await expect(page.locator('.bp-category-hero')).toContainText('Engineered systems');
        await expect(page.locator('.bp-category-hero-image img')).toBeVisible();
        await expect(page.locator('.bp-category-grid .bp-category-card')).toHaveCount(2);
      }
      if (path === '/products') {
        await expect(page.locator('.bp-product-card')).toHaveCount(12);
        const frames = await page.locator('.bp-product-card-image').evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect(),
              owner = n.closest('article')!.getBoundingClientRect();
            return { ratio: r.width / r.height, width: r.width, ownerWidth: owner.width };
          }),
        );
        for (const frame of frames) {
          expect(frame.ratio).toBeCloseTo(4 / 3, 1);
          expect(frame.width).toBeCloseTo(frame.ownerWidth, 0);
        }
        if (viewport < 768) {
          await page.getByRole('button', { name: 'Filter / Sort by', exact: true }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Close', exact: true })
            .last()
            .click();
        }
        if ([1440, 390].includes(viewport)) await screenshot(page, 'products-' + viewport + '.png');
      }
    }
  }
  for (const locale of ['ar', 'ckb']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/products?categoryId=' + parent);
    await page.locator('header select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.bp-card-arrow svg').first()).toHaveCSS(
      'transform',
      'matrix(-1, 0, 0, 1, 0, 0)',
    );
    await expect(page.locator('.bp-product-card')).toHaveCount(3);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await screenshot(page, 'products-' + locale + '-mobile.png');
  }
});
