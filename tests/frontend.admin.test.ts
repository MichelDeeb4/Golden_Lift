import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
async function english(page: Page) {
  await page.addInitScript(() => localStorage.setItem('gl.locale', 'en'));
}
async function login(page: Page, email: string, password = fixture.password) {
  await english(page);
  await page.goto('/admin/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Staff sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
test('anonymous redirect, real login, role separation and logout', async ({ page }) => {
  await english(page);
  await page.goto('/admin/products');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, fixture.adminEmail);
  await page.goto('/super-admin/admins');
  await expect(page.getByRole('alert')).toContainText('permission');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, fixture.superEmail);
  await expect(page).toHaveURL(/\/super-admin\/admins$/);
  await page.goto('/admin/categories');
  await expect(page.getByRole('alert')).toContainText('permission');
});
test('category and type create, independent translations, product editor, publication and stale version', async ({
  page,
}) => {
  await login(page, fixture.adminEmail);
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name (ar)', { exact: true }).fill('Browser category Arabic');
  await dialog.getByLabel('Name (en)', { exact: true }).fill('Browser category English');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Browser category English', exact: true }),
  ).toBeVisible();
  await page.goto('/admin/product-types');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-type');
  await dialog.getByLabel('Name (ar)', { exact: true }).fill('Browser type Arabic');
  await dialog.getByLabel('Name (en)', { exact: true }).fill('Browser type English');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Browser type English', exact: true })).toBeVisible();
  const typeHref = await page
    .getByRole('link', { name: 'Browser type English', exact: true })
    .getAttribute('href');
  await page.goto('/admin/attributes');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-capacity');
  await dialog.getByLabel('Name (ar)', { exact: true }).fill('Browser capacity Arabic');
  await dialog.getByLabel('Name (en)', { exact: true }).fill('Browser capacity English');
  await dialog.getByLabel('Minimum', { exact: true }).fill('0');
  await dialog.getByLabel('Maximum', { exact: true }).fill('99999999999999.999999');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Browser capacity English', exact: true }),
  ).toBeVisible();
  await page.goto(typeHref!);
  await page.getByLabel('Attributes', { exact: true }).click();
  await page.getByRole('option', { name: 'browser-capacity', exact: true }).click();
  await page.getByLabel('Required', { exact: true }).check();
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
  await page.getByLabel('Name (ar)', { exact: true }).fill('Browser product Arabic');
  await page.getByLabel('Name (en)', { exact: true }).fill('Browser product English');
  await page.getByRole('button', { name: 'Browse categories', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('row')
    .filter({ hasText: 'Browser category English' })
    .getByRole('button', { name: 'Select', exact: true })
    .click();
  await page.getByLabel('Type', { exact: true }).click();
  await page.getByRole('option', { name: 'Browser type English', exact: true }).click();
  await page.getByLabel('Browser capacity English *', { exact: true }).fill('0.000001');
  await page.getByRole('button', { name: 'Cover image', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel('Name (en)', { exact: true })).toHaveValue(
    'Browser product English',
  );
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
  const other = await page.context().newPage();
  await other.goto(productHref);
  await other.getByLabel('Featured', { exact: true }).check();
  const publication = other.waitForResponse(
    (response) => response.url().endsWith('/publication') && response.request().method() === 'POST',
  );
  await other.getByRole('button', { name: 'Save — Publication', exact: true }).click();
  expect((await publication).status()).toBe(200);
  await other.close();
  await page.getByLabel('Name (en)', { exact: true }).fill('Unsaved stale draft');
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
  fixture.checkProcessing();
});
test('real upload parts, completion, processing feedback and controlled private preview', async ({
  page,
}) => {
  await login(page, fixture.adminEmail);
  await page.goto('/admin/media');
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
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByText('Browser upload.png · IMAGE · READY', { exact: true })).toBeVisible({
    timeout: 30000,
  });
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
  const assetHref = await uploaded
    .getByRole('link', { name: 'Open', exact: true })
    .getAttribute('href');
  const assetId = assetHref!.split('/').at(-1)!;
  await page.goto(productHref);
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
  await association.getByRole('button', { name: 'Move earlier', exact: true }).click();
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
  await association.getByRole('button', { name: 'Detach', exact: true }).click();
  const detached = page.waitForResponse(
    (response) => response.url().endsWith('/media') && response.request().method() === 'POST',
  );
  await media.getByRole('button', { name: 'Save — Media', exact: true }).click();
  expect((await detached).status()).toBe(200);
  await page.goto(assetHref!);
  await expect(page.getByText('Browser upload.png · IMAGE · READY', { exact: true })).toBeVisible();
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
    await page.getByLabel('Choose file', { exact: true }).setInputFiles(file);
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    const card = page.locator('.gl-admin-media section').filter({ hasText: file.name });
    await expect(card).toContainText(`${file.kind} · READY`, { timeout: 30000 });
    const href = (await card
      .getByRole('link', { name: 'Open', exact: true })
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
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('video')).toBeVisible();
  for (const asset of assets)
    await expect(section.locator('bdi').filter({ hasText: asset.id })).toBeVisible();
  fixture.checkProcessing();
});

test('recursive category edit, sibling reorder, move and confirmed branch deletion', async ({
  page,
}) => {
  await login(page, fixture.adminEmail);
  async function create(name: string) {
    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name (ar)', { exact: true }).fill(name + ' Arabic');
    await dialog.getByLabel('Name (en)', { exact: true }).fill(name);
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
    .getByRole('dialog')
    .getByLabel('Name (en)', { exact: true })
    .fill('Browser child edited');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
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
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-choice');
  await dialog.getByLabel('Name (ar)', { exact: true }).fill('Browser choice Arabic');
  await dialog.getByLabel('Name (en)', { exact: true }).fill('Browser choice English');
  await dialog.getByLabel('Type', { exact: true }).click();
  await page.getByRole('option', { name: 'Choice', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('link', { name: 'Browser choice English', exact: true }).click();
  const translations = page.locator('main > section').first();
  await translations.getByLabel('Name (en)', { exact: true }).fill('Browser choice edited');
  await page.getByRole('button', { name: 'Add choice option', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code', { exact: true }).fill('browser-option');
  await dialog.getByLabel('Name (ar)', { exact: true }).fill('Browser option Arabic');
  await dialog.getByLabel('Name (en)', { exact: true }).fill('Browser option English');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Browser option English', { exact: true })).toBeVisible();
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
    .filter({ has: page.locator('summary').filter({ hasText: 'browser-option' }) });
  await option.locator('summary').click();
  await option.getByLabel('Name (en)', { exact: true }).fill('Browser option edited');
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
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
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
    await page.screenshot({ path: `.local/admin-${locale}-desktop.png`, fullPage: true });
  }
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
  await page.screenshot({ path: '.local/admin-ckb-mobile-viewport.png' });
  await page.screenshot({ path: '.local/admin-ckb-mobile.png', fullPage: true });
});

test('product edits persist and confirmed deletion removes public access', async ({ page }) => {
  await login(page, fixture.adminEmail);
  await page.goto(productHref);
  await page.getByLabel('Name (en)', { exact: true }).fill('Browser product edited');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(productHref.replace('/admin', '/api/v1/admin')) &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel('Name (en)', { exact: true })).toHaveValue('Browser product edited');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  const response = await page.request.get(
    `http://localhost:3000/api/v1/products/${productHref.split('/').at(-1)}?locale=en`,
  );
  expect(response.status()).toBe(404);
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
      .getByRole('button', { name: 'Enable', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: fixture.adminEmail })).toContainText(
      'ACTIVE',
    );
    await login(adminPage, fixture.adminEmail);
    const invited = page.getByRole('row').filter({ hasText: 'browser-invite@example.test' });
    await invited.getByRole('button', { name: 'Resend invitation', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await invited.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(invited).not.toBeVisible();
  } finally {
    await adminContext.close();
  }
});
