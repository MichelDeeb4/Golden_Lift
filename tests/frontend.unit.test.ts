import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openSync } from 'fontkit';
import { colors, palette, contrastRatio, space } from '@golden-lift/tokens';
import {
  ApiError,
  PublicApiClient,
  ApiCatalogDataSource,
  ApiMediaResolver,
  catalogKeys,
  StaffApiClient,
  StaffApiError,
  fieldSchema,
} from '@golden-lift/api';
import { DemoCatalogDataSource, DemoMediaResolver } from '../apps/storefront/features/catalog/demo';
import { validateDynamicValue } from '../apps/storefront/features/admin/dynamic-values';
test('dynamic editing preserves exact decimal bounds, false, translated text and choice cardinality', () => {
  const field = fieldSchema.parse({
    definitionId: randomUUID(),
    assignmentId: randomUUID(),
    code: 'precision',
    label: 'Quantity',
    description: null,
    kind: 'NUMBER',
    control: 'number',
    required: true,
    groupPlacementId: null,
    sortOrder: '1024',
    unit: null,
    minimum: '0',
    maximum: '99999999999999.999999',
    allowMultiple: false,
    textMaxLength: 4,
    textMultiline: false,
    deprecated: false,
    options: [],
  });
  assert.equal(
    validateDynamicValue(field, { kind: 'NUMBER', number: '99999999999999.999999' }),
    true,
  );
  for (const number of ['100000000000000', '1.0000001', '1e3', 'NaN', '-0.000001'])
    assert.equal(validateDynamicValue(field, { kind: 'NUMBER', number }), false);
  assert.equal(
    validateDynamicValue({ ...field, kind: 'BOOLEAN' }, { kind: 'BOOLEAN', boolean: false }),
    true,
  );
  assert.equal(
    validateDynamicValue(
      { ...field, kind: 'TEXT' },
      { kind: 'TEXT', translations: [{ locale: 'en', text: 'abcd' }] },
    ),
    false,
  );
  assert.equal(
    validateDynamicValue(
      { ...field, kind: 'TEXT' },
      { kind: 'TEXT', translations: [{ locale: 'ar', text: 'abcd' }] },
    ),
    true,
  );
  assert.equal(
    validateDynamicValue(
      { ...field, kind: 'CHOICE' },
      { kind: 'CHOICE', optionIds: [randomUUID()] },
    ),
    false,
  );
  assert.equal(validateDynamicValue(field, undefined), false);
});
test('staff client uses memory CSRF, safe errors, schema parsing and clears expired authorization', async () => {
  const csrf = randomBytes(32).toString('base64url'),
    now = new Date().toISOString();
  let invalidated = 0,
    header: string | undefined;
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/auth/login')
      res.end(
        JSON.stringify({
          account: {
            id: randomUUID(),
            email: 'fixture@example.test',
            displayName: 'Fixture',
            role: 'ADMIN',
            status: 'ACTIVE',
            version: '1',
            createdAt: now,
          },
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          csrfToken: csrf,
        }),
      );
    else if (req.url === '/api/v1/admin/write') {
      header = req.headers['x-csrf-token'] as string | undefined;
      res.end('{}');
    } else if (req.url === '/api/v1/admin/invalid-unit') {
      res.statusCode = 422;
      res.end(
        JSON.stringify({
          error: {
            code: 'INVALID_STATE',
            requestId: 'fixture',
            message: 'Canonical unit must be active.',
          },
        }),
      );
    } else {
      res.statusCode = 401;
      res.end(
        JSON.stringify({
          error: {
            code: 'UNAUTHENTICATED',
            requestId: 'fixture',
            message: 'internal secret MUST NOT DISPLAY',
          },
        }),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  try {
    const client = new StaffApiClient(`http://127.0.0.1:${address.port}`, () => invalidated++);
    await assert.rejects(
      () => client.request('/admin/write', z.object({}), {}, 'POST'),
      (e) => e instanceof StaffApiError && e.status === 401,
    );
    await client.login('fixture@example.test', randomBytes(24).toString('base64url'));
    await client.request('/admin/write', z.object({}), {}, 'POST');
    assert.equal(header, csrf);
    await assert.rejects(
      () => client.request('/admin/invalid-unit', z.unknown()),
      (e) => e instanceof StaffApiError && e.validationMessage === 'Canonical unit must be active.',
    );
    await assert.rejects(
      () => client.request('/admin/expired', z.unknown()),
      (e) =>
        e instanceof StaffApiError && !e.message.includes('secret') && e.validationMessage === null,
    );
    assert.equal(invalidated, 1);
    await assert.rejects(
      () => client.request('/admin/write', z.object({}), {}, 'POST'),
      (e) => e instanceof StaffApiError && e.status === 401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('specified palette and semantic text/action contrast are preserved', () => {
  assert.equal(palette.gold500, '#C9A15B');
  assert.equal(palette.charcoal950, '#0D0F10');
  assert.equal(space.space30, 120);
  for (const text of [
    colors.text.primary,
    colors.text.secondary,
    colors.text.muted,
    colors.text.gold,
  ])
    assert.ok(contrastRatio(text, colors.background.surface) >= 4.5, text);
  assert.ok(contrastRatio(colors.text.primary, colors.action.primary) >= 4.5);
  assert.ok(contrastRatio(colors.border.focus, colors.background.surface) >= 3);
});
test('actual loaded Arabic fonts cover Sorani-specific glyphs', () => {
  const sample = 'کوردیی سۆرانی ڕ ڵ ێ ۆ ە پ چ ژ گ';
  for (const [family, file] of [
    ['ibm-plex-sans-arabic', '400Regular/IBMPlexSansArabic_400Regular.ttf'],
    ['ibm-plex-sans-arabic', '600SemiBold/IBMPlexSansArabic_600SemiBold.ttf'],
    ['noto-sans-arabic', '400Regular/NotoSansArabic_400Regular.ttf'],
  ]) {
    const font = openSync('node_modules/@expo-google-fonts/' + family + '/' + file);
    for (const char of sample)
      assert.ok(font.hasGlyphForCodePoint(char.codePointAt(0)!), family + ' lacks ' + char);
  }
});
test('live collection maps exact filters, cover-first media and permitted PDF owner context', async () => {
  const productId = randomUUID(),
    categoryId = randomUUID(),
    typeId = randomUUID(),
    imageId = randomUUID(),
    videoId = randomUUID(),
    sheetId = randomUUID(),
    pdfId = randomUUID(),
    definitionId = randomUUID();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture');
    assert.equal(url.pathname, '/api/v1/products');
    assert.equal(url.searchParams.get('locale'), 'ckb');
    assert.equal(url.searchParams.get('category'), categoryId);
    assert.deepEqual(JSON.parse(url.searchParams.get('filters')!), [
      { definitionId, kind: 'NUMBER', minimum: '0.000001', maximum: '0.000001' },
    ]);
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        items: [
          {
            id: productId,
            categoryId,
            productTypeId: typeId,
            name: 'Product',
            description: null,
            modelCode: 'Exact',
            coverAssetId: imageId,
            categoryName: 'Category',
            productTypeName: 'Type',
            resolvedNameLocale: 'ckb',
            media: [
              { assetId: videoId, kind: 'VIDEO', title: 'Video', altText: '' },
              { assetId: imageId, kind: 'IMAGE', title: 'Image', altText: 'Real cover' },
            ],
            documents: [{ assetId: pdfId, sheetId, title: 'Permitted document' }],
            attributes: [
              {
                definitionId,
                label: 'Measure',
                unitSymbol: 'mm',
                value: { kind: 'NUMBER', number: '0.000001' },
              },
            ],
          },
        ],
        filters: [],
        page: 1,
        pageSize: 12,
        hasNextPage: true,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const page = await new ApiCatalogDataSource(
      new PublicApiClient('http://127.0.0.1:' + address.port),
    ).products('ckb', {
      categoryId,
      filters: [{ definitionId, kind: 'NUMBER', minimum: '0.000001', maximum: '0.000001' }],
    });
    assert.equal(page.nextCursor, '2');
    assert.equal(page.total, null);
    assert.deepEqual(
      page.items[0]!.media.map((m) => m.id),
      [imageId, videoId],
    );
    assert.equal(page.items[0]!.attributes[0]!.value, '0.000001');
    assert.equal(page.items[0]!.documents[0]!.media.ownerId, sheetId);
    assert.equal(page.items[0]!.documents[0]!.media.ownerType, 'TECHNICAL_SOURCE');
    assert.equal(page.items[0]!.documents[0]!.media.profile, 'original');
    assert.equal(page.items[0]!.documents[0]!.id, sheetId + ':' + pdfId);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('demo categories enforce children versus products and generic attributes', async () => {
  const source = new DemoCatalogDataSource();
  for (const locale of ['ar', 'en', 'ckb'] as const) {
    const roots = await source.categories(locale, null);
    assert.equal(roots.items.length, 3);
    const children = await source.categories(locale, 'systems');
    assert.equal(children.items.length, 2);
    assert.equal((await source.products(locale, { categoryId: 'systems' })).items.length, 0);
    const p = await source.product('aurum-01', locale);
    assert.equal(p.documents[0]?.permitted, true);
    assert.equal(p.attributes[0]?.id, 'material');
    assert.ok(p.name);
    assert.equal((await source.products(locale, { text: 'not-a-product' })).items.length, 0);
  }
  await assert.rejects(
    source.product('missing', 'en'),
    (e: unknown) => e instanceof ApiError && e.code === 'not-found',
  );
});
test('API origins and demo media cannot expose arbitrary paths', async () => {
  for (const origin of [
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com/path',
  ])
    assert.throws(() => new PublicApiClient(origin));
  const source = new DemoCatalogDataSource(),
    p = await source.product('aurum-01', 'en'),
    resolver = new DemoMediaResolver();
  assert.equal((await resolver.resolve(p.media[0]!)).expiresAt, null);
  await assert.rejects(resolver.resolve({ ...p.media[0]!, demoUrl: '/private/original' }));
  assert.notDeepEqual(
    catalogKeys.product('demo', 'ar', 'one'),
    catalogKeys.product('api', 'ar', 'one'),
  );
});
test('real HTTP adapter maps locale/category cursors, validates payloads and expiry, and fails without fixture fallback', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  let mode = 'category';
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const url = new URL(req.url ?? '/', 'http://local');
    if (mode === 'category') {
      assert.equal(url.searchParams.get('locale'), 'ckb');
      res.end(
        JSON.stringify({
          items: [
            { id, parentId: null, name: 'کوردی', description: null, resolvedNameLocale: 'ckb' },
          ],
          nextCursor: 'opaque',
        }),
      );
    } else if (mode === 'invalid')
      res.end(JSON.stringify({ items: [{ id: 'bad' }], nextCursor: null }));
    else if (mode === 'expired')
      res.end(
        JSON.stringify({
          url: 'https://private.example/media',
          expiresAt: new Date(0).toISOString(),
          method: 'GET',
        }),
      );
    else {
      res.statusCode = 503;
      res.end('{}');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const client = new PublicApiClient('http://127.0.0.1:' + address.port),
      source = new ApiCatalogDataSource(client);
    const result = await source.categories('ckb', null);
    assert.equal(result.nextCursor, 'opaque');
    assert.equal(result.items[0]?.image, null);
    mode = 'invalid';
    await assert.rejects(
      source.categories('en', null),
      (e: unknown) => e instanceof ApiError && e.code === 'invalid',
    );
    mode = 'expired';
    await assert.rejects(
      new ApiMediaResolver(client).resolve(
        { id, ownerId: id, ownerType: 'PRODUCT', kind: 'image', alt: 'Example', profile: 'card' },
        'PREVIEW',
      ),
    );
    mode = 'unavailable';
    await assert.rejects(
      source.categories('en', null),
      (e: unknown) => e instanceof ApiError && e.code === 'network',
    );
    await assert.rejects(
      source.products('en', {}),
      (e: unknown) => e instanceof ApiError && e.code === 'network',
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
