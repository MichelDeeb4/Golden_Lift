import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>;
const captureRoot =
  process.env.BUSINESS_PLATFORM_ADMIN_CAPTURE_ROOT ??
  process.env.BUSINESS_PLATFORM_STAFF_CAPTURE_DIR;
const captures = captureRoot
  ? captureRoot + '/actions'
  : 'documentation/assets/admin-actions-dialogs-filters/after';
test.describe.configure({ mode: 'serial' });
const nativeDialogs = new WeakMap<Page, string[]>();
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const seen: string[] = [];
  nativeDialogs.set(page, seen);
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('dialog', async (dialog) => {
    seen.push(dialog.type());
    await dialog.dismiss();
  });
});
test.afterEach(async ({ page }) => {
  expect(nativeDialogs.get(page)).toEqual([]);
  expect(browserErrors.get(page)).toEqual([]);
});
async function login(page: Page, superAdmin = false) {
  await page.addInitScript(() => localStorage.setItem('bp.locale', 'en'));
  await page.goto('/admin/login');
  await page
    .locator('input[type=email]')
    .fill(superAdmin ? fixture.superEmail : fixture.adminEmail);
  await page.locator('input[type=password]').fill(fixture.password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(superAdmin ? /super-admin\/admins/ : /\/admin\/?$/);
  // The pre-login unauthenticated session probe intentionally returns 401.
  browserErrors.get(page)?.splice(0);
}
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
const translations = (name: string) =>
  ['ar', 'en', 'ckb'].map((locale) => ({ locale, name, description: null }));
test.beforeAll(async ({ browser }) => {
  fixture = await adminBrowserFixture({
    ports: { gateway: 3400, media: 3403, catalogEvents: 3502, mediaEvents: 3503 },
  });
  const page = await browser.newPage();
  await login(page);
  for (let i = 0; i < 26; i++)
    await request(page, '/admin/attribute-groups', {
      code: 'ACTION-GROUP-' + String(i).padStart(2, '0'),
      translations: translations('Group ' + i),
    });
  await request(page, '/admin/attributes', {
    code: 'ACTION-CHOICE',
    kind: 'CHOICE',
    unitCode: null,
    minimum: null,
    maximum: null,
    allowMultiple: false,
    public: true,
    filterable: true,
    textMultiline: false,
    textMaxLength: 4000,
    translations: translations('Finish'),
  });
  await request(page, '/admin/units', {
    code: 'ACTION-MM',
    symbol: 'mm',
    dimension: 'length',
    translations: translations('Millimetre'),
  });
  await page.close();
});
test.afterAll(async () => {
  await fixture?.dispose();
});
async function menu(page: Page, index = 0) {
  const row = page.locator('tbody tr').nth(index);
  await row.getByRole('button', { name: /Actions/ }).click();
  return page.getByRole('menu');
}
test('Groups have one icon overflow, compact desktop filters, modal edit and no orphan controls', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attribute-groups');
  const navigation = page.getByRole('navigation', { name: 'Dashboard', exact: true });
  for (const [title, href] of [
    ['Media', '/admin/media'],
    ['Account', '/admin/account'],
  ]) {
    const group = navigation
      .locator('.bp-nav-group')
      .filter({ has: page.locator('p').filter({ hasText: new RegExp('^' + title + '$') }) });
    await expect(group.locator('a')).toHaveCount(1);
    await expect(group.locator('a')).toHaveAttribute('href', href!);
  }
  await expect(navigation.getByRole('link', { name: 'Product types', exact: true })).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await expect(
    page.locator('tbody').getByRole('button', { name: 'Edit', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('tbody .bp-action-menu-trigger')).toHaveCount(25);
  await expect(page.locator('.bp-configuration-details')).toHaveCount(0);
  expect(
    await page.locator('.bp-filter-toolbar').evaluate((e) => getComputedStyle(e).display),
  ).toBe('grid');
  const controls = page.locator('.bp-filter-toolbar > .bp-field');
  const positions = await controls.evaluateAll((es) =>
    es.map((e) => e.getBoundingClientRect().top),
  );
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(2);
  await page.screenshot({ animations: 'disabled', path: captures + '/groups-desktop.png' });
  const actions = await menu(page);
  await expect(
    actions.getByRole('menuitem', { name: 'Edit', exact: true }).locator('svg'),
  ).toHaveCount(1);
  await expect(
    actions.getByRole('menuitem', { name: 'Delete', exact: true }).locator('svg'),
  ).toHaveCount(1);
  await page.screenshot({ animations: 'disabled', path: captures + '/group-menu.png' });
  await actions.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Close', exact: true })).toHaveClass(
    /bp-close-button/,
  );
  await editor.getByLabel('Name (ar)', { exact: true }).fill('Edited group');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Review change impact' })
    .getByRole('button', { name: 'Apply reviewed change' })
    .click();
  await expect(editor).not.toBeVisible();
  const groups = await request(page, '/admin/attribute-groups?pageSize=100');
  expect(
    groups.items.some((g: { translations: { name: string }[] }) =>
      g.translations.some((t) => t.name === 'Edited group'),
    ),
  ).toBe(true);
});
test('dirty modal Close, Cancel and Escape use branded Stay/Leave and preserve drafts', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attribute-groups');
  await (await menu(page)).getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit', exact: true });
  await editor.getByLabel('Name (ar)', { exact: true }).fill('Uncommitted draft');
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  const unsaved = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
  await expect(unsaved).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: captures + '/unsaved-dialog.png' });
  await unsaved.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(editor.getByLabel('Name (ar)', { exact: true })).toHaveValue('Uncommitted draft');
  await expect(editor.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await unsaved.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await unsaved.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('.bp-action-menu-trigger').first()).toBeFocused();
  // A second edit retains a draft until the explicit navigation decision.
  await (await menu(page)).getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await editor.getByLabel('Name (ar)', { exact: true }).fill('Navigation draft');
  await editor.getByRole('button', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Escape');
  await unsaved.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(editor.getByLabel('Name (ar)', { exact: true })).toHaveValue('Navigation draft');
});
test('dirty sidebar navigation and browser Back wait for the application decision', async ({
  page,
}) => {
  await login(page, true);
  await page.getByLabel('Display name', { exact: true }).fill('Unsaved invitation');
  await page
    .locator('.bp-admin-sidebar')
    .getByRole('link', { name: 'Account', exact: true })
    .click();
  const unsaved = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
  await expect(unsaved).toBeVisible();
  await unsaved.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Unsaved invitation');
  await page
    .locator('.bp-admin-sidebar')
    .getByRole('link', { name: 'Account', exact: true })
    .click();
  await unsaved.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  await expect(page).toHaveURL(/super-admin\/account/);
  await page.getByLabel('Current password', { exact: true }).fill('Unsaved account');
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();

  await page.goBack();

  await expect(unsaved).toBeVisible();
  await unsaved.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(page).toHaveURL(/super-admin\/account/);
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('Unsaved account');
  await page.goBack();
  await unsaved.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  await expect(page).toHaveURL(/super-admin\/admins/);
});
test('Delete opens named red/trash confirmation and preserves pagination after commit', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attribute-groups?page=2');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const code = await page.locator('tbody tr td').nth(1).innerText();
  await (await menu(page)).getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Deletion impact', exact: true });
  await expect(confirmation).toContainText(code);
  await expect(confirmation.getByRole('button', { name: 'Permanently delete' })).toHaveClass(
    /bp-button-destructive/,
  );
  await expect(
    confirmation.getByRole('button', { name: 'Permanently delete' }).locator('svg'),
  ).toHaveCount(1);
  await expect(confirmation.getByRole('button', { name: 'Cancel' })).toHaveClass(
    /bp-button-secondary/,
  );
  await page.screenshot({ animations: 'disabled', path: captures + '/delete-dialog.png' });
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await (await menu(page)).getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Permanently delete' }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page.locator('tbody tr')).toHaveCount(25);
});
test('responsive filters and RTL menus retain keyboard focus and bounded pagination', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attributes');
  for (const locale of ['ar', 'ckb']) {
    await page.locator('header select').selectOption(locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const fields = await page
      .locator('.bp-filter-toolbar > .bp-field')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().top));
    expect(new Set(fields).size).toBe(fields.length);
    await page.screenshot({
      animations: 'disabled',
      path: captures + '/attributes-' + locale + '-mobile.png',
    });
    await page.locator('.bp-action-menu-trigger').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await page.keyboard.press('Escape');
    await expect(page.locator('.bp-action-menu-trigger').first()).toBeFocused();
  }
});
test('Attributes, Units, Products and Media share actions and branded overlays', async ({
  page,
}) => {
  await login(page);
  for (const resource of ['attributes', 'units']) {
    await page.goto('/admin/' + resource);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await (await menu(page)).getByRole('menuitem', { name: 'View details' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.screenshot({
      animations: 'disabled',
      path: captures + '/' + resource + '-desktop.png',
    });
  }
  await page.goto('/admin/products');
  await expect(page.locator('.bp-filter-toolbar')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: captures + '/products-desktop.png' });
  await page.goto('/admin/media');
  await expect(page.locator('.bp-asset-card').first()).toBeVisible();
  await page.locator('.bp-asset-card .bp-action-menu-trigger').first().click();
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Usage', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ animations: 'disabled', path: captures + '/media-desktop.png' });
});
test('Super Admin overflow includes edit, semantic disable/enable and named deletion', async ({
  page,
}) => {
  await login(page, true);
  await expect(page.locator('tbody .bp-action-menu-trigger')).toHaveCount(1);
  await expect(page.locator('tbody').getByRole('link', { name: 'Edit', exact: true })).toHaveCount(
    0,
  );
  let actions = await menu(page);
  await expect(actions.getByRole('menuitem', { name: 'Edit', exact: true })).toBeVisible();
  await actions.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit', exact: true });
  await editor.getByLabel('Display name', { exact: true }).fill('Browser Admin edited');
  const before = (await request(page, '/staff/admins?limit=100')).items[0];
  await request(
    page,
    '/staff/admins/' + before.id,
    { expectedVersion: before.version, displayName: 'Server staff' },
    'PATCH',
  );
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toContainText('This record or schema changed');
  await expect(editor.getByLabel('Display name', { exact: true })).toHaveValue(
    'Browser Admin edited',
  );
  const expectedConflicts = browserErrors.get(page)!;
  expect(expectedConflicts.length).toBeGreaterThan(0);
  expect(expectedConflicts.every((message) => message.includes('status of 409'))).toBe(true);
  expectedConflicts.splice(0);
  await editor.getByRole('button', { name: 'Reload latest', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Unsaved changes', exact: true })
    .getByRole('button', { name: 'Leave without saving', exact: true })
    .click();
  await expect(editor.getByLabel('Display name', { exact: true })).toHaveValue('Server staff');
  await editor.getByLabel('Display name', { exact: true }).fill('Browser Admin edited');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.locator('tbody')).toContainText('Browser Admin edited');
  actions = await menu(page);
  await expect(actions.getByRole('menuitem', { name: 'Disable', exact: true })).toHaveClass(
    /bp-button-warning/,
  );
  await actions.getByRole('menuitem', { name: 'Disable', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('DISABLED');
  actions = await menu(page);
  await expect(actions.getByRole('menuitem', { name: 'Enable', exact: true })).toHaveClass(
    /bp-button-success/,
  );
  await actions.getByRole('menuitem', { name: 'Enable', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('ACTIVE');
  await page.screenshot({ animations: 'disabled', path: captures + '/accounts-desktop.png' });
});
test('CHOICE options remain operational in the inspector and stale modal saves preserve input', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/attributes');
  await (await menu(page)).getByRole('menuitem', { name: 'View details' }).click();
  await page.getByRole('button', { name: 'Add choice option', exact: true }).click();
  const option = page.getByRole('dialog', { name: 'Add choice option', exact: true });
  await option.getByLabel('Code', { exact: true }).fill('BRUSHED');
  await option.getByLabel('Name (ar)', { exact: true }).fill('مصقول');
  await option.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(option).not.toBeVisible();
  const rows = await request(page, '/admin/attributes');
  const id = rows.items[0].id;
  const definition = await request(page, '/admin/attributes/' + id);
  expect(definition.options.some((value: { code: string }) => value.code === 'BRUSHED')).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await (await menu(page)).getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit', exact: true });
  await editor.getByLabel('Name (ar)', { exact: true }).fill('Local dirty finish');
  const path = '/admin/attributes/' + id;
  const change = {
    kind: 'definition.update',
    definition: {
      code: definition.code,
      kind: definition.kind,
      unitCode: null,
      minimum: null,
      maximum: null,
      allowMultiple: definition.allowMultiple,
      public: definition.public,
      filterable: definition.filterable,
      textMultiline: definition.textMultiline,
      textMaxLength: definition.textMaxLength,
      translations: translations('Server finish'),
    },
  };
  const review = await request(page, path + '/changes/preview', {
    change,
    expectedVersion: definition.version,
    expectedSchemaRevision: null,
  });
  await request(page, path + '/changes', {
    change,
    expectedVersion: definition.version,
    expectedSchemaRevision: null,
    precondition: review.precondition,
    confirm: true,
  });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toContainText('This record or schema changed');
  const expectedFailures = browserErrors.get(page)!;
  expect(expectedFailures.length).toBeGreaterThan(0);
  expect(expectedFailures.every((message) => message.includes('status of 409'))).toBe(true);
  expectedFailures.splice(0);
  await expect(editor.getByLabel('Name (ar)', { exact: true })).toHaveValue('Local dirty finish');
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Unsaved changes', exact: true })
    .getByRole('button', { name: 'Leave without saving', exact: true })
    .click();
});
