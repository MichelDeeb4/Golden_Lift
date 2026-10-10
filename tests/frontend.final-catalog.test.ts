import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  fixture = await adminBrowserFixture();
});
test.afterAll(async () => {
  await fixture?.dispose();
});
const translations = (name: string) =>
  ['ar', 'en', 'ckb'].map((locale) => ({ locale, name, description: null }));
async function login(page: Page, superAdmin = false) {
  await page.addInitScript(() => localStorage.setItem('gl.locale', 'en'));
  await page.goto('/admin/login');
  await page
    .locator('input[type=email]')
    .fill(superAdmin ? fixture.superEmail : fixture.adminEmail);
  await page.locator('input[type=password]').fill(fixture.password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(superAdmin ? /super-admin/ : /\/admin\/?$/);
}
async function raw(page: Page, path: string, data?: unknown, method = data ? 'POST' : 'GET') {
  const { csrfToken } = await (
    await page.request.get('http://localhost:3000/api/v1/auth/session')
  ).json();
  return page.request.fetch('http://localhost:3000/api/v1' + path, {
    method,
    headers: { origin: 'http://localhost:8082', 'x-csrf-token': csrfToken },
    ...(data ? { data } : {}),
  });
}
async function request(page: Page, path: string, data?: unknown, method = data ? 'POST' : 'GET') {
  const r = await raw(page, path, data, method);
  expect(r.status(), await r.text()).toBeLessThan(300);
  return r.json();
}
async function created(page: Page, path: string, click: () => Promise<void>) {
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1' + path),
  );
  await click();
  const r = await response;
  expect(r.status(), await r.text()).toBeLessThan(300);
  return r.json();
}

test('atomic leaf groups → unique category fields → real product values; creation memberships persist after reload', async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await login(page);
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  const g1 = await request(page, '/admin/attribute-groups', {
    code: 'FINAL-GENERAL',
    translations: translations('Final General'),
  });
  const g2 = await request(page, '/admin/attribute-groups', {
    code: 'FINAL-CABIN',
    translations: translations('Final Cabin'),
  });
  await page.goto('/admin/attributes');
  await page.getByRole('button', { name: 'Create Attribute', exact: true }).first().click();
  let modal = page.getByRole('dialog', { name: 'Create Attribute', exact: true });
  await modal.getByLabel('Code', { exact: true }).fill('FINAL-MATERIAL');
  await modal.getByLabel('Name (ar)', { exact: true }).fill('Final Material');
  await modal.getByRole('combobox', { name: 'Type', exact: true }).click();
  await page.getByRole('option', { name: 'Choice', exact: true }).click();
  await modal.getByRole('checkbox', { name: 'Final General', exact: true }).check();
  await modal.getByRole('checkbox', { name: 'Final Cabin', exact: true }).check();
  await expect(modal.getByRole('button', { name: /^Previous —/ })).toHaveCount(0);
  const material = await created(page, '/admin/attributes', () =>
    modal.getByRole('button', { name: 'Save', exact: true }).click(),
  );
  await expect(modal).not.toBeVisible();
  const materialRow = page.getByRole('row').filter({ hasText: 'FINAL-MATERIAL' });
  await expect(materialRow).toContainText('Final General');
  await expect(materialRow).toContainText('Final Cabin');
  await page.reload();
  expect(
    (await request(page, `/admin/attributes/${material.id}/memberships`)).orderedIds.sort(),
  ).toEqual([g1.id, g2.id].sort());
  await request(page, `/admin/attributes/${material.id}/options`, {
    code: 'steel',
    sortOrder: '1024',
    translations: translations('Stainless steel'),
  });
  const width = await request(page, '/admin/attributes', {
    code: 'FINAL-WIDTH',
    kind: 'NUMBER',
    unitCode: null,
    minimum: null,
    maximum: null,
    allowMultiple: false,
    public: true,
    filterable: true,
    textMultiline: false,
    textMaxLength: 4000,
    translations: translations('Final Width'),
  });
  await page.goto('/admin/attribute-groups');
  await page.getByRole('button', { name: 'Create Group', exact: true }).first().click();
  modal = page.getByRole('dialog', { name: 'Create Group', exact: true });
  await modal.getByLabel('Code', { exact: true }).fill('FINAL-DIMENSIONS');
  await modal.getByLabel('Name (ar)', { exact: true }).fill('Final Dimensions');
  await modal.getByRole('checkbox', { name: 'Final Material', exact: true }).check();
  await modal.getByRole('checkbox', { name: 'Final Width', exact: true }).check();
  const dimensions = await created(page, '/admin/attribute-groups', () =>
    modal.getByRole('button', { name: 'Save', exact: true }).click(),
  );
  await expect(modal).not.toBeVisible();
  const dimensionsRow = page.getByRole('row').filter({ hasText: 'FINAL-DIMENSIONS' });
  await expect(dimensionsRow.getByRole('cell').nth(2)).toHaveText('2');
  await page.reload();
  expect(
    (await request(page, `/admin/attribute-groups/${dimensions.id}/memberships`)).orderedIds,
  ).toEqual([material.id, width.id]);
  const parent = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Final Parent'),
  });
  await page.goto(`/admin/categories/${parent.id}`);
  await page.getByRole('button', { name: 'Add Subcategory', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Create Subcategory', exact: true });
  await modal.getByLabel('Name (ar)', { exact: true }).fill('Final Leaf');
  for (const name of ['Final General', 'Final Cabin', 'Final Dimensions'])
    await modal.getByRole('checkbox', { name, exact: true }).check();
  // Reorder during creation, before the category exists.
  await modal.getByRole('button', { name: 'Previous — Final Dimensions', exact: true }).click();
  await page.screenshot({
    path: 'documentation/assets/final-catalog-admin-visitor/leaf-create-groups.png',
  });
  const marker = await page.evaluate(() => {
    (window as unknown as { finalMarker: string }).finalMarker = crypto.randomUUID();
    return (window as unknown as { finalMarker: string }).finalMarker;
  });
  const leaf = await created(page, '/admin/categories', () =>
    modal.locator('button[type=submit]').click(),
  );
  await expect(modal).not.toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { finalMarker: string }).finalMarker),
  ).toBe(marker);
  await expect(
    page.getByRole('tree').getByRole('link', { name: 'Final Leaf', exact: true }),
  ).toBeVisible();
  await page.reload();
  expect((await request(page, `/admin/categories/${leaf.id}/memberships`)).orderedIds).toEqual([
    g1.id,
    dimensions.id,
    g2.id,
  ]);
  const schema = await request(page, `/admin/categories/${leaf.id}/schema?locale=en`);
  expect(
    schema.form.fields.filter((f: { definitionId: string }) => f.definitionId === material.id),
  ).toHaveLength(1);
  expect(schema.form.fields).toHaveLength(2);
  expect(
    schema.form.fields.find((field: { definitionId: string }) => field.definitionId === material.id)
      .groupPlacementIds,
  ).toHaveLength(3);
  await page.goto('/admin/products/new');
  modal = page.getByRole('dialog', { name: 'Create Product', exact: true });
  await modal.getByRole('button', { name: /Browse categories/ }).click();
  const picker = page.getByRole('dialog').filter({ has: page.getByRole('tree') });
  await picker.getByRole('link', { name: 'Final Parent', exact: true }).click();
  await picker.getByRole('link', { name: 'Final Leaf', exact: true }).click();
  await modal.getByLabel('Name (ar)', { exact: true }).fill('Final Product');
  const product = await created(page, '/admin/products', () =>
    modal.locator('button[type=submit]').click(),
  );
  await expect(page).toHaveURL(new RegExp('/admin/products/' + product.id));
  await page.getByRole('button', { name: /Specifications/ }).click();
  await expect(page.locator('main')).not.toContainText(/product type/i);
  await expect(page.getByLabel('Final Material', { exact: true })).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Final Material', exact: true }).click();
  await page.getByRole('option', { name: 'Stainless steel', exact: true }).click();
  await page.getByLabel('Final Width', { exact: true }).fill('1400.000001');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Specifications/ }).click();
  await expect(page.getByLabel('Final Width', { exact: true })).toHaveValue('1400.000001');
  await expect(page.getByRole('combobox', { name: 'Final Material', exact: true })).toContainText(
    'Stainless steel',
  );
  const saved = await request(page, `/admin/products/${product.id}/management`);
  expect(saved.values).toHaveLength(2);
  expect(
    saved.values.filter((v: { definitionId: string }) => v.definitionId === material.id),
  ).toHaveLength(1);
  expect(
    saved.values.find((v: { definitionId: string }) => v.definitionId === width.id).value.number,
  ).toBe('1400.000001');
  await page.screenshot({
    path: 'documentation/assets/final-catalog-admin-visitor/product-values.png',
  });
  expect(dialogs).toEqual([]);
});

test('invalid memberships roll back category creation and both authorization and leaf invariant are enforced', async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  await login(page);
  const before = await request(page, '/admin/categories?locale=en&limit=100');
  const r = await raw(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Must Roll Back'),
    groupIds: ['00000000-0000-4000-8000-000000000099'],
  });
  expect(r.status(), await r.text()).toBe(422);
  const after = await request(page, '/admin/categories?locale=en&limit=100');
  expect(after.items.map((c: { id: string }) => c.id)).toEqual(
    before.items.map((c: { id: string }) => c.id),
  );
  const group = await request(page, '/admin/attribute-groups', {
    code: 'FINAL-BLOCK',
    translations: translations('Block children'),
  });
  const leaf = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Group leaf'),
    groupIds: [group.id],
  });
  const current = await request(page, `/admin/categories/${leaf.id}?locale=en`);
  expect(current.canAddChildren).toBe(false);
  const child = await raw(page, '/admin/categories', {
    parentId: leaf.id,
    expectedParentVersion: current.version,
    translations: translations('Blocked child'),
  });
  expect(child.status()).toBe(422);
  await page.goto('/admin/categories/' + leaf.id);
  await page.getByRole('button', { name: 'Add Subcategory', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(/products|groups/i);
  await page.context().clearCookies();
  await login(page, true);
  expect((await raw(page, `/admin/categories/${leaf.id}/memberships`)).status()).toBe(403);
});

test('reviewed relationship edits in both directions and product category changes retain values without reloading', async ({
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  await login(page);
  const a = await request(page, '/admin/attributes', {
    code: 'EDIT-ATTRIBUTE',
    kind: 'NUMBER',
    unitCode: null,
    minimum: null,
    maximum: null,
    allowMultiple: false,
    public: true,
    filterable: true,
    textMultiline: false,
    textMaxLength: 4000,
    translations: translations('Edit attribute'),
  });
  const b = await request(page, '/admin/attributes', {
    code: 'EDIT-OTHER',
    kind: 'BOOLEAN',
    unitCode: null,
    minimum: null,
    maximum: null,
    allowMultiple: false,
    public: true,
    filterable: true,
    textMultiline: false,
    textMaxLength: 4000,
    translations: translations('Edit other'),
  });
  const g = await request(page, '/admin/attribute-groups', {
    code: 'EDIT-GROUP',
    translations: translations('Edit group'),
    attributeIds: [a.id],
  });
  const extra = await request(page, '/admin/attribute-groups', {
    code: 'EDIT-EXTRA',
    translations: translations('Edit extra'),
  });
  const c = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Edit source'),
    groupIds: [g.id],
  });
  const target = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Edit target'),
    groupIds: [extra.id],
  });
  async function commitDialog(name: string, selected: string, checked: boolean) {
    const dialog = page.getByRole('dialog', { name, exact: true });
    await dialog.getByRole('checkbox', { name: selected, exact: true }).setChecked(checked);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    const impact = page.getByRole('dialog', { name: 'Review change impact', exact: true });
    await expect(impact).toContainText('retains');
    await impact.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.goto('/admin/attribute-groups');
  const marker = await page.evaluate(() => {
    (window as unknown as { editMarker: string }).editMarker = crypto.randomUUID();
    return (window as unknown as { editMarker: string }).editMarker;
  });
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'Edit group', exact: true }) })
    .getByRole('button', { name: 'Actions — EDIT-GROUP', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Attributes', exact: true })
    .click();
  await commitDialog('Attributes', 'Edit other', true);
  expect(await page.evaluate(() => (window as unknown as { editMarker: string }).editMarker)).toBe(
    marker,
  );
  await page.reload();
  expect(
    (await request(page, '/admin/attribute-groups/' + g.id + '/memberships')).orderedIds,
  ).toEqual([a.id, b.id]);
  await page.goto('/admin/attributes');
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'Edit attribute', exact: true }) })
    .getByRole('button', { name: 'Actions — EDIT-ATTRIBUTE', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Attribute groups', exact: true })
    .click();
  await commitDialog('Attribute groups', 'Edit extra', true);
  expect(
    (await request(page, '/admin/attribute-groups/' + extra.id + '/memberships')).orderedIds,
  ).toEqual([a.id]);
  // Remove membership through the inverse editor, then retain a saved draft value through placement.
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Attribute groups', exact: true })
    .click();
  await commitDialog('Attribute groups', 'Edit extra', false);
  await page.reload();
  expect(
    (await request(page, '/admin/attribute-groups/' + extra.id + '/memberships')).orderedIds,
  ).toEqual([]);
  const product = await request(page, '/admin/products', {
    categoryId: c.id,
    translations: translations('Edit product'),
  });
  const schema = await request(page, '/admin/products/' + product.id + '/edit-schema?locale=en');
  await request(
    page,
    '/admin/products/' + product.id,
    {
      expectedVersion: product.version,
      expectedSchemaRevision: schema.form.schemaRevision,
      values: [{ definitionId: a.id, value: { kind: 'NUMBER', number: '5.000001' } }],
    },
    'PATCH',
  );
  await page.goto('/admin/products/' + product.id);
  await page.getByRole('button', { name: /Browse categories/ }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('link', { name: 'Edit target', exact: true })
    .click();
  const impact = page.getByRole('dialog', { name: 'Review change impact', exact: true });
  await expect(impact).toContainText('retains');
  await impact.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(impact).not.toBeVisible();
  await page.reload();
  const saved = await request(page, '/admin/products/' + product.id + '/management');
  expect(saved.categoryId).toBe(target.id);
  expect(saved.values).toEqual([
    { definitionId: a.id, value: { kind: 'NUMBER', number: '5.000001' } },
  ]);
  await page.getByRole('button', { name: /Specifications/ }).click();
  await expect(
    page.getByRole('region', { name: 'Retained values outside this category', exact: true }),
  ).toContainText('Edit attribute');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  expect(
    (await request(page, '/admin/products/' + product.id + '/management')).values,
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Delete — Edit attribute', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  expect((await request(page, '/admin/products/' + product.id + '/management')).values).toEqual([]);
});

test('real visitor gallery distinguishes two images and video with category breadcrumbs and eligible neighbors in all locales', async ({
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  await login(page);
  await fixture.seedImages(1);
  const imageRows = await request(page, '/admin/media/assets?kind=IMAGE&status=READY&limit=100');
  const second = imageRows.items.find((asset: { id: string }) => asset.id !== fixture.assetId);
  expect(second).toBeTruthy();
  const video = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const context = canvas.getContext('2d')!;
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42001E' });
      const chunks: BlobPart[] = [];
      const result = new Promise<number[]>((resolve) => {
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
        };
      });
      recorder.start();
      const timer = setInterval(() => {
        context.fillStyle = '#c9a15b';
        context.fillRect(0, 0, 80, 80);
      }, 50);
      setTimeout(() => {
        clearInterval(timer);
        recorder.stop();
      }, 1000);
      return result;
    }),
  );
  await page.goto('/admin/media');
  await page.getByRole('button', { name: 'Upload Media', exact: true }).click();
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles({ name: 'Final gallery video.mp4', mimeType: 'video/mp4', buffer: video });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByRole('dialog').last().getByText('READY', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.keyboard.press('Escape');
  const assets = await request(page, '/admin/media/assets?kind=VIDEO&status=READY&limit=100');
  const movie = assets.items.find(
    (asset: { name: string }) => asset.name === 'Final gallery video.mp4',
  );
  expect(movie).toBeTruthy();
  const root = await request(page, '/admin/categories', {
    parentId: null,
    expectedParentVersion: null,
    translations: translations('Gallery root'),
  });
  const parent = await request(page, '/admin/categories/' + root.id + '?locale=en');
  const category = await request(page, '/admin/categories', {
    parentId: root.id,
    expectedParentVersion: parent.version,
    translations: translations('Gallery leaf'),
  });
  const products = [];
  for (let i = 0; i < 3; i++) {
    const p = await request(page, '/admin/products', {
      categoryId: category.id,
      translations: translations('Gallery product ' + i),
    });
    const media = (
      i === 1
        ? [
            { assetId: fixture.assetId, kind: 'IMAGE', title: 'Front image' },
            { assetId: second.id, kind: 'IMAGE', title: 'Side image' },
            { assetId: movie.id, kind: 'VIDEO', title: 'Movement video' },
          ]
        : [{ assetId: fixture.assetId, kind: 'IMAGE', title: 'Front image' }]
    ).map((m) => ({
      id: crypto.randomUUID(),
      assetId: m.assetId,
      kind: m.kind,
      translations: ['ar', 'en', 'ckb'].map((locale) => ({
        locale,
        title: m.title,
        caption: null,
        altText: m.title,
      })),
    }));
    const saved = await request(page, '/admin/products/' + p.id + '/media', {
      expectedVersion: p.version,
      coverAssetId: fixture.assetId,
      media,
    });
    products.push(
      await request(page, '/admin/products/' + p.id + '/publication', {
        expectedVersion: saved.version,
        active: true,
        featured: false,
        sortOrder: String(i * 1024),
        featuredOrder: '0',
      }),
    );
  }
  const detail = await (
    await page.request.get('http://localhost:3000/api/v1/products/' + products[1].id + '?locale=en')
  ).json();
  expect(detail.navigation.breadcrumbs.map((c: { id: string }) => c.id)).toEqual([
    root.id,
    category.id,
  ]);
  expect(detail.navigation.previous.id).toBe(products[0].id);
  expect(detail.navigation.next.id).toBe(products[2].id);
  for (const [locale, width] of [
    ['en', 1440],
    ['ar', 390],
    ['ckb', 900],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/products/' + products[1].id);
    await page.locator('header .gl-language select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
    await expect(page.locator('.gl-gallery-thumbnails button')).toHaveCount(3);
    await expect(page.locator('.gl-video-thumbnail-badge')).toHaveText(
      { en: 'VIDEO', ar: 'فيديو', ckb: 'ڤیدیۆ' }[locale],
    );
    await page.locator('.gl-gallery-thumbnails button').last().click();
    await expect
      .poll(() => page.locator('.gl-gallery video').evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBe(80);
    await page.locator('.gl-gallery video').evaluate((v: HTMLVideoElement) => v.play());
    await expect
      .poll(() =>
        page.locator('.gl-gallery video').evaluate((v: HTMLVideoElement) => v.currentTime),
      )
      .toBeGreaterThan(0);
    await page.locator('.gl-gallery-thumbnails button').first().click();
    await expect
      .poll(() =>
        page.locator('.gl-gallery-main img').evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    for (const id of [root.id, category.id])
      await expect(page.locator('a[href="/categories/' + id + '"]').first()).toBeVisible();
    await expect(
      page.locator('.gl-product-neighbors a[href="/products/' + products[0].id + '"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('.gl-product-neighbors a[href="/products/' + products[2].id + '"]').first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'documentation/assets/final-catalog-admin-visitor/gallery-' + locale + '.png',
      animations: 'disabled',
    });
  }
  await page.locator('.gl-product-neighbors a[href="/products/' + products[2].id + '"]').click();
  await expect(page).toHaveURL(new RegExp(products[2].id));
  const last = await (
    await page.request.get('http://localhost:3000/api/v1/products/' + products[2].id + '?locale=en')
  ).json();
  expect(last.navigation.next).toBeNull();
});
