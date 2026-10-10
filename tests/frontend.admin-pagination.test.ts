import { expect, test } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>;
const captureRoot = process.env.GL_ADMIN_CAPTURE_ROOT ?? process.env.GL_STAFF_CAPTURE_DIR;
const captures = captureRoot
  ? captureRoot + '/pagination'
  : 'documentation/assets/admin-actions-dialogs-filters/pagination-regression';
test.describe.configure({ mode: 'serial' });
const browserFailures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  browserFailures.set(page, failures);
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(browserFailures.get(page)).toEqual([]);
});
async function select(page: Page, control: Locator, name: string) {
  await control.click();
  await page.getByRole('option', { name, exact: true }).click();
}
async function login(page: Page, superAdmin = false, locale = 'en') {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('gl.locale')) localStorage.setItem('gl.locale', value);
  }, locale);
  await page.goto('/admin/login');
  await page
    .locator('input[type=email]')
    .fill(superAdmin ? fixture.superEmail : fixture.adminEmail);
  await page.locator('input[type=password]').fill(fixture.password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(superAdmin ? /\/super-admin\/admins/ : /\/admin\/?$/);
  // Session probes before login intentionally return 401; authenticated screens must be clean.
  browserFailures.get(page)?.splice(0);
}
async function request(page: Page, path: string, data?: unknown, method = data ? 'POST' : 'GET') {
  const session = await page.request.get('http://localhost:3000/api/v1/auth/session');
  const { csrfToken } = await session.json();
  const response = await page.request.fetch('http://localhost:3000/api/v1' + path, {
    method,
    headers: { origin: 'http://localhost:8082', 'x-csrf-token': csrfToken },
    ...(data ? { data } : {}),
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return response.json();
}
function translations(name: string) {
  return ['ar', 'en', 'ckb'].map((locale) => ({ locale, name, description: null }));
}
test.beforeAll(async ({ browser }) => {
  fixture = await adminBrowserFixture();
  const page = await browser.newPage({ baseURL: 'http://localhost:8082' });
  await login(page);
  for (let i = 0; i < 63; i++)
    await request(page, '/admin/attributes', {
      code: 'PAGE-ATTR-' + String(i).padStart(3, '0'),
      translations: translations('Attribute ' + String(i).padStart(3, '0')),
      kind: i < 45 ? 'NUMBER' : 'CHOICE',
      unitCode: null,
      minimum: null,
      maximum: null,
      allowMultiple: false,
      public: i % 2 === 0,
      filterable: true,
      textMultiline: false,
      textMaxLength: 4000,
    });
  for (let i = 0; i < 26; i++) {
    await request(page, '/admin/attribute-groups', {
      code: 'PAGE-GROUP-' + String(i).padStart(3, '0'),
      translations: translations('Group ' + String(i).padStart(3, '0')),
    });
    await request(page, '/admin/units', {
      code: 'PAGE-UNIT-' + String(i).padStart(3, '0'),
      symbol: 'u' + i,
      dimension: 'test',
      translations: translations('Unit ' + i),
    });
  }
  const category = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Pagination products'),
  });
  for (let i = 0; i < 26; i++)
    await request(page, '/admin/products', {
      categoryId: category.id,
      modelCode: 'PAGE-PROD-' + i,
      translations: translations('Paged product ' + i),
    });
  for (let i = 0; i < 12; i++)
    await request(page, '/admin/products', {
      categoryId: category.id,
      modelCode: 'OTHER-PROD-' + i,
      translations: translations('Unrelated fixture product ' + i),
    });
  await fixture.seedImages(25);
  await page.close();
});
test.afterAll(async () => {
  await fixture?.dispose();
});
async function marker(page: Page) {
  return page.evaluate(() => {
    const id = crypto.randomUUID();
    (window as unknown as { paginationDocument: string }).paginationDocument = id;
    return id;
  });
}
async function intact(page: Page, id: string) {
  expect(
    await page.evaluate(
      () => (window as unknown as { paginationDocument: string }).paginationDocument,
    ),
  ).toBe(id);
}
function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Pagination', exact: true });
}
test('owning APIs validate bounds, filtered totals, stable ordering and role separation', async ({
  page,
}) => {
  await login(page);
  const first = await request(page, '/admin/attributes?page=1&pageSize=25'),
    second = await request(page, '/admin/attributes?page=2&pageSize=25'),
    final = await request(page, '/admin/attributes?page=99&pageSize=25');
  expect([first.totalItems, second.totalItems, final.totalItems]).toEqual([63, 63, 63]);
  expect(final.page).toBe(3);
  expect(final.items).toHaveLength(13);
  const codes = [...first.items, ...second.items, ...final.items].map((item) => item.code);
  expect(new Set(codes).size).toBe(63);
  expect(codes).toEqual([...codes].sort());
  const filtered = await request(
    page,
    '/admin/attributes?page=1&pageSize=10&kind=CHOICE&visibility=public',
  );
  expect(filtered.totalItems).toBe(9);
  expect(filtered.items).toHaveLength(9);
  const translated = await request(page, '/admin/attributes?page=1&q=Attribute%20062');
  expect(translated.totalItems).toBe(1);
  expect(translated.pageSize).toBe(25);
  const legacy = await request(page, '/admin/attributes?limit=10');
  expect(legacy.items).toHaveLength(10);
  expect(legacy.nextCursor).toBeTruthy();
  for (const route of [
    '/admin/attributes?page=0',
    '/admin/attributes?page=100001',
    '/admin/attributes?page=1&pageSize=101',
    '/admin/attributes?page=1&limit=25',
    '/admin/attributes?page=1&kind=INVALID',
    '/admin/attribute-groups?page=1&visibility=public',
    '/admin/units?page=1&q=' + 'x'.repeat(121),
    '/admin/media/assets?limit=101',
    '/admin/media/assets?search=' + 'x'.repeat(121),
  ])
    expect((await page.request.get('http://localhost:3000/api/v1' + route)).status()).toBe(400);
  expect((await page.request.get('http://localhost:3000/api/v1/staff/admins')).status()).toBe(403);
  const media = await request(
    page,
    '/admin/media/assets?limit=25&kind=IMAGE&status=READY&search=Paged%20Media',
  );
  expect(media.totalItems).toBe(25);
  expect(media.items).toHaveLength(25);
  expect(media.next).toBeNull();
  await page.context().clearCookies();
  await login(page, true);
  expect(
    (await page.request.get('http://localhost:3000/api/v1/admin/attributes?page=1')).status(),
  ).toBe(403);
});
test('63 attributes use bounded server pages, URL history, page size and normalized out-of-range pages', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attributes');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  const first = await page.locator('tbody tr').first().innerText(),
    token = await marker(page);
  await expect(nav(page)).toContainText('Showing 1–25 of 63');
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(nav(page)).toContainText('26–50 of 63');
  expect(await page.locator('tbody tr').first().innerText()).not.toBe(first);
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(13);
  await expect(nav(page)).toContainText('51–63 of 63');
  await expect(nav(page).getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await nav(page).getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(nav(page)).toContainText('26–50 of 63');
  await intact(page, token);
  await page.goBack();
  await expect(nav(page)).toContainText('51–63 of 63');
  await select(page, nav(page).getByLabel('Rows per page'), '10');
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(nav(page)).toContainText('1–10 of 63');
  await page.goto('/admin/attributes?page=99&pageSize=25');
  await expect(page).toHaveURL(/page=3/);
  await expect(page.locator('tbody tr')).toHaveCount(13);
  await page.reload();
  await expect(nav(page)).toContainText('51–63 of 63');
});
test('slow collection requests retain rows and disabled controls; a real outage retries without losing URL state', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attributes?kind=NUMBER&page=1');
  await expect(nav(page)).toContainText('1–25 of 45');
  const first = await page.locator('tbody tr').first().innerText(),
    token = await marker(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/admin/attributes?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('page') === '2') await gate;
    await route.continue();
  });
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(nav(page)).toHaveAttribute('aria-busy', 'true');
  await expect(nav(page).getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  expect(await page.locator('tbody tr').first().innerText()).toBe(first);
  release();
  await expect(nav(page)).toContainText('26–45 of 45');
  await intact(page, token);
  await page.unroute('**/api/v1/admin/attributes?*');
  await fixture.serviceAvailable('catalog', false);
  try {
    await page.goto('/admin/attributes?kind=NUMBER&page=2&q=PAGE-ATTR');
    await expect(page.getByRole('alert')).toContainText('service availability');
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  } finally {
    await fixture.serviceAvailable('catalog', true);
  }
  const failures = browserFailures.get(page)!;
  expect(failures.length).toBeGreaterThan(0);
  expect(failures.every((message) => message.includes('status of 503'))).toBe(true);
  failures.splice(0); // The intentionally unavailable service is the only expected network error.
  const retryToken = await marker(page);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(nav(page)).toContainText('26–45 of 45');
  await expect(page).toHaveURL(/kind=NUMBER.*page=2.*q=PAGE-ATTR/);
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('PAGE-ATTR');
  await intact(page, retryToken);
});

test('number filter applies before paging; reviewed edit preserves page/filter and updates the row without reload', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attributes?kind=NUMBER&page=2&pageSize=25');
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await expect(nav(page)).toContainText('26–45 of 45');
  const row = page.locator('tbody tr').first(),
    code = await row.locator('td').nth(1).innerText(),
    token = await marker(page);
  await row.getByRole('button', { name: /Actions/ }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit', exact: true });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Name (ar)', { exact: true }).fill('Updated paged attribute');
  await editor.getByRole('tab', { name: 'English', exact: true }).click();
  await editor.getByLabel('Name (en)', { exact: true }).fill('Updated paged attribute');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review change impact', exact: true });
  await review.getByRole('button', { name: 'Apply reviewed change', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page).toHaveURL(/kind=NUMBER.*page=2/);
  await page.locator('tbody tr').filter({ hasText: code }).getByRole('link').click();
  await expect(page.getByRole('dialog')).toContainText('Updated paged attribute');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await intact(page, token);
  await select(page, page.getByLabel('Type', { exact: true }).first(), 'Choice');
  await expect(page).toHaveURL(/page=1/);
  await expect(page.locator('tbody tr')).toHaveCount(18);
  await expect(nav(page)).toContainText('1–18 of 18');
});
test('deleting the only group on page two returns to page one without losing filters or reloading', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attribute-groups?q=PAGE-GROUP&page=2&pageSize=25');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const token = await marker(page);
  await page
    .locator('tbody tr')
    .getByRole('button', { name: /Actions/ })
    .click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Review change impact', exact: true })
    .getByRole('button', { name: 'Apply reviewed change', exact: true })
    .click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await expect(nav(page)).toContainText('1–25 of 25');
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue(
    'PAGE-GROUP',
  );
  await intact(page, token);
});
test('Attributes and Groups scroll in document flow without crossing rows, at desktop/tablet and 125% CSS zoom', async ({
  page,
}) => {
  await login(page);
  for (const resource of ['attributes', 'attribute-groups'])
    for (const width of [1440, 1024])
      for (const zoom of [1, 1.25]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto('/admin/' + resource + '?pageSize=50');
        await expect(page.locator('tbody tr').first()).toBeVisible();
        await page.evaluate((value) => {
          document.documentElement.style.scrollBehavior = 'auto';
          document.documentElement.style.zoom = String(value);
        }, zoom);
        const check = async () => {
          expect(
            await page
              .locator('.gl-configuration-table')
              .evaluate((e) => getComputedStyle(e).position),
          ).toBe('static');
          await expect(
            page.getByText(
              'Choose — ' + (resource === 'attributes' ? 'Attributes' : 'Attribute groups'),
              { exact: true },
            ),
          ).toHaveCount(0);
          expect(
            await page
              .locator('.gl-admin-table-scroll')
              .evaluate((e) => ({ height: e.clientHeight, scroll: e.scrollHeight })),
          ).toMatchObject({ height: expect.any(Number), scroll: expect.any(Number) });
          expect(
            await page
              .locator('.gl-admin-table-scroll')
              .evaluate((e) => e.scrollHeight - e.clientHeight),
          ).toBeLessThanOrEqual(1);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          ).toBe(false);
        };
        await check();
        await page.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }));
        await check();
        if (width === 1440 && zoom === 1)
          await page.screenshot({ path: captures + '/' + resource + '-mid.png' });
        else
          await page.screenshot({
            path: captures + '/' + resource + '-' + width + '-' + zoom * 100 + '-mid.png',
          });
        await page.evaluate(() =>
          scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
        );
        await expect(nav(page)).toBeInViewport();
        await check();
        if (width === 1440 && zoom === 1)
          await page.screenshot({ path: captures + '/' + resource + '-bottom.png' });
        await page.evaluate(() => {
          document.documentElement.style.zoom = '1';
          scrollTo({ top: 0, behavior: 'instant' });
        });
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
        if (width === 1440 && zoom === 1)
          await page.screenshot({ path: captures + '/' + resource + '-top.png' });
      }
});
test('Units and Products share row sizes and Previous/Next; cursor URL survives refresh and filters reset it', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/units?q=PAGE-UNIT&pageSize=25');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.screenshot({ path: captures + '/units-pagination.png' });
  await page.goto('/admin/products?text=Paged%20product&active=false&sort=manual&pageSize=25');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  const token = await marker(page);
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page).toHaveURL(/trail=/);
  await intact(page, token);
  await expect(page.getByLabel('Status', { exact: true })).toContainText('Inactive');
  await expect(page.getByLabel('Sort order', { exact: true })).toContainText('Sort order');
  await page.screenshot({ path: captures + '/products-pagination.png' });
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await nav(page).getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await select(page, nav(page).getByLabel('Rows per page'), '10');
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(nav(page)).toContainText('11–20 of 26');
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await page.reload();
  await expect(nav(page)).toContainText('21–26 of 26');
  await select(page, page.getByLabel('Status', { exact: true }), 'Active');
  await expect(page).toHaveURL(/page=1/);
  await expect(nav(page)).toContainText('0–0 of 0');
});
test('Arabic/Sorani mobile pagination is keyboard usable, bounded horizontally and leaves the category tree unchanged', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  for (const [locale, resource] of [
    ['ar', 'attributes'],
    ['ckb', 'attribute-groups'],
  ] as const) {
    await page.locator('header select').selectOption(locale);
    await page.goto('/admin/' + resource + '?pageSize=10');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('tbody tr')).toHaveCount(10);
    const pagination = page.locator('.gl-data-pagination');
    await pagination.scrollIntoViewIfNeeded();
    const next = pagination.locator('.gl-data-pagination-controls > button').last();
    await next.focus();
    await next.press('Enter');
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator('tbody tr')).toHaveCount(10);
    await page.screenshot({ path: captures + '/' + locale + '-' + resource + '-mobile.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    );
    await expect(pagination.locator('.gl-data-pagination-pages')).not.toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/categories');
  await expect(page.getByRole('tree')).toBeVisible();
  await expect(page.locator('.gl-data-pagination')).toHaveCount(0);
});

test('Media final-page detection and server filename filter; Super Admin directory uses the same controls', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/media');
  await expect(page.locator('.gl-asset-card')).toHaveCount(25);
  const mediaToken = await marker(page);
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.gl-asset-card')).toHaveCount(1);
  await intact(page, mediaToken);
  await page.reload();
  await expect(page.locator('.gl-asset-card')).toHaveCount(1);
  await expect(nav(page).getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByLabel('Search', { exact: true }).fill('not-present-name');
  await expect(page.locator('.gl-asset-card')).toHaveCount(0);
  await expect(nav(page)).toContainText('0–0 of 0');
  await page.getByLabel('Search', { exact: true }).fill('');
  await expect(page.locator('.gl-asset-card')).toHaveCount(25);
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.gl-asset-card')).toHaveCount(1);
  await nav(page).scrollIntoViewIfNeeded();
  await expect(page.locator('.gl-asset-card img')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.gl-asset-card img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await page.screenshot({ path: captures + '/media-pagination.png' });
  await page.context().clearCookies();
  await login(page, true);
  for (let i = 0; i < 25; i++)
    await request(page, '/staff/admins', {
      email: 'paged' + i + '@example.test',
      displayName: 'Paged Admin ' + i,
    });
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  const token = await marker(page);
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await intact(page, token);
  await page.screenshot({ path: captures + '/accounts-pagination.png' });
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await nav(page).getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await nav(page).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const lastAccount = page.locator('tbody tr');
  await lastAccount.getByRole('button', { name: 'Actions', exact: true }).click();
  await lastAccount.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete', exact: true })
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await expect(nav(page)).toContainText('1–25 of 25');
});
