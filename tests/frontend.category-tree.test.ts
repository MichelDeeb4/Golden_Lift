import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
const captureDirectory =
  process.env.BUSINESS_PLATFORM_CATEGORY_TREE_CAPTURE_DIR ?? 'documentation/assets/category-tree';
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
async function login(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bp.locale')) localStorage.setItem('bp.locale', 'en');
  });
  await page.goto('/admin/login');
  await page.getByLabel('Email', { exact: true }).fill(fixture.adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Staff sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.goto('/admin/categories');
}
async function request(page: Page, route: string, data?: unknown, method = data ? 'POST' : 'GET') {
  const session = await page.request.get(fixture.gatewayOrigin + '/api/v1/auth/session');
  const { csrfToken } = await session.json();
  const response = await page.request.fetch(fixture.gatewayOrigin + '/api/v1' + route, {
    method,
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
    translations: [
      { locale: 'ar', name: name + ' عربي', description: null },
      { locale: 'en', name, description: null },
    ],
    coverAssetId: null,
  });
}
const node = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true });
const link = (page: Page, name: string) =>
  page.getByRole('tree').getByRole('link', { name, exact: true });
async function names(dialog: Locator, name: string) {
  await dialog.getByRole('tab').first().click();
  await dialog.getByLabel('Name (ar)', { exact: true }).fill(name + ' عربي');
  await dialog.getByRole('tab', { name: 'English', exact: true }).click();
  await dialog.getByLabel('Name (en)', { exact: true }).fill(name);
}
async function documentMarker(page: Page) {
  return page.evaluate(() => {
    const id = crypto.randomUUID();
    (window as unknown as { treeDocument: string }).treeDocument = id;
    return id;
  });
}
async function intact(page: Page, id: string) {
  expect(
    await page.evaluate(() => (window as unknown as { treeDocument: string }).treeDocument),
  ).toBe(id);
}
let rootId: string, level1Id: string, level2Id: string, leafId: string, destinationId: string;
test('four-level tree separates selection from disclosure, preserves drafts/expansion and searches with ancestry', async ({
  page,
}) => {
  await login(page);
  const root = await category(page, 'Tree Root');
  rootId = root.id;
  const level1 = await category(page, 'Tree Level 1', root.id);
  level1Id = level1.id;
  const level2 = await category(page, 'Tree Level 2', level1.id);
  level2Id = level2.id;
  const leaf = await category(page, 'Tree Level 3', level2.id);
  leafId = leaf.id;
  const destination = await category(page, 'Tree Destination');
  destinationId = destination.id;
  await page.reload();
  const token = await documentMarker(page);
  await expect(link(page, 'Tree Root')).toBeVisible();
  await expect(link(page, 'Tree Level 1')).toHaveCount(0);
  await link(page, 'Tree Root').click();
  await expect(node(page, 'Tree Root')).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Expand Tree Root', exact: true }).click();
  await page.getByRole('button', { name: 'Expand Tree Level 1', exact: true }).click();
  await page.getByRole('button', { name: 'Expand Tree Level 2', exact: true }).click();
  await expect(node(page, 'Tree Level 3')).toHaveAttribute('aria-level', '4');
  await link(page, 'Tree Level 3').click();
  await expect(page.getByRole('heading', { name: 'Tree Level 3', exact: true })).toBeVisible();
  await page
    .locator('.bp-category-detail')
    .getByRole('button', { name: /^Actions/ })
    .click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Edit', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await names(dialog, 'Tree Deep Edited');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(link(page, 'Tree Deep Edited')).toBeVisible();
  for (const name of ['Tree Root', 'Tree Level 1', 'Tree Level 2'])
    await expect(node(page, name)).toHaveAttribute('aria-expanded', 'true');
  await page
    .locator('.bp-category-detail')
    .getByRole('button', { name: /^Actions/ })
    .click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog');
  await names(dialog, 'Local category draft');
  const latest = await request(page, '/admin/categories/' + leaf.id + '?locale=en');
  await request(
    page,
    '/admin/categories/' + leaf.id,
    {
      expectedVersion: latest.version,
      translations: [
        { locale: 'ar', name: 'Server category عربي', description: null },
        { locale: 'en', name: 'Server category', description: null },
      ],
    },
    'PATCH',
  );
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toContainText('This record or schema changed');
  await expect(dialog.getByLabel('Name (en)', { exact: true })).toHaveValue('Local category draft');
  await dialog.getByRole('button', { name: 'Reload latest', exact: true }).click();
  await expect(dialog.getByLabel('Name (en)', { exact: true })).toHaveValue('Server category');
  await names(dialog, 'Tree Deep Edited');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await page.getByLabel('Search categories', { exact: true }).fill('Deep Edited');
  await expect(link(page, 'Tree Deep Edited')).toBeVisible();
  await expect(link(page, 'Tree Root')).toBeVisible();
  await expect(link(page, 'Tree Destination')).toHaveCount(0);
  await page.getByLabel('Search categories', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(link(page, 'Tree Deep Edited')).toBeVisible();
  await node(page, 'Tree Level 2').focus();
  await page.keyboard.press('ArrowRight');
  await expect(node(page, 'Tree Deep Edited')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(node(page, 'Tree Level 2')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(node(page, 'Tree Level 2')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowRight');
  await expect(link(page, 'Tree Deep Edited')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(node(page, 'Tree Deep Edited')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(node(page, 'Tree Deep Edited')).toHaveAttribute('aria-selected', 'true');
  expect(
    await node(page, 'Tree Deep Edited')
      .locator('.bp-category-tree-row')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(44);
  await intact(page, token);
  await page
    .locator('.bp-category-tree-panel')
    .screenshot({ path: captureDirectory + '/tree-desktop.png' });
  await page.screenshot({
    path: captureDirectory + '/workspace-desktop.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tree Deep Edited', exact: true })).toBeVisible();
});
test('subcategories use the selected parent, update immediately and sibling order persists', async ({
  page,
}) => {
  await login(page);
  await link(page, 'Tree Destination').click();
  const token = await documentMarker(page);
  for (const name of ['Sibling A', 'Sibling B', 'Sibling C']) {
    await page.getByRole('button', { name: 'Add Subcategory', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Subcategory', exact: true });
    await expect(dialog).toContainText('Tree Destination');
    await names(dialog, name);
    await dialog.getByRole('button', { name: 'Create Subcategory', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(link(page, name)).toBeVisible();
    await expect(node(page, 'Tree Destination')).toHaveAttribute('aria-expanded', 'true');
    await link(page, 'Tree Destination').click();
  }
  await page
    .getByRole('tree')
    .getByRole('button', { name: 'Actions — Sibling C', exact: true })
    .click();
  await page
    .getByRole('menu', { name: 'Actions — Sibling C', exact: true })
    .getByRole('menuitem', { name: 'Move earlier', exact: true })
    .click();
  await expect
    .poll(() =>
      node(page, 'Tree Destination').getByRole('group').first().getByRole('link').allTextContents(),
    )
    .toEqual(['Sibling A', 'Sibling C', 'Sibling B']);
  await page
    .getByRole('tree')
    .getByRole('button', { name: 'Actions — Sibling A', exact: true })
    .click();
  await expect(
    page
      .getByRole('menu', { name: 'Actions — Sibling A', exact: true })
      .getByRole('menuitem', { name: 'Move earlier', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await intact(page, token);
  await page.reload();
  await page.getByRole('button', { name: 'Expand Tree Destination', exact: true }).click();
  await expect
    .poll(() =>
      node(page, 'Tree Destination').getByRole('group').first().getByRole('link').allTextContents(),
    )
    .toEqual(['Sibling A', 'Sibling C', 'Sibling B']);
});
test('move keeps selection/path, excludes cycles, recovers a branch outage and confirms deletion', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await link(page, 'Tree Deep Edited').click();
  const token = await documentMarker(page);
  await page
    .locator('.bp-category-detail')
    .getByRole('button', { name: 'Actions — Tree Deep Edited', exact: true })
    .click();
  await page
    .locator('.bp-category-detail')
    .getByRole('menuitem', { name: 'Move', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Move Category', exact: true });
  await dialog.getByRole('button', { name: 'Tree Destination', exact: true }).click();
  await expect(dialog).toContainText('Root categories / Tree Destination / Tree Deep Edited');
  await expect(dialog.getByRole('button', { name: 'Tree Deep Edited', exact: true })).toHaveCount(
    0,
  );
  await dialog.getByRole('button', { name: 'Move Category', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(node(page, 'Tree Deep Edited')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.bp-category-detail-path')).toContainText('Tree Destination');
  const detail = await request(page, '/admin/categories/' + leafId + '?locale=en');
  expect(detail.parentId).toBe(destinationId);
  await intact(page, token);
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await page.route('**/api/v1/admin/categories?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('parentId') === rootId)
      await route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE' } } });
    else await route.continue();
  });
  // Fresh cached data correctly needs no request; start the outage check with an uncached branch.
  await page.reload();
  const recoveryToken = await documentMarker(page);
  await page.getByRole('button', { name: 'Expand Tree Root', exact: true }).click();
  await expect(node(page, 'Tree Root').getByRole('alert')).toContainText('Failed to load children');
  await expect(link(page, 'Tree Destination')).toBeVisible();
  await page.unroute('**/api/v1/admin/categories?**');
  await node(page, 'Tree Root').getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(link(page, 'Tree Level 1')).toBeVisible();
  await page.getByRole('button', { name: 'Expand Tree Level 1', exact: true }).click();
  await link(page, 'Tree Level 2').click();
  await page
    .locator('.bp-category-detail')
    .getByRole('button', { name: 'Actions — Tree Level 2', exact: true })
    .click();
  await page
    .locator('.bp-category-detail')
    .getByRole('menuitem', { name: 'Delete', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Deletion impact' })
    .getByRole('button', { name: 'Permanently delete', exact: true })
    .click();
  await expect(link(page, 'Tree Level 2')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(level1Id));
  await intact(page, recoveryToken);
  await page.reload();
  await expect(link(page, 'Tree Level 2')).toHaveCount(0);
});
test('product leaf is blocked in UI and backend; mobile drawer and Arabic/Sorani tree remain usable', async ({
  page,
}) => {
  await login(page);
  const leaf = await category(page, 'Product leaf');
  await request(page, '/admin/products', {
    categoryId: leaf.id,
    modelCode: 'TREE-LEAF',
    translations: [{ locale: 'ar', name: 'منتج', description: null }],
  });
  await page.reload();
  await link(page, 'Product leaf').click();
  await page.getByRole('button', { name: 'Add Subcategory', exact: true }).click();
  const blocked = page.getByRole('dialog', { name: 'Cannot add a subcategory', exact: true });
  await expect(blocked).toContainText('Products: 1');
  await blocked.getByRole('button', { name: 'Close', exact: true }).last().click();
  const latest = await request(page, '/admin/categories/' + leaf.id + '?locale=en');
  const session = await request(page, '/auth/session');
  const rejected = await page.request.post(fixture.gatewayOrigin + '/api/v1/admin/categories', {
    headers: { origin: 'http://localhost:8082', 'x-csrf-token': session.csrfToken },
    data: {
      parentId: leaf.id,
      expectedParentVersion: latest.version,
      translations: [{ locale: 'ar', name: 'invalid child', description: null }],
    },
  });
  expect(rejected.status()).toBe(422);
  expect((await rejected.json()).error.code).toBe('INVALID_STATE');
  expect(
    (await request(page, '/admin/categories/' + leaf.id + '?locale=en')).activeChildCount,
  ).toBe('0');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Browse Categories', exact: true }).click();
  let drawer = page.getByRole('dialog', { name: 'Browse Categories', exact: true });
  await drawer.getByRole('link', { name: 'Tree Destination', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tree Destination', exact: true })).toBeVisible();
  await page.screenshot({
    path: captureDirectory + '/detail-mobile.png',
    fullPage: true,
  });
  for (const locale of ['ar', 'ckb']) {
    await page.locator('header select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('.bp-category-browse').click();
    drawer = page.locator('.bp-category-tree-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('treeitem').first().focus();
    await page.keyboard.press('ArrowDown');
    const destinationNode = drawer.locator(
      `[role="treeitem"][data-category-id="${destinationId}"]`,
    );
    await expect(destinationNode).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(destinationNode).toHaveAttribute('aria-expanded', 'true');
    await expect(
      destinationNode.getByRole('group').first().getByRole('treeitem').first(),
    ).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(
      destinationNode.getByRole('group').first().getByRole('treeitem').first(),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(destinationNode).toBeFocused();
    await drawer.screenshot({
      path: captureDirectory + '/tree-mobile-' + locale + '.png',
    });
    await drawer.locator('.bp-dialog-heading button').click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
