import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>;
test.beforeAll(async () => {
  fixture = await adminBrowserFixture({
    ports: { gateway: 3400, media: 3403, catalogEvents: 3502, mediaEvents: 3503 },
  });
});
test.afterAll(async () => {
  await fixture?.dispose();
});
test.describe.configure({ mode: 'serial' });
const translations = (name: string) =>
  ['ar', 'en', 'ckb'].map((locale) => ({ locale, name, description: null }));
async function request(page: Page, path: string, data?: unknown, method = data ? 'POST' : 'GET') {
  const { csrfToken } = await (
    await page.request.get(fixture.gatewayOrigin + '/api/v1/auth/session')
  ).json();
  const response = await page.request.fetch(fixture.gatewayOrigin + '/api/v1' + path, {
    method,
    headers: { origin: 'http://localhost:8082', 'x-csrf-token': csrfToken },
    ...(data ? { data } : {}),
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return response.json();
}
test('blocked Category dialog has no delete action; Product deletion converges through signed relays and removes owned files', async ({
  page,
}) => {
  test.setTimeout(120000);
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.addInitScript(() => localStorage.setItem('bp.locale', 'en'));
  await page.goto('/admin/login');
  await page.locator('input[type=email]').fill(fixture.adminEmail);
  await page.locator('input[type=password]').fill(fixture.password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  const category = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Deletion leaf'),
  });
  const product = await request(page, '/admin/products', {
    categoryId: category.id,
    modelCode: 'DELETE-' + randomUUID(),
    translations: translations('Delete owned image'),
  });
  await request(page, `/admin/products/${product.id}/media`, {
    expectedVersion: product.version,
    coverAssetId: fixture.assetId,
    media: [{ id: randomUUID(), assetId: fixture.assetId, kind: 'IMAGE', translations: [] }],
  });
  await page.goto('/admin/categories/' + category.id);
  await page
    .getByRole('region', { name: 'Selected category', exact: true })
    .getByRole('button', { name: /Actions.*Deletion leaf/ })
    .click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  let modal = page.getByRole('dialog', { name: 'Deletion impact', exact: true });
  await expect(modal).toContainText('Deletion blocked');
  await expect(modal.getByRole('button', { name: 'Permanently delete', exact: true })).toHaveCount(
    0,
  );
  await modal.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.goto('/admin/products');
  const marker = await page.evaluate(() => {
    (window as unknown as { deletionMarker: string }).deletionMarker = crypto.randomUUID();
    return (window as unknown as { deletionMarker: string }).deletionMarker;
  });
  const row = page.getByRole('row').filter({ hasText: 'Delete owned image' });
  await row.getByRole('button', { name: /Actions/ }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Deletion impact', exact: true });
  await expect(modal).toContainText('IMAGE: 1');
  await modal.getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
  await expect(row).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { deletionMarker: string }).deletionMarker),
  ).toBe(marker);
  await expect
    .poll(() => fixture.deletionEvidence(fixture.assetId, product.id), { timeout: 30000 })
    .toEqual({ assetExists: false, objects: [], productExists: false, registrationExists: false });
  expect((await request(page, `/admin/categories/${category.id}?locale=en`)).id).toBe(category.id);
  const cover = await fixture.newReadyImage();
  const stale = await request(page, `/admin/media/assets/${cover}/deletion-impact`);
  const coverCategory = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    coverAssetId: cover,
    translations: translations('Independent cover'),
  });
  const { csrfToken } = await (
    await page.request.get(fixture.gatewayOrigin + '/api/v1/auth/session')
  ).json();
  const conflict = await page.request.delete(
    fixture.gatewayOrigin + `/api/v1/admin/media/assets/${cover}`,
    {
      headers: { origin: 'http://localhost:8082', 'x-csrf-token': csrfToken },
      data: {
        confirmed: true,
        expectedVersion: stale.expectedVersion,
        impactRevision: stale.impactRevision,
      },
    },
  );
  expect(conflict.status()).toBe(409);
  expect((await fixture.deletionEvidence(cover)).assetExists).toBe(true);
  const current = await request(page, `/admin/media/assets/${cover}/deletion-impact`);
  const operation = await request(
    page,
    `/admin/media/assets/${cover}`,
    {
      confirmed: true,
      expectedVersion: current.expectedVersion,
      impactRevision: current.impactRevision,
    },
    'DELETE',
  );
  expect(operation.status).toBe('MEDIA_CLEANUP');
  await expect
    .poll(
      async () => (await request(page, `/admin/media/deletion-operations/${operation.id}`)).status,
      { timeout: 30000 },
    )
    .toBe('COMPLETED');
  await expect
    .poll(() => fixture.deletionEvidence(cover), { timeout: 30000 })
    .toEqual({ assetExists: false, objects: [], productExists: null, registrationExists: false });
  expect(
    (await request(page, `/admin/categories/${coverCategory.id}?locale=en`)).coverAssetId,
  ).toBeNull();
  expect(dialogs).toEqual([]);
});

test('shared dialogs delete Group, Attribute, unused Unit and empty Category while preserving reachable values and blocking referenced Units', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem('bp.locale', 'en'));
  await page.goto('/admin/login');
  await page.locator('input[type=email]').fill(fixture.adminEmail);
  await page.locator('input[type=password]').fill(fixture.password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  const unit = await request(page, '/admin/units', {
    code: 'deletion-mm',
    symbol: 'mm',
    dimension: 'length',
    translations: translations('Used deletion unit'),
  });
  const unused = await request(page, '/admin/units', {
    code: 'deletion-unused',
    symbol: 'u',
    dimension: 'length',
    translations: translations('Unused deletion unit'),
  });
  const attribute = async (code: string, unitCode: string | null) =>
    request(page, '/admin/attributes', {
      code,
      kind: 'NUMBER',
      unitCode,
      minimum: null,
      maximum: null,
      allowMultiple: false,
      public: true,
      filterable: true,
      textMultiline: false,
      textMaxLength: 4000,
      translations: translations(code),
    });
  const material = await attribute('DELETE-MATERIAL', null),
    finish = await attribute('DELETE-FINISH', unit.code);
  const a = await request(page, '/admin/attribute-groups', {
      code: 'DELETE-GROUP-A',
      attributeIds: [material.id, finish.id],
      translations: translations('Delete Group A'),
    }),
    b = await request(page, '/admin/attribute-groups', {
      code: 'DELETE-GROUP-B',
      attributeIds: [material.id],
      translations: translations('Keep Group B'),
    });
  const category = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    groupIds: [a.id, b.id],
    translations: translations('Configuration deletion leaf'),
  });
  const product = await request(page, '/admin/products', {
    categoryId: category.id,
    translations: translations('Preserved configuration Product'),
  });
  await request(
    page,
    '/admin/products/' + product.id,
    {
      expectedVersion: product.version,
      expectedSchemaRevision: product.schemaRevision,
      values: [
        { definitionId: material.id, value: { kind: 'NUMBER', number: '12.000001' } },
        { definitionId: finish.id, value: { kind: 'NUMBER', number: '9' } },
      ],
    },
    'PATCH',
  );
  async function open(resource: string, label: string) {
    await page.goto('/admin/' + resource);
    await page
      .getByRole('row')
      .filter({ hasText: label })
      .getByRole('button', { name: /Actions/ })
      .click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    return page.getByRole('dialog', { name: 'Deletion impact', exact: true });
  }
  let modal = await open('units', unit.code);
  await expect(modal).toContainText('Deletion blocked');
  await expect(modal.getByRole('button', { name: 'Permanently delete', exact: true })).toHaveCount(
    0,
  );
  await modal.getByRole('button', { name: 'Close', exact: true }).last().click();
  modal = await open('attribute-groups', 'DELETE-GROUP-A');
  await expect(modal).toContainText('newly unreachable Product values: 1');
  await modal.getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(
    (await request(page, `/admin/products/${product.id}/management`)).values.map(
      (v: { definitionId: string }) => v.definitionId,
    ),
  ).toEqual([material.id]);
  expect((await request(page, `/admin/attribute-groups/${b.id}`)).id).toBe(b.id);
  expect((await request(page, `/admin/attributes/${finish.id}`)).id).toBe(finish.id);
  modal = await open('attributes', 'DELETE-MATERIAL');
  await modal.getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect((await request(page, `/admin/products/${product.id}/management`)).values).toEqual([]);
  expect((await request(page, `/admin/attribute-groups/${b.id}`)).id).toBe(b.id);
  modal = await open('units', unused.code);
  await modal.getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect((await request(page, `/admin/attributes/${finish.id}`)).unit.code).toBe(unit.code);
  modal = await open('products', 'Preserved configuration Product');
  await modal.getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.goto('/admin/categories/' + category.id);
  await page
    .getByRole('region', { name: 'Selected category', exact: true })
    .getByRole('button', { name: /Actions/ })
    .click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Deletion impact', exact: true });
  await expect(modal).toContainText('Categories: 1');
  await modal.getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await request(page, `/admin/attribute-groups/${b.id}`)).id).toBe(b.id);
});

test('mobile deletion dialogs support English, Arabic and Kurdish without viewport overflow', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bp.locale', 'en'));
  await page.goto('/admin/login');
  await page.locator('input[type=email]').fill(fixture.adminEmail);
  await page.locator('input[type=password]').fill(fixture.password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const copy of [
    { locale: 'en', remove: 'Delete', title: 'Deletion impact', confirm: 'Permanently delete' },
    { locale: 'ar', remove: 'حذف', title: 'أثر الحذف', confirm: 'حذف نهائي' },
    { locale: 'ckb', remove: 'سڕینەوە', title: 'کاریگەری سڕینەوە', confirm: 'سڕینەوەی هەمیشەیی' },
  ]) {
    const code = 'mobile-' + copy.locale + '-' + randomUUID();
    await request(page, '/admin/units', {
      code,
      symbol: 'u',
      dimension: 'length',
      translations: translations(code),
    });
    await page.goto('/admin/units');
    await page.locator('header select').selectOption(copy.locale);
    await page.getByRole('row').filter({ hasText: code }).getByRole('button').click();
    await page.getByRole('menuitem', { name: copy.remove, exact: true }).click();
    const modal = page.getByRole('dialog', { name: copy.title, exact: true });
    const confirm = modal.getByRole('button', { name: copy.confirm, exact: true });
    await expect(confirm).toBeVisible();
    const bounds = await modal.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    await confirm.click();
    await expect(modal).toHaveCount(0);
    const units = await request(page, '/admin/units');
    expect(JSON.stringify(units)).not.toContain(code);
  }
});
