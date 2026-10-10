import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>;
const captureRoot =
  process.env.BUSINESS_PLATFORM_ADMIN_CAPTURE_ROOT ??
  process.env.BUSINESS_PLATFORM_STAFF_CAPTURE_DIR;
const captures = captureRoot ? captureRoot + '/modals' : 'documentation/assets/admin-crud-modals';
test.describe.configure({ mode: 'default' });
test.beforeAll(async () => {
  fixture = await adminBrowserFixture({
    ports: { gateway: 3400, media: 3403, catalogEvents: 3502, mediaEvents: 3503 },
  });
});
test.afterAll(async () => {
  await fixture?.dispose();
});
async function login(page: Page, superAdmin = false) {
  await page.goto('/admin/login');
  await page.evaluate(() => localStorage.setItem('bp.locale', 'en'));
  await page.reload();
  await page
    .getByLabel('Email', { exact: true })
    .fill(superAdmin ? fixture.superEmail : fixture.adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Staff sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
async function names(dialog: Locator, name: string) {
  await dialog.getByRole('tab').first().click();
  await dialog.getByLabel('Name (ar)', { exact: true }).fill(name + ' Arabic');
  await dialog.getByRole('tab', { name: 'English', exact: true }).click();
  await dialog.getByLabel('Name (en)', { exact: true }).fill(name);
}
async function marker(page: Page) {
  return page.evaluate(() => {
    const value = crypto.randomUUID();
    (window as unknown as { crudDocument: string }).crudDocument = value;
    return value;
  });
}
async function intact(page: Page, value: string) {
  expect(
    await page.evaluate(() => (window as unknown as { crudDocument: string }).crudDocument),
  ).toBe(value);
}
async function apply(page: Page) {
  await page
    .getByRole('dialog', { name: 'Review change impact', exact: true })
    .getByRole('button', { name: 'Apply reviewed change', exact: true })
    .click();
}
test('configuration modal CRUD persists without document reload and keeps Create visible after selection', async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page);
  for (const [resource, action] of [
    ['attributes', 'Create Attribute'],
    ['attribute-groups', 'Create Group'],
    ['units', 'Create Unit'],
  ]) {
    await page.goto('/admin/' + resource);
    const token = await marker(page);
    const name = 'Modal ' + resource;
    await page.getByRole('button', { name: action, exact: true }).first().click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Code', { exact: true }).fill('modal-' + resource);
    await names(dialog, name);
    if (resource === 'units') {
      await dialog.getByLabel('Symbol', { exact: true }).fill('mm');
      await dialog.getByLabel('Dimension', { exact: true }).fill('length');
    }
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    if (resource === 'attributes') {
      for (const label of ['Type', 'Unit', 'Visibility', 'Actions'])
        await expect(page.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
    }
    await intact(page, token);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.locator('tr[aria-selected="true"]').getByRole('button')).toBeVisible();
    await expect(page.getByRole('button', { name: action, exact: true }).first()).toBeVisible();
    await intact(page, token);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Edit', exact: true });
    await names(dialog, name + ' updated');
    if (resource === 'attributes') {
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      await dialog.screenshot({
        path: captures + '/attribute-edit-desktop.png',
        animations: 'disabled',
      });
    }
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await apply(page);
    await expect(page.getByRole('dialog', { name: 'Edit', exact: true })).not.toBeVisible();
    await expect(page.getByRole('link', { name: name + ' updated', exact: true })).toBeVisible();
    await intact(page, token);
    await page.reload();
    await expect(page.getByRole('link', { name: name + ' updated', exact: true })).toBeVisible();
    const deleteToken = await marker(page);
    await page.getByRole('link', { name: name + ' updated', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: name + ' updated', exact: true }) })
      .getByRole('button', { name: /Actions/ })
      .click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Deletion impact' })
      .getByRole('button', { name: 'Permanently delete', exact: true })
      .click();
    await expect(page.getByRole('link', { name: name + ' updated', exact: true })).toHaveCount(0);
    await intact(page, deleteToken);
    await page.reload();
    await expect(page.getByRole('link', { name: name + ' updated', exact: true })).toHaveCount(0);
  }
});
test('category modal create, edit and deletion update the tree without document reload', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/categories');
  let token = await marker(page);
  await page.getByRole('button', { name: 'Create Root Category', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await names(dialog, 'Modal category');
  await dialog.getByRole('button', { name: 'Create Root Category', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Modal category', exact: true })).toBeVisible();
  await intact(page, token);
  await page.reload();
  await page.getByRole('link', { name: 'Modal category', exact: true }).click();
  token = await marker(page);
  await page
    .locator('.bp-category-detail')
    .getByRole('button', { name: /^Actions/ })
    .click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog');
  await names(dialog, 'Modal category updated');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Modal category updated', exact: true }),
  ).toBeVisible();
  await intact(page, token);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Modal category updated', exact: true }),
  ).toBeVisible();
  token = await marker(page);
  await page
    .locator('.bp-category-detail')
    .getByRole('button', { name: 'Actions — Modal category updated', exact: true })
    .click();
  await page
    .locator('.bp-category-detail')
    .getByRole('menuitem', { name: 'Delete', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Deletion impact' })
    .getByRole('button', { name: 'Permanently delete', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/categories$/);
  await intact(page, token);
  await expect(page.getByRole('link', { name: 'Modal category updated', exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole('link', { name: 'Modal category updated', exact: true })).toHaveCount(
    0,
  );
});
test('Super Admin cannot access Catalog create actions', async ({ page }) => {
  await login(page, true);
  await page.goto('/admin/attributes');
  await expect(page.getByRole('button', { name: 'Create Attribute', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
});

test('product modal creation, editor navigation and deletion preserve the document and PostgreSQL state', async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page);
  let dialog;
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Create Root Category', exact: true }).click();
  dialog = page.getByRole('dialog');
  await names(dialog, 'Modal product category');
  await dialog.getByRole('button', { name: 'Create Root Category', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto('/admin/products?text=Modal');
  let token = await marker(page);
  await page.getByRole('button', { name: 'Create Product', exact: true }).first().click();
  dialog = page.getByRole('dialog', { name: 'Create Product', exact: true });
  await names(dialog, 'Modal product');
  await dialog.getByRole('button', { name: /Browse categories/ }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('link', { name: 'Modal product category', exact: true })
    .click();
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  await dialog.screenshot({
    path: captures + '/product-create-desktop.png',
    animations: 'disabled',
  });
  await dialog.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}(?:\?.*)?$/);
  await intact(page, token);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  expect((await fixture.persistence(id)).product).not.toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Modal product', exact: true })).toBeVisible();
  token = await marker(page);
  await page.locator('main').getByRole('link', { name: 'Products', exact: true }).first().click();
  await page
    .locator('tbody tr')
    .filter({ has: page.getByRole('link', { name: 'Modal product', exact: true }) })
    .getByRole('button', { name: /Actions/ })
    .click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Deletion impact' })
    .getByRole('button', { name: 'Permanently delete', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/products\?text=Modal$/);
  await intact(page, token);
  await expect.poll(async () => (await fixture.persistence(id)).product).toBeNull();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Modal product', exact: true })).toHaveCount(0);
});

test('Media upload reaches READY and updates the grid without document reload', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/media');
  const token = await marker(page);
  await page.getByRole('button', { name: 'Upload Media', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer
    .getByLabel('Choose file', { exact: true })
    .setInputFiles({ name: 'Modal upload.png', mimeType: 'image/png', buffer: fixture.image });
  await drawer.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(drawer.getByText('READY', { exact: true })).toBeVisible({ timeout: 30000 });
  await intact(page, token);
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Modal upload.png', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.reload();
  await expect(page.getByRole('link', { name: 'Modal upload.png', exact: true })).toBeVisible();
});

test('attribute modal preserves conflicts and filters through deprecation', async ({ page }) => {
  await login(page);
  await page.goto('/admin/attributes?kind=NUMBER&state=active&q=Conflict');
  await page.getByRole('button', { name: 'Create Attribute', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code', { exact: true }).fill('modal-conflict');
  await names(dialog, 'Conflict attribute');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const link = page.getByRole('link', { name: 'Conflict attribute', exact: true });
  const id = (await link.getAttribute('href'))!.split('/').pop()!;
  await link.click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit', exact: true });
  await names(dialog, 'Conflict draft');
  const token = await marker(page);
  await concurrentAttributeChange(page, id);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('record or schema changed');
  await expect(dialog.getByLabel('Name (en)', { exact: true })).toHaveValue('Conflict draft');
  await intact(page, token);
  await dialog.getByRole('button', { name: 'Reload latest', exact: true }).click();
  await expect(dialog.getByLabel('Name (en)', { exact: true })).toHaveValue('Conflict latest');
  await names(dialog, 'Conflict recovered');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await concurrentAttributeChange(page, id);
  await apply(page);
  await expect(page.getByRole('dialog').last().getByRole('alert')).toContainText(
    'record or schema changed',
  );
  await expect(
    page
      .getByRole('dialog', { name: 'Edit', exact: true })
      .getByLabel('Name (en)', { exact: true }),
  ).toHaveValue('Conflict recovered');
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Reload latest', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Review change impact', exact: true }),
  ).not.toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name (en)', { exact: true })).toHaveValue('Conflict latest');
  await names(dialog, 'Conflict recovered');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await apply(page);
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Review change impact', exact: true }),
  ).not.toBeVisible();
  expect(new URL(page.url()).searchParams.get('kind')).toBe('NUMBER');
  expect(new URL(page.url()).searchParams.get('q')).toBe('Conflict');
  await page
    .getByRole('dialog', { name: 'modal-conflict', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  const row = page.getByRole('row').filter({ hasText: 'modal-conflict' });
  await row.getByRole('button', { name: 'Actions — modal-conflict', exact: true }).click();
  await row.getByRole('menuitem', { name: 'Deprecated', exact: true }).click();
  await apply(page);
  await expect(page.getByRole('link', { name: 'Conflict recovered', exact: true })).toHaveCount(0);
  await intact(page, token);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Conflict recovered', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'State', exact: true }).click();
  await page.getByRole('option', { name: 'Deprecated', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Conflict recovered', exact: true })).toBeVisible();
});

test('mobile RTL modals retain drafts on Stay, discard on Leave and restore focus', async ({
  page,
}) => {
  page.on('dialog', async (prompt) => {
    if (prompt.type() === 'beforeunload') await prompt.accept();
  });
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const labels = { en: 'Create Attribute', ar: 'إنشاء خاصية', ckb: 'دروستکردنی تایبەتمەندی' };
  for (const locale of ['en', 'ar', 'ckb'] as const) {
    await page.evaluate((locale) => localStorage.setItem('bp.locale', locale), locale);
    await page.goto('/admin/attributes');
    const create = page.getByRole('button', { name: labels[locale], exact: true }).first();
    await create.click();
    const dialog = page.getByRole('dialog', { name: labels[locale], exact: true });
    const code = dialog.locator('input').first();
    await code.fill('retained-' + locale);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^(Stay|البقاء|مانەوە)$/ }).click();
    await expect(dialog).toBeVisible();
    await expect(code).toHaveValue('retained-' + locale);
    const box = await dialog.boundingBox();
    await dialog.screenshot({
      path: `${captures}/attribute-create-${locale}-mobile.png`,
      animations: 'disabled',
    });
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', {
        name: /^(Leave without saving|المغادرة دون حفظ|دەرچوون بەبێ پاشەکەوت)$/,
      })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(create).toBeFocused();
    await create.click();
    await expect(dialog.locator('input').first()).toHaveValue('');
    await code.fill('reopened-' + locale);
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', {
        name: /^(Leave without saving|المغادرة دون حفظ|دەرچوون بەبێ پاشەکەوت)$/,
      })
      .click();
  }
});

async function concurrentAttributeChange(page: Page, id: string) {
  await page.evaluate(
    async ({ id, origin }) => {
      const session: { csrfToken: string } = await (
        await fetch(origin + '/auth/session', { credentials: 'include' })
      ).json();
      const current: { version: string } = await (
        await fetch(origin + '/admin/attributes/' + id, { credentials: 'include' })
      ).json();
      const change = {
        kind: 'definition.update',
        definition: {
          code: 'modal-conflict',
          kind: 'NUMBER',
          unitCode: null,
          minimum: null,
          maximum: null,
          allowMultiple: false,
          public: false,
          filterable: false,
          textMultiline: false,
          textMaxLength: 4000,
          translations: [
            { locale: 'ar', name: 'Conflict latest Arabic', description: null },
            { locale: 'en', name: 'Conflict latest', description: null },
          ],
        },
      };
      const call = async (path: string, body: unknown) => {
        const response = await fetch(origin + path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Concurrent fixture mutation failed: ' + response.status);
        return response.json();
      };
      const preview: { precondition: string } = await call(
        '/admin/attributes/' + id + '/changes/preview',
        { change, expectedVersion: current.version, expectedSchemaRevision: null },
      );
      await call('/admin/attributes/' + id + '/changes', {
        change,
        expectedVersion: current.version,
        expectedSchemaRevision: null,
        precondition: preview.precondition,
        confirm: true,
      });
    },
    { id, origin: fixture.gatewayOrigin + '/api/v1' },
  );
}
