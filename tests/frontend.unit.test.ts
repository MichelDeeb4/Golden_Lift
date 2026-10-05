import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { openSync } from 'fontkit';
import { colors, palette, contrastRatio, space } from '@golden-lift/tokens';
import {
  ApiError,
  PublicApiClient,
  ApiCatalogDataSource,
  ApiMediaResolver,
  catalogKeys,
} from '@golden-lift/api';
import { DemoCatalogDataSource, DemoMediaResolver } from '../apps/storefront/features/catalog/demo';
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
      (e: unknown) => e instanceof ApiError && e.code === 'unsupported',
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
