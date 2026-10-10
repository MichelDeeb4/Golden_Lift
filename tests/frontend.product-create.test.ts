import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
const captureRoot =
  process.env.BUSINESS_PLATFORM_ADMIN_CAPTURE_ROOT ??
  process.env.BUSINESS_PLATFORM_STAFF_CAPTURE_DIR;
const captures = captureRoot
  ? captureRoot + '/product-create'
  : 'documentation/assets/product-create';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  fixture = await adminBrowserFixture({
    ports: { gateway: 3400, media: 3403, catalogEvents: 3502, mediaEvents: 3503 },
  });
});
test.afterAll(async () => {
  await fixture?.dispose();
});
async function login(page: Page, locale = 'en') {
  await page.addInitScript((value) => localStorage.setItem('bp.locale', value), locale);
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(fixture.adminEmail);
  await page.locator('input[type="password"]').fill(fixture.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin\/?$/);
}
async function request(page: Page, route: string, data?: unknown) {
  const session = await page.request.get(fixture.gatewayOrigin + '/api/v1/auth/session');
  const { csrfToken } = await session.json();
  const response = await page.request.fetch(fixture.gatewayOrigin + '/api/v1' + route, {
    method: data ? 'POST' : 'GET',
    headers: { origin: 'http://localhost:8082', 'x-csrf-token': csrfToken },
    ...(data ? { data } : {}),
  });
  expect(response.status()).toBeLessThan(300);
  return response.json();
}
async function category(page: Page, name: string, parentId: string | null = null) {
  const parent = parentId
    ? await request(page, '/admin/categories/' + parentId + '?locale=en')
    : null;
  return request(page, '/admin/categories', {
    parentId,
    expectedParentVersion: parent?.version ?? null,
    translations: ['ar', 'en', 'ckb'].map((locale) => ({ locale, name, description: null })),
  });
}
async function open(page: Page, locale: string) {
  await page.goto('/admin/products/new');
  const label = { en: 'Create Product', ar: 'إنشاء منتج', ckb: 'دروستکردنی بەرهەم' }[locale];
  const modal = page.getByRole('dialog', { name: label, exact: true });
  await expect(modal).toBeVisible();
  return modal;
}
async function choose(page: Page, modal: Locator, name: string) {
  await modal
    .locator('button')
    .filter({ hasText: /Browse categories|تصفح الفئات|گەڕان لە پۆلەکان/ })
    .click();
  const picker = page.getByRole('dialog').filter({ has: page.getByRole('tree') });
  await picker.getByRole('link', { name, exact: true }).click();
  await expect(picker).not.toBeVisible();
}
test('minimal creation enables from watched fields, rejects parent selection and navigates without reload', async ({
  page,
}) => {
  await login(page);
  const root = await category(page, 'Draft Parent'),
    leaf = await category(page, 'Draft Leaf', root.id);
  const modal = await open(page, 'en'),
    submit = modal.locator('button[type="submit"]');
  await expect(submit).toBeDisabled();
  await modal.getByRole('button', { name: /Browse categories/ }).click();
  const picker = page.getByRole('dialog').filter({ has: page.getByRole('tree') });
  await picker.getByRole('link', { name: 'Draft Parent', exact: true }).click();
  await expect(picker.getByRole('status').filter({ hasText: 'Products can only' })).toContainText(
    'leaf categories',
  );
  await expect(submit).toBeDisabled();
  await picker.getByRole('link', { name: 'Draft Leaf', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect(submit).toBeDisabled();
  await modal.getByLabel('Name (ar)', { exact: true }).fill('   ');
  await expect(submit).toBeDisabled();
  await modal.getByLabel('Name (ar)', { exact: true }).fill('منتج مسودة');
  await modal.getByLabel('Code', { exact: true }).fill('DRAFT-E2E');
  await expect(submit).toBeEnabled();
  await expect(modal.getByLabel('Type', { exact: true })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /Cover/ })).toHaveCount(0);
  await modal.screenshot({ path: captures + '/create-en.png' });
  const marker = await page.evaluate(() => {
    const token = crypto.randomUUID();
    (window as unknown as { draftDocument: string }).draftDocument = token;
    return token;
  });
  const submitted = page.waitForRequest(
    (request) => request.method() === 'POST' && /\/api\/v1\/admin\/products$/.test(request.url()),
  );
  await submit.click();
  const body = (await submitted).postDataJSON();
  expect(Object.keys(body).sort()).toEqual(['categoryId', 'modelCode', 'translations']);
  expect(body.categoryId).toBe(leaf.id);
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+\?/);
  expect(
    await page.evaluate(() => (window as unknown as { draftDocument: string }).draftDocument),
  ).toBe(marker);
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Product created' })).toBeVisible();
  await expect(page.getByLabel('Code', { exact: true })).toHaveValue('DRAFT-E2E');
  await expect(page.getByRole('button', { name: /Browse categories/ })).toContainText('Draft Leaf');
  const id = new URL(page.url()).pathname.split('/').at(-1);
  let product = await request(page, '/admin/products/' + id + '/management');
  expect(product.active).toBe(false);
  expect(product.coverAssetId).toBeNull();
  expect(product.values).toEqual([]);
  expect(product.modelCode).toBe('DRAFT-E2E');
  await page.getByRole('link', { name: 'Products', exact: true }).first().click();
  await expect(page.getByRole('rowheader').filter({ hasText: 'منتج مسودة' })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { draftDocument: string }).draftDocument),
  ).toBe(marker);
  await page.goBack();
  await expect(page.getByLabel('Code', { exact: true })).toHaveValue('DRAFT-E2E');
  await page.getByRole('button', { name: /Translations/, exact: false }).click();
  await page.getByLabel('Name (ar)', { exact: true }).fill('مسودة محفوظة');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Edit.*Products/ })).toBeVisible();
  product = await request(page, '/admin/products/' + id + '/management');
  expect(product.translations.find((row: { locale: string }) => row.locale === 'ar').name).toBe(
    'مسودة محفوظة',
  );
  expect(product.active).toBe(false);
  await page.screenshot({ path: captures + '/draft-editor.png' });
});
test('live Identity requires a session, mutation CSRF and the approved Origin', async ({
  page,
}) => {
  await login(page);
  const leaf = await category(page, 'Security Leaf');
  const session = await page.request.get(fixture.gatewayOrigin + '/api/v1/auth/session');
  const { csrfToken } = await session.json();
  const data = {
    categoryId: leaf.id,
    translations: [{ locale: 'ar', name: 'مسودة محمية', description: null }],
  };
  const missingCsrf = await page.request.post(fixture.gatewayOrigin + '/api/v1/admin/products', {
    data,
    headers: { origin: 'http://localhost:8082' },
  });
  expect(missingCsrf.status()).toBe(403);
  const foreignOrigin = await page.request.post(fixture.gatewayOrigin + '/api/v1/admin/products', {
    data,
    headers: { origin: 'http://untrusted.example.test', 'x-csrf-token': csrfToken },
  });
  expect(foreignOrigin.status()).toBe(403);
  await page.context().clearCookies();
  const unauthenticated = await page.request.post(
    fixture.gatewayOrigin + '/api/v1/admin/products',
    {
      data,
      headers: { origin: 'http://localhost:8082', 'x-csrf-token': csrfToken },
    },
  );
  expect(unauthenticated.status()).toBe(401);
});
test('a leaf that gained children is rejected with useful feedback while preserving the draft', async ({
  page,
}) => {
  await login(page);
  const leaf = await category(page, 'Changed Leaf');
  const modal = await open(page, 'en');
  await choose(page, modal, 'Changed Leaf');
  await modal.getByLabel('Name (ar)', { exact: true }).fill('مسودة باقية');
  await category(page, 'New Child', leaf.id);
  await modal.locator('button[type="submit"]').click();
  await expect(modal.getByRole('alert')).toContainText('leaf categories');
  await expect(modal.getByLabel('Name (ar)', { exact: true })).toHaveValue('مسودة باقية');
  await expect(modal.locator('button[type="submit"]')).toBeEnabled();
  await modal.getByRole('button', { name: /Browse categories/ }).click();
  const picker = page.getByRole('dialog').filter({ has: page.getByRole('tree') });
  await picker.getByRole('link', { name: 'Changed Leaf', exact: true }).click();
  await picker.getByRole('link', { name: 'New Child', exact: true }).click();
  await modal.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+\?/);
});
test('network failure clears pending state, preserves input and permits a successful retry', async ({
  page,
}) => {
  await login(page);
  await category(page, 'Retry Leaf');
  const modal = await open(page, 'en');
  await choose(page, modal, 'Retry Leaf');
  await modal.getByLabel('Name (ar)', { exact: true }).fill('مسودة محاولة');
  const submit = modal.locator('button[type="submit"]');
  await fixture.serviceAvailable('catalog', false);
  try {
    await submit.click();
    await expect(modal.getByRole('alert')).toContainText('could not be reached');
    await expect(submit).toBeEnabled();
    await expect(modal.getByLabel('Name (ar)', { exact: true })).toHaveValue('مسودة محاولة');
    await expect(modal.getByRole('button', { name: /Browse categories/ })).toContainText(
      'Retry Leaf',
    );
  } finally {
    await fixture.serviceAvailable('catalog', true);
  }
  await submit.click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+\?/);
});
for (const locale of ['ar', 'ckb'])
  test(`${locale} mobile modal and keyboard leaf selection create a draft`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, locale);
    await category(page, 'RTL Leaf ' + locale);
    const modal = await open(page, locale);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const submit = modal.locator('button[type="submit"]');
    await expect(submit).toBeDisabled();
    await modal
      .locator('button')
      .filter({ hasText: /تصفح الفئات|گەڕان لە پۆلەکان/ })
      .click();
    const picker = page.getByRole('dialog').filter({ has: page.getByRole('tree') });
    const row = picker.getByRole('treeitem', { name: 'RTL Leaf ' + locale, exact: true });
    await row.focus();
    await row.press('Enter');
    await expect(picker).not.toBeVisible();
    const name = modal.locator('input[name="names.ar"]');
    await name.fill('منتج ' + locale);
    await expect(submit).toBeEnabled();
    await expect(
      modal.locator('label[for="' + (await name.getAttribute('id')) + '"]'),
    ).not.toBeEmpty();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
    await modal.screenshot({
      path: captures + '/create-' + locale + '-mobile.png',
    });
    await submit.click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+\?/);
  });
