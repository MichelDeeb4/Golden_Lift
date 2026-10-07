import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { adminBrowserFixture } from '../scripts/admin-browser-fixture.mjs';
let fixture: Awaited<ReturnType<typeof adminBrowserFixture>>;
let productHref: string;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  fixture = await adminBrowserFixture();
});
test.afterAll(async () => {
  await fixture?.dispose();
});
const consoleIssues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const issues: string[] = [];
  consoleIssues.set(page, issues);
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (/unique.*key|unhandled.*rejection/i.test(message.text())) issues.push(message.text());
  });
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', () => {
      document.documentElement.dataset.unhandled = 'true';
    });
  });
});
test.afterEach(async ({ page }) => {
  expect(consoleIssues.get(page) ?? []).toEqual([]);
  if (!page.isClosed())
    expect(await page.locator('html').getAttribute('data-unhandled')).toBeNull();
});
test('dependency outages show errors, preserve login input and never substitute demo data', async ({
  page,
}) => {
  test.setTimeout(120000);
  await english(page);
  for (const service of ['catalog', 'media', 'identity', 'gateway'] as const) {
    if (service === 'media') await login(page, fixture.adminEmail);
    await fixture.serviceAvailable(service, false);
    try {
      await page.goto(
        service === 'media'
          ? '/admin/media'
          : service === 'identity'
            ? '/admin/login'
            : '/products',
      );
      if (service === 'identity') {
        await page.getByLabel('Email', { exact: true }).fill(fixture.adminEmail);
        await page.getByLabel('Password', { exact: true }).fill(fixture.password);
        await page.getByRole('button', { name: 'Staff sign in', exact: true }).click();
        await expect(page.getByLabel('Email', { exact: true })).toHaveValue(fixture.adminEmail);
        await expect(
          page.getByRole('button', { name: 'Staff sign in', exact: true }),
        ).toBeEnabled();
      }
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(page.getByText(/Demonstration content/)).toHaveCount(0);
      await expect(page.locator('.gl-product-card')).toHaveCount(0);
      if (service === 'media') {
        await page.getByRole('button', { name: 'Upload Media', exact: true }).click();
        await expect(
          page.getByRole('dialog').getByRole('button', { name: 'Upload', exact: true }),
        ).toBeDisabled();
      }
    } finally {
      await fixture.serviceAvailable(service, true);
    }
  }
});
async function english(page: Page) {
  await page.addInitScript(() => localStorage.setItem('gl.locale', 'en'));
}
test('attribute creation normalizes changed types and preserves drafts after validation failures', async ({
  page,
}) => {
  await english(page);
  await login(page, fixture.adminEmail);
  await page.goto('/admin/attributes');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const editor = page.locator('.gl-inline-editor');
  await editor.getByLabel('Code', { exact: true }).fill('invalid code');
  await translation(editor, 'ar', 'Attribute regression Arabic');
  await translation(editor, 'en', 'Attribute regression English');
  await editor.getByRole('combobox', { name: 'Type', exact: true }).click();
  await page.getByRole('option', { name: 'Text', exact: true }).click();
  await editor.getByLabel('Maximum text length', { exact: true }).fill('120');
  await editor.getByRole('combobox', { name: 'Type', exact: true }).click();
  await page.getByRole('option', { name: 'Number', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Unit', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Choose', exact: true })).toBeVisible();
  await editor.getByRole('combobox', { name: 'Unit', exact: true }).press('Escape');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Stable codes require');
  await expect(editor.getByLabel('Code', { exact: true })).toHaveValue('invalid code');
  await expect(editor.getByLabel('Name (en)', { exact: true })).toHaveValue(
    'Attribute regression English',
  );
  await editor.getByLabel('Code', { exact: true }).fill('attribute-regression');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Attribute regression English', exact: true }),
  ).toBeVisible();
});
test('interaction states retain keyboard focus, stable geometry and reduced motion', async ({
  page,
}) => {
  await login(page, fixture.superEmail);
  const row = page.getByRole('row').filter({ hasText: fixture.adminEmail });
  const trigger = row.getByRole('button', { name: 'Actions', exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  const before = await trigger.boundingBox();
  await trigger.press('Enter');
  const actions = row.locator('.gl-action-menu-panel button:not(:disabled)');
  await expect(actions.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(actions.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(actions.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(actions.nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(await trigger.boundingBox()).toEqual(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await trigger.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    '0s',
  );
  await trigger.hover();
  await page.mouse.down();
  expect(await trigger.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  await page.mouse.move(0, 0);
  await page.mouse.up();
  const input = page.getByLabel('Email', { exact: true });
  await input.focus();
  await expect(input).toBeFocused();
  expect(await input.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
});
async function login(page: Page, email: string, password = fixture.password) {
  await english(page);
  await page.goto('/admin/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Staff sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
async function editorSection(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: 'Editor sections', exact: true });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: new RegExp('^0?[1-5]?\\s*' + name) }).click();
}
async function translation(scope: Page | Locator, language: 'ar' | 'en' | 'ckb', value: string) {
  if ('url' in scope && /\/admin\/products\/(new|[0-9a-f-]{36})$/.test(scope.url()))
    await editorSection(scope, 'Translations');
  await scope
    .getByRole('tab', {
      name: { ar: 'العربية', en: 'English', ckb: 'کوردی' }[language],
      exact: true,
    })
    .click();
  await scope.getByLabel('Name (' + language + ')', { exact: true }).fill(value);
}
async function reviewSnapshot(page: Page, name: string, target?: Locator) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.gl-admin-skeleton')).toHaveCount(0);
  if (await page.locator('.gl-toast').isVisible()) await page.locator('.gl-toast button').click();
  const surface = target ?? page;
  if (process.env.GL_FUNCTIONAL_CAPTURE) {
    await surface.screenshot({
      path: `documentation/assets/functional-integration/${name}.png`,
      animations: 'disabled',
      mask: [page.locator('.gl-media-caption small'), page.locator('time'), page.locator('video')],
    });
    return;
  }
  if (process.env.GL_REDESIGN_CAPTURE) {
    await surface.screenshot({
      path: `documentation/assets/major-redesign/${process.env.GL_REDESIGN_CAPTURE}/${name}.png`,
      animations: 'disabled',
      mask: [page.locator('.gl-media-caption small'), page.locator('time'), page.locator('video')],
    });
    return;
  }
  await expect(surface).toHaveScreenshot(name + '.png', {
    animations: 'disabled',
    mask: [page.locator('.gl-media-caption small'), page.locator('time'), page.locator('video')],
    maxDiffPixelRatio: 0.002,
  });
}
test('anonymous redirect, real login, role separation and logout', async ({ page }) => {
  await english(page);
  await page.goto('/admin/products');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, fixture.adminEmail);
  await expect(page.locator('.gl-launchpad')).toBeVisible();
  await expect(page.locator('.gl-operational-metric')).toBeVisible();
  await reviewSnapshot(page, 'admin-dashboard');
  await page.goto('/super-admin/admins');
  await expect(page.getByRole('alert')).toContainText('permission');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, fixture.superEmail);
  await expect(page).toHaveURL(/\/super-admin\/admins$/);
  await expect(page.getByRole('row').filter({ hasText: fixture.adminEmail })).toBeVisible();
  await reviewSnapshot(page, 'super-admin-staff');
  await page.goto('/admin/categories');
  await expect(page.getByRole('alert')).toContainText('permission');
});
test('category and type create, independent translations, product editor, publication and stale version', async ({
  page,
}) => {
  await login(page, fixture.adminEmail);
  await page.goto('/admin/media');
  await expect(page.locator('.gl-admin-media img')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.gl-admin-media img').evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await reviewSnapshot(page, 'admin-media-library');
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  let dialog = page.locator('.gl-inline-editor');
  await translation(dialog, 'ar', 'Browser category Arabic');
  await translation(dialog, 'en', 'Browser category English');
  await reviewSnapshot(page, 'admin-category-editor');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Browser category English', exact: true }),
  ).toBeVisible();
  await page.goto('/admin/product-types');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  dialog = page.locator('.gl-inline-editor');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-type');
  await translation(dialog, 'ar', 'Browser type Arabic');
  await translation(dialog, 'en', 'Browser type English');
  await reviewSnapshot(page, 'admin-type-editor');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Browser type English', exact: true })).toBeVisible();
  const typeHref = await page
    .getByRole('link', { name: 'Browser type English', exact: true })
    .getAttribute('href');
  await page.goto('/admin/attributes');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  dialog = page.locator('.gl-inline-editor');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-capacity');
  await translation(dialog, 'ar', 'Browser capacity Arabic');
  await translation(dialog, 'en', 'Browser capacity English');
  await translation(dialog, 'ckb', 'توانای تاقیکردنەوە');
  await dialog.getByLabel('Public', { exact: true }).check();
  await dialog.getByLabel('Filterable', { exact: true }).check();
  await dialog.getByLabel('Minimum', { exact: true }).fill('0');
  await dialog.getByLabel('Maximum', { exact: true }).fill('99999999999999.999999');
  await reviewSnapshot(page, 'admin-attribute-editor');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Browser capacity English', exact: true }),
  ).toBeVisible();
  await page.goto(typeHref!);
  await page.getByLabel('Attributes', { exact: true }).click();
  await page.getByRole('option', { name: 'browser-capacity', exact: true }).click();
  await page.getByLabel('Required', { exact: true }).check();
  await page.getByLabel('Public', { exact: true }).check();
  await page.getByLabel('Filterable', { exact: true }).check();
  await page.getByRole('button', { name: 'Assign attribute', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Apply reviewed change', exact: true })
    .click();
  await expect(
    page
      .locator('main section')
      .filter({ has: page.getByRole('heading', { name: 'Schema', exact: true }) }),
  ).toContainText('browser-capacity · Required');
  await page.goto('/admin/products/new');
  await translation(page, 'ar', 'Browser product Arabic');
  await translation(page, 'en', 'Browser product English');
  await editorSection(page, 'Overview');
  await page.getByRole('button', { name: /^Browse categories:/ }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('row')
    .filter({ hasText: 'Browser category English' })
    .getByRole('button', { name: 'Select', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Type', exact: true }).click();
  await page.getByRole('option', { name: 'Browser type English', exact: true }).click();
  await editorSection(page, 'Specifications');
  await page.getByLabel('Browser capacity English *', { exact: true }).fill('0.000001');
  await editorSection(page, 'Media');
  await page.getByRole('button', { name: 'Cover image', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel('Name (en)', { exact: true })).toHaveValue(
    'Browser product English',
  );
  await editorSection(page, 'Translations');
  await page.getByRole('tab', { name: 'English', exact: true }).click();
  await expect(page.locator('main .gl-form-section-heading h2')).toHaveText([
    'Identity',
    'Translations',
    'Specifications',
    'Media',
    'Publication',
  ]);
  await reviewSnapshot(page, 'admin-product-editor');
  await page.getByLabel('Description (en)', { exact: true }).fill('Preserved workspace draft');
  await editorSection(page, 'Overview');
  await reviewSnapshot(page, 'admin-product-overview');
  await editorSection(page, 'Translations');
  await expect(page.getByLabel('Description (en)', { exact: true })).toHaveValue(
    'Preserved workspace draft',
  );
  await page.getByLabel('Description (en)', { exact: true }).fill('');
  await editorSection(page, 'Media');
  await reviewSnapshot(page, 'admin-product-media');
  await editorSection(page, 'Visibility');
  await page.getByLabel('Active', { exact: true }).check();
  await page.getByRole('button', { name: 'Save — Publication', exact: true }).click();
  await expect(page.locator('.gl-toast')).toContainText('Saved');
  const productId = page.url().split('/').at(-1)!;
  productHref = '/admin/products/' + productId;
  const publicResponse = await page.request.get(
    `http://localhost:3000/api/v1/products/${productId}?locale=en`,
  );
  expect(publicResponse.status()).toBe(200);
  expect((await publicResponse.json()).name).toBe('Browser product English');
  await page.reload();
  await editorSection(page, 'Specifications');
  await expect(page.getByLabel('Browser capacity English *', { exact: true })).toHaveValue(
    '0.000001',
  );
  const persisted = await fixture.persistence(productId);
  expect(persisted.product?.is_active).toBe(true);
  expect(persisted.values[0].number_value.toString()).toBe('0.000001');
  expect(persisted.media.some((m) => m.asset_id === fixture.assetId)).toBe(true);
  const other = await page.context().newPage();
  await other.goto(productHref);
  await editorSection(other, 'Visibility');
  await other.getByLabel('Featured', { exact: true }).check();
  const publication = other.waitForResponse(
    (response) => response.url().endsWith('/publication') && response.request().method() === 'POST',
  );
  await other.getByRole('button', { name: 'Save — Publication', exact: true }).click();
  expect((await publication).status()).toBe(200);
  await other.close();
  await translation(page, 'en', 'Unsaved stale draft');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.getByLabel('Name (en)', { exact: true })).toHaveValue('Unsaved stale draft');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reload latest', exact: true }).click();
  await expect(page.getByLabel('Name (en)', { exact: true })).toHaveValue(
    'Browser product English',
  );
  await expect(page.getByLabel('Featured', { exact: true })).toBeChecked();
  await page.goto('/admin/products');
  await expect(
    page.getByRole('link', { name: 'Browser product English', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.gl-collection-cover img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await reviewSnapshot(page, 'admin-product-list');
  const rowActions = page.getByRole('button', {
    name: 'Actions — Browser product English',
    exact: true,
  });
  await rowActions.click();
  await expect(
    page.getByRole('group', { name: 'Actions — Browser product English', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(rowActions).toBeFocused();
  fixture.checkProcessing();
});
test('real upload parts, completion, processing feedback and controlled private preview', async ({
  page,
}) => {
  await login(page, fixture.adminEmail);
  await page.goto('/admin/media');
  await page.getByRole('button', { name: 'Upload Media', exact: true }).click();
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles({ name: 'Browser upload.png', mimeType: 'image/png', buffer: fixture.image });
  let lostAcknowledgement = false;
  await page.route('**/parts/1', async (route) => {
    if (lostAcknowledgement) {
      await route.continue();
      return;
    }
    lostAcknowledgement = true;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Upload Media', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Browser upload.png', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('READY', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await reviewSnapshot(page, 'admin-upload-drawer', page.getByRole('dialog'));
  await page.keyboard.press('Escape');
  fixture.checkProcessing();
  await expect(page.locator('img').first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  const uploaded = page
    .locator('.gl-admin-media section')
    .filter({ hasText: 'Browser upload.png' });
  const assetHref = await uploaded.getByRole('link').first().getAttribute('href');
  const assetId = assetHref!.split('/').at(-1)!;
  await page.goto(productHref);
  await editorSection(page, 'Media');
  const media = page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name: 'Media', exact: true }) });
  await media.getByRole('button', { name: 'Select', exact: true }).click();
  await page
    .getByRole('dialog')
    .locator('.gl-admin-media section')
    .filter({ hasText: 'Browser upload.png' })
    .getByRole('button', { name: 'Select', exact: true })
    .click();
  const association = media
    .locator('.gl-admin-toolbar')
    .filter({ has: page.locator('bdi').filter({ hasText: assetId }) });
  await association.getByRole('button', { name: 'Actions', exact: true }).click();
  await association.getByRole('button', { name: 'Move earlier', exact: true }).click();
  const tiles = media.locator('[draggable="true"]');
  await expect(tiles).toHaveCount(2);
  await tiles.first().dragTo(tiles.last());
  await expect(tiles.last().locator('bdi')).toHaveText(assetId);
  const savedMedia = page.waitForResponse(
    (response) => response.url().endsWith('/media') && response.request().method() === 'POST',
  );
  await media.getByRole('button', { name: 'Save — Media', exact: true }).click();
  expect((await savedMedia).status()).toBe(200);
  await expect
    .poll(() =>
      association.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await association.getByRole('button', { name: 'Actions', exact: true }).click();
  await association.getByRole('button', { name: 'Detach', exact: true }).click();
  const detached = page.waitForResponse(
    (response) => response.url().endsWith('/media') && response.request().method() === 'POST',
  );
  await media.getByRole('button', { name: 'Save — Media', exact: true }).click();
  expect((await detached).status()).toBe(200);
  await page.goto(assetHref!);
  await expect(page.getByText('Browser upload.png · IMAGE · READY', { exact: true })).toBeVisible();
  await reviewSnapshot(page, 'admin-asset-inspector', page.getByRole('dialog'));
});
test('video playback and PDF preview/download use private Media grants and Catalog associations', async ({
  page,
}) => {
  await login(page, fixture.adminEmail);
  const video = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const context = canvas.getContext('2d')!;
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42001E' });
      const chunks: BlobPart[] = [];
      const complete = new Promise<number[]>((resolve) => {
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
        };
      });
      recorder.start();
      const timer = setInterval(() => {
        context.fillStyle = '#b39455';
        context.fillRect(0, 0, 80, 80);
      }, 50);
      setTimeout(() => {
        clearInterval(timer);
        recorder.stop();
      }, 1000);
      return complete;
    }),
  );
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 80 80] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const files = [
    { name: 'Browser video.mp4', mimeType: 'video/mp4', buffer: video, kind: 'VIDEO' },
    {
      name: 'Browser document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdf),
      kind: 'PDF',
    },
  ];
  const assets: { id: string; name: string }[] = [];
  for (const file of files) {
    await page.goto('/admin/media');
    await page.getByRole('button', { name: 'Upload Media', exact: true }).click();
    await page.getByLabel('Choose file', { exact: true }).setInputFiles(file);
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    const card = page.locator('.gl-admin-media section').filter({ hasText: file.name });
    await expect(page.getByRole('dialog').getByText('READY', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await page.keyboard.press('Escape');
    await expect(card).toContainText(`${file.kind} / READY`, { timeout: 30000 });
    const href = (await card
      .getByRole('link', { name: file.name, exact: true })
      .getAttribute('href'))!;
    assets.push({ id: href.split('/').at(-1)!, name: file.name });
    await page.goto(href);
    if (file.kind === 'VIDEO') {
      await expect(page.locator('video')).toBeVisible();
      await expect
        .poll(() =>
          page.locator('video').evaluate((video) => (video as HTMLVideoElement).videoWidth),
        )
        .toBe(80);
    } else {
      await expect
        .poll(() =>
          page
            .locator('img')
            .first()
            .evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Open — PDF', exact: true }).click();
      const url = await page
        .getByRole('link', { name: 'Documents', exact: true })
        .getAttribute('href');
      expect(new URL(url!).origin).toBe('http://localhost:3003');
      const download = await page.request.get(url!);
      expect(download.status()).toBe(200);
      expect((await download.body()).subarray(0, 8).toString()).toBe('%PDF-1.4');
    }
  }
  await page.goto(productHref);
  await editorSection(page, 'Media');
  const section = page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name: 'Media', exact: true }) });
  for (const asset of assets) {
    await section.getByRole('button', { name: 'Select', exact: true }).click();
    await page
      .getByRole('dialog')
      .locator('.gl-admin-media section')
      .filter({ hasText: asset.name })
      .getByRole('button', { name: 'Select', exact: true })
      .click();
  }
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/media') && response.request().method() === 'POST',
  );
  await section.getByRole('button', { name: 'Save — Media', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await editorSection(page, 'Media');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('video')).toBeVisible();
  for (const asset of assets)
    await expect(section.locator('bdi').filter({ hasText: asset.id })).toBeVisible();
  fixture.checkProcessing();
});

test('published Admin content is real on public pages, filters persist and Media delivery obeys context', async ({
  page,
}) => {
  await english(page);
  const id = productHref.split('/').at(-1)!;
  const detail = await page.request.get(`http://localhost:3000/api/v1/products/${id}?locale=en`);
  expect(detail.status()).toBe(200);
  const product = await detail.json();
  expect(product.media.some((m: { kind: string }) => m.kind === 'VIDEO')).toBe(true);
  expect(product.media.some((m: { kind: string }) => m.kind === 'PDF')).toBe(false);
  const persistedMedia = (await fixture.persistence(id)).media;
  const pdf = persistedMedia.find(
    (m: { asset_id: string }) =>
      !product.media.some((p: { assetId: string }) => p.assetId === m.asset_id),
  );
  expect(pdf).toBeTruthy();
  const deniedSheet = await fixture.technicalSource(id, pdf!.asset_id, false);
  const permittedSheet = await fixture.technicalSource(id, pdf!.asset_id, true);
  const projected = await (
    await page.request.get(`http://localhost:3000/api/v1/products/${id}?locale=en`)
  ).json();
  expect(projected.documents.map((d: { sheetId: string }) => d.sheetId)).toEqual([permittedSheet]);
  const authorize = (ownerId: string) =>
    page.request.get(
      `http://localhost:3000/api/v1/media/assets/${pdf!.asset_id}/variants/original/authorization?ownerType=TECHNICAL_SOURCE&ownerId=${ownerId}&action=DOWNLOAD`,
    );
  expect((await authorize(deniedSheet)).status()).toBe(403);
  const granted = await authorize(permittedSheet);
  expect(granted.status()).toBe(200);
  const download = await page.request.get((await granted.json()).url);
  expect(download.status()).toBe(200);
  expect((await download.body()).subarray(0, 8).toString()).toBe('%PDF-1.4');
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/products/' + id);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Browser product English' }),
    ).toBeVisible();
    await expect(page.getByText('Browser type English', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('.gl-gallery-main img')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole('tab', { name: /Specifications/ }).click();
    await expect(page.locator('.gl-product-dossier .gl-specifications')).toContainText('0.000001');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(page.getByText(/Demonstration content/)).toHaveCount(0);
    if (process.env.GL_FUNCTIONAL_CAPTURE)
      await page.screenshot({
        path: `documentation/assets/functional-integration/public-product-${width}.png`,
        animations: 'disabled',
        mask: [page.locator('video')],
      });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const documentGrant = page.waitForResponse(
    (response) =>
      response.url().includes('/variants/original/authorization') &&
      response.url().includes('TECHNICAL_SOURCE'),
  );
  await page
    .locator('.gl-document-card')
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  expect((await documentGrant).status()).toBe(200);
  const video = page.locator('video').last();
  await video.scrollIntoViewIfNeeded();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).videoWidth))
    .toBe(80);
  await page.goto('/products');
  await expect(page.getByRole('link', { name: /Browser product English/ }).first()).toBeVisible();
  const filters = page.locator('.gl-dynamic-filters');
  await expect(filters).toContainText('Browser capacity English');
  await filters.getByLabel('Minimum', { exact: true }).fill('0.000001');
  await filters.getByLabel('Maximum', { exact: true }).fill('0.000001');
  await filters.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.reload();
  await expect(filters.getByLabel('Minimum', { exact: true })).toHaveValue('0.000001');
  await expect(page.locator('.gl-product-card')).toHaveCount(1);
  await filters.getByLabel('Minimum', { exact: true }).fill('1');
  await filters.getByLabel('Maximum', { exact: true }).fill('2');
  await filters.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByText('No products found', { exact: true })).toBeVisible();
  await page.goto('/products?page=2');
  await expect(page.getByText('No products found', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText('No products found', { exact: true })).toBeVisible();
  await page.goto('/products?filters=' + encodeURIComponent('[null]'));
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('alert').getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('link', { name: /Browser product English/ }).first()).toBeVisible();
  await fixture.recordNativeEvidence();
});

test('recursive category edit, sibling reorder, move and confirmed branch deletion', async ({
  page,
}) => {
  await login(page, fixture.adminEmail);
  async function create(name: string) {
    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const dialog = page.locator('.gl-inline-editor');
    await translation(dialog, 'ar', name + ' Arabic');
    await translation(dialog, 'en', name);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    return (await page.getByRole('link', { name, exact: true }).getAttribute('href'))!;
  }
  const parent = await create('Browser parent');
  const child = await create('Browser child');
  const childRow = page.getByRole('row').filter({ hasText: 'Browser child' });
  const earlier = childRow.getByRole('button', { name: 'Move earlier', exact: true });
  await (
    (await earlier.isEnabled())
      ? earlier
      : childRow.getByRole('button', { name: 'Move later', exact: true })
  ).click();
  await page.getByRole('button', { name: 'Save sibling order', exact: true }).click();
  await expect(page.locator('.gl-toast')).toContainText('Saved');
  await page.goto(child);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .locator('.gl-inline-editor')
    .getByRole('tab', { name: 'English', exact: true })
    .click();
  await page
    .locator('.gl-inline-editor')
    .getByLabel('Name (en)', { exact: true })
    .fill('Browser child edited');
  await page
    .locator('.gl-inline-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Browser child edited', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Browser parent', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto(parent);
  await expect(page.getByRole('link', { name: 'Browser child edited', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Categories: 2');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/categories$/);
  await expect(page.getByRole('link', { name: 'Browser parent', exact: true })).not.toBeVisible();
});

test('choice options preserve definition drafts and reviewed deletion uses current versions', async ({
  page,
}) => {
  await login(page, fixture.adminEmail);
  await page.goto('/admin/attributes');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  let dialog = page.locator('.gl-inline-editor');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-choice');
  await translation(dialog, 'ar', 'Browser choice Arabic');
  await translation(dialog, 'en', 'Browser choice English');
  await dialog.getByRole('combobox', { name: 'Type', exact: true }).click();
  await page.getByRole('option', { name: 'Choice', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('link', { name: 'Browser choice English', exact: true }).click();
  const translations = page.locator('.gl-detail-canvas > .gl-translation-section');
  await translation(translations, 'en', 'Browser choice edited');
  await page.getByRole('button', { name: 'Add choice option', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-option');
  await translation(dialog, 'ar', 'Browser option Arabic');
  await translation(dialog, 'en', 'Browser option English');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Browser option English', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add choice option', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Code', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-option');
  await translation(dialog, 'ar', 'Second option Arabic');
  await translation(dialog, 'en', 'Second option English');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toContainText('This option code already exists');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Add choice option', exact: true }).click();
  await expect(dialog.getByLabel('Code', { exact: true })).toHaveValue('browser-option');
  await expect(dialog.getByLabel('Name (en)', { exact: true })).toHaveValue(
    'Second option English',
  );
  await dialog.getByLabel('Code', { exact: true }).fill('browser-option-two');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Second option English', { exact: true })).toBeVisible();
  await expect(translations.getByLabel('Name (en)', { exact: true })).toHaveValue(
    'Browser choice edited',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Apply reviewed change', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const option = page
    .locator('main section > div')
    .filter({ has: page.locator('summary').filter({ hasText: /^Edit — browser-option$/ }) });
  await option.locator('summary').click();
  await translation(option, 'en', 'Browser option edited');
  await option.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Apply reviewed change', exact: true })
    .click();
  await expect(page.getByText('Browser option edited', { exact: true })).toBeVisible();
  await option.getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Apply reviewed change', exact: true })
    .click();
  await expect(option).not.toBeVisible();
  await page
    .getByRole('region', { name: 'State', exact: true })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Apply reviewed change', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/attributes$/);
  await expect(
    page.getByRole('link', { name: 'Browser choice edited', exact: true }),
  ).not.toBeVisible();
});

test('Arabic and Sorani RTL, mobile navigation and page scrolling', async ({ page }) => {
  await login(page, fixture.adminEmail);
  await page.goto(productHref);
  for (const locale of ['ar', 'ckb']) {
    await page.locator('header select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.gl-admin-sidebar')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await reviewSnapshot(page, 'admin-product-editor-' + locale);
    await page.screenshot({ path: `.local/admin-${locale}-desktop.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(page.locator('.gl-admin-sidebar')).not.toBeVisible();
  await reviewSnapshot(page, 'admin-product-editor-tablet');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.gl-admin-sidebar')).not.toBeVisible();
  await page.locator('.gl-admin-menu').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('header select').selectOption('en');
  const summaryTrigger = page.getByRole('button', { name: 'Product summary', exact: true });
  await summaryTrigger.click();
  const summary = page.getByRole('dialog', { name: 'Product summary', exact: true });
  await expect(summary).toContainText('Browser product English');
  await reviewSnapshot(page, 'admin-product-summary-mobile');
  await page.keyboard.press('Escape');
  await expect(summaryTrigger).toBeFocused();
  await page.locator('header select').selectOption('ckb');
  await reviewSnapshot(page, 'admin-product-editor-mobile');
  await page.screenshot({ path: '.local/admin-ckb-mobile-viewport.png' });
  await page.screenshot({ path: '.local/admin-ckb-mobile.png', fullPage: true });
  await page.locator('header select').selectOption('en');
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await editorSection(page, 'Media');
    await page.getByRole('button', { name: 'Cover image', exact: true }).click();
    const picker = page.getByRole('dialog');
    await expect(picker.locator('.gl-admin-media img').first()).toBeVisible();
    await picker
      .locator('.gl-admin-media section')
      .filter({ hasText: 'Browser upload.png' })
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    const save = page.getByRole('button', { name: 'Save — Media', exact: true });
    await expect(save).toBeVisible();
    const response = page.waitForResponse(
      (response) => response.url().endsWith('/media') && response.request().method() === 'POST',
    );
    await save.click();
    expect((await response).status()).toBe(200);
    await page.reload();
    await editorSection(page, 'Media');
    await expect(save).toBeVisible();
  }
});

test('product edits persist and confirmed deletion removes public access', async ({ page }) => {
  await login(page, fixture.adminEmail);
  await page.goto(productHref);
  await translation(page, 'en', 'Browser product edited');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(productHref.replace('/admin', '/api/v1/admin')) &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel('Name (en)', { exact: true })).toHaveValue('Browser product edited');
  await editorSection(page, 'Visibility');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  const response = await page.request.get(
    `http://localhost:3000/api/v1/products/${productHref.split('/').at(-1)}?locale=en`,
  );
  expect(response.status()).toBe(404);
});

test('units, groups and three translated choice options persist through assignment and product values', async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page, fixture.adminEmail);
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const categoryEditor = page.locator('.gl-inline-editor');
  await translation(categoryEditor, 'ar', 'Workflow category Arabic');
  await translation(categoryEditor, 'en', 'Workflow category English');
  await categoryEditor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Workflow category English', exact: true }),
  ).toBeVisible();
  async function create(
    resource: string,
    code: string,
    name: string,
    configure?: (editor: Locator) => Promise<void>,
  ) {
    await page.goto('/admin/' + resource);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const editor = page.locator('.gl-inline-editor');
    await editor.getByLabel('Code', { exact: true }).fill(code);
    await translation(editor, 'ar', name + ' Arabic');
    await translation(editor, 'en', name + ' English');
    await translation(editor, 'ckb', name + ' Sorani');
    await configure?.(editor);
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    const link = page.getByRole('link', { name: name + ' English', exact: true });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href'))!;
    await page.reload();
    await expect(link).toBeVisible();
    return href;
  }
  await create('units', 'workflow-mm', 'Workflow unit', async (editor) => {
    await editor.getByLabel('Symbol', { exact: true }).fill('mm');
    await editor.getByLabel('Dimension', { exact: true }).fill('length');
  });
  await create('attribute-groups', 'workflow-group', 'Workflow group');
  const type = await create('product-types', 'workflow-type', 'Workflow type');
  await create('attributes', 'workflow-number', 'Workflow number', async (editor) => {
    await editor.getByRole('combobox', { name: 'Unit', exact: true }).click();
    await page.getByRole('option', { name: 'workflow-mm (mm)', exact: true }).click();
    await editor.getByLabel('Minimum', { exact: true }).fill('0');
    await editor.getByLabel('Maximum', { exact: true }).fill('100');
    await editor.getByLabel('Public', { exact: true }).check();
    await editor.getByLabel('Filterable', { exact: true }).check();
  });
  const choice = await create(
    'attributes',
    'workflow-choice',
    'Workflow choice',
    async (editor) => {
      await editor.getByRole('combobox', { name: 'Type', exact: true }).click();
      await page.getByRole('option', { name: 'Choice', exact: true }).click();
      await editor.getByLabel('Public', { exact: true }).check();
      await editor.getByLabel('Filterable', { exact: true }).check();
    },
  );
  await page.goto(choice);
  for (let index = 1; index <= 3; index++) {
    await page.getByRole('button', { name: 'Add choice option', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Code', { exact: true }).fill('workflow-option-' + index);
    for (const language of ['ar', 'en', 'ckb'] as const)
      await translation(dialog, language, `Workflow option ${index} ${language}`);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Workflow option ${index} en`, { exact: true })).toBeVisible();
  }
  const option = page
    .locator('main section > div')
    .filter({ has: page.locator('summary').filter({ hasText: 'workflow-option-3' }) });
  await option.locator('summary').click();
  await option.getByLabel('Sort order', { exact: true }).fill('-1');
  await option.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Apply reviewed change', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await option.locator('summary').click();
  await expect(option.getByLabel('Sort order', { exact: true })).toHaveValue('-1');
  async function confirm() {
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Apply reviewed change', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await page.goto(type);
  await page.getByLabel('Attribute groups', { exact: true }).click();
  await page.getByRole('option', { name: 'workflow-group', exact: true }).click();
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await confirm();
  for (const code of ['workflow-number', 'workflow-choice']) {
    await page.getByLabel('Attributes', { exact: true }).click();
    await page.getByRole('option', { name: code, exact: true }).click();
    await page.getByRole('combobox', { name: 'Group', exact: true }).click();
    await page.getByRole('option', { name: 'workflow-group', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Required', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Public', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Filterable', exact: true }).check();
    await page.getByRole('button', { name: 'Assign attribute', exact: true }).click();
    await confirm();
  }
  await page.goto('/admin/products/new');
  await translation(page, 'ar', 'Workflow product Arabic');
  await translation(page, 'en', 'Workflow product English');
  await editorSection(page, 'Overview');
  await page.getByRole('button', { name: /^Browse categories:/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('row')
    .filter({ hasText: 'Workflow category English' })
    .getByRole('button', { name: 'Select', exact: true })
    .click();
  await page.getByLabel('Type', { exact: true }).click();
  await page.getByRole('option', { name: 'Workflow type English', exact: true }).click();
  await editorSection(page, 'Specifications');
  await expect(page.getByText('Workflow group English', { exact: true })).toBeVisible();
  await page.getByLabel('Workflow number English * (mm)', { exact: true }).fill('0.000001');
  await page.getByLabel('Workflow choice English *', { exact: true }).click();
  await page.getByRole('option', { name: 'Workflow option 3 en', exact: true }).click();
  await editorSection(page, 'Media');
  await page.getByRole('button', { name: 'Cover image', exact: true }).click();
  await page
    .getByRole('dialog')
    .locator('.gl-admin-media section')
    .filter({ hasText: 'Browser fixture image.png' })
    .getByRole('button', { name: 'Select', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/);
  const href = new URL(page.url()).pathname,
    id = href.split('/').at(-1)!;
  await page.reload();
  await editorSection(page, 'Specifications');
  await expect(page.getByLabel('Workflow choice English *', { exact: true })).toContainText(
    'Workflow option 3 en',
  );
  const state = await fixture.persistence(id);
  expect(state.values).toHaveLength(2);
  await editorSection(page, 'Visibility');
  await page.getByLabel('Active', { exact: true }).check();
  await page.getByRole('button', { name: 'Save — Publication', exact: true }).click();
  await expect(page.locator('.gl-toast')).toContainText('Saved');
  const response = await page.request.get(`http://localhost:3000/api/v1/products/${id}?locale=en`);
  expect(response.status()).toBe(200);
  const projected = await response.json();
  expect(projected.attributes.some((a: { unitSymbol: string }) => a.unitSymbol === 'mm')).toBe(
    true,
  );
  expect(
    projected.attributes.some((a: { value: { kind: string; options?: { label: string }[] } }) =>
      a.value.options?.some((o) => o.label === 'Workflow option 3 en'),
    ),
  ).toBe(true);
  await page.goto(choice);
  const retained = page
    .locator('main section > div')
    .filter({ has: page.locator('summary').filter({ hasText: 'workflow-option-3' }) });
  await retained.getByRole('button', { name: 'Deprecated', exact: true }).click();
  await confirm();
  await page.goto(href);
  await editorSection(page, 'Specifications');
  await expect(page.getByLabel('Workflow choice English *', { exact: true })).toContainText(
    'Workflow option 3 en',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.gl-toast')).toContainText('Saved');
  await page.goto('/admin/products/new');
  await editorSection(page, 'Overview');
  await page.getByLabel('Type', { exact: true }).click();
  await page.getByRole('option', { name: 'Workflow type English', exact: true }).click();
  await editorSection(page, 'Specifications');
  await page.getByLabel('Workflow choice English *', { exact: true }).click();
  await expect(page.getByRole('option', { name: /Workflow option 3 en/ })).toHaveCount(0);
});

test('invitation, single-use action tokens, password recovery and own password change', async ({
  page,
}) => {
  const email = 'browser-actions@example.test';
  await login(page, fixture.superEmail);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Display name', { exact: true }).fill('Browser action Admin');
  await page.getByRole('button', { name: 'Invite Admin', exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const invitation = fixture.messages.at(-1).token;
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  async function consume(path: string, token: string, password: string) {
    if (new URL(page.url()).pathname === `/admin/${path}`) await page.goto('/admin/reset-request');
    await page.goto(`/admin/${path}#token=${token}`);
    await expect(page).toHaveURL(new RegExp(`/admin/${path}$`));
    await page.getByLabel('New password', { exact: true }).fill(password);
    await page.getByLabel('Confirm', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Apply reviewed change', exact: true }).click();
  }
  await consume('invitation', invitation, fixture.password);
  await expect(page.locator('.gl-toast')).toContainText('Saved');
  await consume('invitation', invitation, fixture.password);
  await expect(page.getByRole('alert')).toContainText('could not');
  await login(page, email);
  await page.goto('/admin/reset-request');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Apply reviewed change', exact: true }).click();
  await expect
    .poll(
      () =>
        fixture.messages.filter(
          (message) => message.purpose === 'PASSWORD_RESET' && message.email === email,
        ).length,
    )
    .toBe(1);
  const reset = fixture.messages.at(-1).token;
  const resetPassword = fixture.password + ' reset';
  await consume('password-reset', reset, resetPassword);
  await expect(page.locator('.gl-toast')).toContainText('Saved');
  await login(page, email, resetPassword);
  await page.goto('/admin/account');
  await page.getByLabel('Current password', { exact: true }).fill(resetPassword);
  const changedPassword = fixture.password + ' changed';
  await page.getByLabel('New password', { exact: true }).fill(changedPassword);
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, email, changedPassword);
});

test('Super Admin invitation, disable/enable, session revocation and retained deletion', async ({
  page,
  browser,
}) => {
  const adminContext = await browser.newContext({ baseURL: 'http://localhost:8082' });
  const adminPage = await adminContext.newPage();
  await login(adminPage, fixture.adminEmail);
  try {
    await login(page, fixture.superEmail);
    await page.getByLabel('Email', { exact: true }).fill('browser-invite@example.test');
    await page.getByLabel('Display name', { exact: true }).fill('Browser invited Admin');
    await page.getByRole('button', { name: 'Invite Admin', exact: true }).click();
    await expect(page.getByText('browser-invite@example.test', { exact: true })).toBeVisible();
    await page
      .getByRole('row')
      .filter({ hasText: fixture.adminEmail })
      .getByRole('button', { name: 'Actions', exact: true })
      .click();
    await page
      .getByRole('row')
      .filter({ hasText: fixture.adminEmail })
      .getByRole('button', { name: 'Disable', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: fixture.adminEmail })).toContainText(
      'DISABLED',
    );
    await adminPage.goto('/admin/products');
    await expect(adminPage).toHaveURL(/\/admin\/login$/);
    await page
      .getByRole('row')
      .filter({ hasText: fixture.adminEmail })
      .getByRole('button', { name: 'Actions', exact: true })
      .click();
    await page
      .getByRole('row')
      .filter({ hasText: fixture.adminEmail })
      .getByRole('button', { name: 'Enable', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: fixture.adminEmail })).toContainText(
      'ACTIVE',
    );
    await login(adminPage, fixture.adminEmail);
    const invited = page.getByRole('row').filter({ hasText: 'browser-invite@example.test' });
    await invited.getByRole('button', { name: 'Actions', exact: true }).click();
    await invited.getByRole('button', { name: 'Resend invitation', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await invited.getByRole('button', { name: 'Actions', exact: true }).click();
    await invited.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(invited).not.toBeVisible();
  } finally {
    await adminContext.close();
  }
});
