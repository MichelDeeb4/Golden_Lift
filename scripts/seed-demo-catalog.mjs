// Local operator tool. All business writes use authenticated owning-service APIs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { config, env } from '../database/scripts/db.mjs';
import { demoLeaves, demoProducts } from './demo-catalog-data.mjs';

const base = 'http://localhost:3000/api/v1',
  origin = 'http://localhost:8081';
const translations = (en, ar, description = null, descriptionAr = null) => [
  { locale: 'ar', name: ar, description: descriptionAr },
  { locale: 'en', name: en, description },
];
const roots = (number) => '10000000-0000-4000-8000-' + String(number).padStart(12, '0');
const manifestPath = '.local/demo-catalog-manifest.json';
let cookie = '',
  csrf = '';
async function request(route, body, method = body === undefined ? 'GET' : 'POST') {
  const binary = Buffer.isBuffer(body);
  // Binary upload instructions target Media directly; Gateway proxies JSON only.
  const requestBase = binary ? 'http://localhost:3003/api/v1' : base;
  const response = await fetch(requestBase + route, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      origin,
      ...(cookie ? { cookie, 'x-csrf-token': csrf } : {}),
      ...(body === undefined
        ? {}
        : { 'content-type': binary ? 'application/octet-stream' : 'application/json' }),
    },
    ...(body === undefined ? {} : { body: binary ? body : JSON.stringify(body) }),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(
      route + ': HTTP ' + response.status + ' ' + (result?.error?.code ?? 'REQUEST_FAILED'),
    );
  if (route === '/auth/login') {
    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    csrf = result.csrfToken;
  }
  return result;
}
async function collection(resource) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 40; page++) {
    const result = await request(
      '/admin/' + resource + '?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
    );
    rows.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) return rows;
  }
  throw new Error('Collection exceeds the bounded local seed scope.');
}
async function reviewed(resource, id, change) {
  const current = await request('/admin/' + resource + '/' + id);
  const input = {
    change,
    expectedVersion: current.version,
    expectedSchemaRevision: current.schemaRevision ?? null,
  };
  const preview = await request('/admin/' + resource + '/' + id + '/changes/preview', input);
  if (preview.blockers.length)
    throw new Error('Reviewed change is blocked for ' + resource + '/' + id);
  return request('/admin/' + resource + '/' + id + '/changes', {
    ...input,
    precondition: preview.precondition,
    confirm: true,
  });
}
async function passwordFromInput() {
  console.log('Enter Admin password through stdin; it will not be saved or echoed.');
  process.stdin.setEncoding('utf8');
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  let value = '';
  try {
    for await (const chunk of process.stdin) {
      if (chunk.includes('\u0003')) throw new Error('Cancelled.');
      value += chunk;
      if (/[\r\n]/.test(value)) break;
      if (value.length > 128) throw new Error('Invalid password input length.');
    }
  } finally {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  return value.split(/[\r\n]/)[0];
}
async function backup() {
  const cfg = config(),
    directory = path.resolve(
      '.local/demo-backup-' + new Date().toISOString().replace(/[:.]/g, '-'),
    );
  await fs.mkdir(directory, { recursive: false });
  for (const service of ['catalog', 'media']) {
    const result = spawnSync(
      path.join(
        process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin',
        'pg_dump' + (process.platform === 'win32' ? '.exe' : ''),
      ),
      ['--format=custom', '--file=' + path.join(directory, service + '.dump')],
      { env: env(cfg, service), encoding: 'utf8', windowsHide: true },
    );
    if (result.error || result.status !== 0)
      throw new Error('Owning ' + service + ' backup failed; no cleanup was performed.');
  }
  console.log('Catalog and Media backups created in ' + path.relative(process.cwd(), directory));
  return directory;
}
async function image(name, manifest) {
  const cached = manifest.images?.[name];
  if (cached) {
    const detail = await request('/admin/media/assets/' + cached);
    if (
      detail.asset.status === 'READY' &&
      detail.asset.security === 'VERIFIED' &&
      !detail.asset.deleted
    )
      return cached;
    throw new Error('Previously seeded demo image is no longer usable.');
  }
  const bytes = await sharp(await fs.readFile('apps/storefront/public/demo/' + name + '.svg'))
    .resize({ width: 1600 })
    .jpeg({ quality: 90 })
    .toBuffer();
  let upload = manifest.uploads?.[name]
    ? await request('/admin/media/uploads/' + manifest.uploads[name])
    : await request('/admin/media/uploads', {
        kind: 'IMAGE',
        name: 'Golden Lift Demo - ' + name + '.jpg',
        purpose: 'CATALOG',
        bytes: String(bytes.length),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        idempotencyKey: 'demo-' + randomUUID(),
      });
  manifest.uploads ??= {};
  manifest.uploads[name] = upload.id;
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const partBytes = upload.upload.partBytes;
  if (upload.status === 'OPEN') {
    for (let start = 0, number = 1; start < bytes.length; start += partBytes, number++) {
      const part = bytes.subarray(start, start + partBytes);
      const saved = upload.parts.find((row) => row.number === number);
      if (saved) {
        if (saved.sha256 !== createHash('sha256').update(part).digest('hex'))
          throw new Error('Resumable demo image bytes changed; refusing to overwrite a part.');
        continue;
      }
      upload = await request('/admin/media/uploads/' + upload.id + '/parts/' + number, part);
    }
    await request('/admin/media/uploads/' + upload.id + '/complete', {
      expectedVersion: upload.version,
    });
  } else if (upload.status !== 'COMPLETED')
    throw new Error('Demo upload is closed and cannot be resumed.');
  for (let attempt = 0; attempt < 120; attempt++) {
    const detail = await request('/admin/media/assets/' + upload.assetId);
    if (detail.asset.status === 'FAILED' || detail.asset.security === 'BLOCKED')
      throw new Error('Native demo image processing failed.');
    if (detail.asset.status === 'READY' && detail.asset.security === 'VERIFIED') {
      // Wait for the actual signed Media event to reach Catalog before associating.
      if (
        detail.registration === 'READY' ||
        detail.registration?.registered ||
        detail.registration?.status === 'READY'
      )
        break;
    }
    if (attempt === 119) throw new Error('Native image processing timed out.');
    await delay(1000);
  }
  manifest.images ??= {};
  manifest.images[name] = upload.assetId;
  delete manifest.uploads[name];
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  console.log('Verified demo image: ' + name);
  return upload.assetId;
}
async function main() {
  if (!process.argv.includes('--apply') || !process.argv.includes('--replace-known-test-records'))
    throw new Error(
      'Use --apply --replace-known-test-records for the authorized local demo replacement.',
    );
  if (process.env.NODE_ENV === 'production' || process.env.GL_DATABASE_CONFIG_FILE)
    throw new Error('This tool is restricted to the normal local development profile.');
  let password = await passwordFromInput();
  await request('/auth/login', { email: 'Admin@left.test', password });
  password = '';
  const session = await request('/auth/session');
  if (session.account.role !== 'ADMIN')
    throw new Error('A live content Admin session is required.');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    manifest = { formatVersion: 1, images: {}, products: [] };
  }
  // This operator now targets the already prepared/migrated demo. It never invents relationships.
  for (const leaf of demoLeaves) {
    const children = await request(
      '/admin/categories?parentId=' + roots(leaf.root) + '&locale=en&limit=100',
    );
    const category = children.items.find((row) =>
      row.translations.some((text) => text.locale === 'en' && text.name === leaf.en),
    );
    if (!category)
      throw new Error(
        'Prepare the demo leaf categories and their reviewed reusable groups before seeding.',
      );
    const schema = (await request('/admin/categories/' + category.id + '/schema?locale=en')).form;
    const expected = [
      'width',
      'height',
      'depth',
      'load',
      'speed',
      'voltage',
      'finish',
      'accessible',
      'notes',
    ];
    if (expected.some((code) => !schema.fields.some((field) => field.code === 'DEMO_' + code)))
      throw new Error(
        'Prepared demo category schema is incomplete; no schema assignments will be inferred.',
      );
  }
  manifest.backup = await backup();
  const mediaCapabilities = await request('/admin/media/capabilities');
  if (!mediaCapabilities.scannerAvailable)
    throw new Error('Native scanner is unavailable; no placeholder verification is permitted.');
  for (const name of ['hero', 'silver', 'door', 'controller', 'machine', 'cabin'])
    await image(name, manifest);

  const unitRows = await collection('units'),
    units = {};
  for (const [key, symbol, dimension, en, ar] of [
    ['mm', 'mm', 'length', 'Millimetre', 'مليمتر'],
    ['kg', 'kg', 'mass', 'Kilogram', 'كيلوغرام'],
    ['mps', 'm/s', 'speed', 'Metres per second', 'متر في الثانية'],
    ['V', 'V', 'voltage', 'Volt', 'فولت'],
  ]) {
    const code = 'DEMO_' + key;
    units[key] =
      unitRows.find((row) => row.code === code) ??
      (await request('/admin/units', {
        code,
        symbol,
        dimension,
        translations: translations(en, ar),
      }));
  }
  const specs = [
    ['width', 'Width', 'العرض', 'NUMBER', 'mm', 'dimensions'],
    ['height', 'Height', 'الارتفاع', 'NUMBER', 'mm', 'dimensions'],
    ['depth', 'Depth', 'العمق', 'NUMBER', 'mm', 'dimensions'],
    ['load', 'Configured system load', 'حمولة النظام في هذا التصور', 'NUMBER', 'kg', 'performance'],
    [
      'speed',
      'Configured travel speed',
      'سرعة الحركة في هذا التصور',
      'NUMBER',
      'mps',
      'performance',
    ],
    ['voltage', 'Supply voltage', 'جهد التغذية', 'NUMBER', 'V', 'performance'],
    ['finish', 'Finish', 'التشطيب', 'CHOICE', null, 'features'],
    ['accessible', 'Accessible configuration', 'إعداد لسهولة الوصول', 'BOOLEAN', null, 'features'],
    ['notes', 'Configuration notes', 'ملاحظات الإعداد', 'TEXT', null, 'features'],
  ];
  const definitionRows = await collection('attributes'),
    definitions = {};
  for (const [key, en, ar, kind, unit] of specs)
    definitions[key] =
      definitionRows.find((row) => row.code === 'DEMO_' + key) ??
      (await request('/admin/attributes', {
        code: 'DEMO_' + key,
        translations: translations(en, ar),
        kind,
        unitCode: unit ? units[unit].code : null,
        minimum: kind === 'NUMBER' ? '0' : null,
        maximum: null,
        allowMultiple: false,
        public: true,
        filterable: kind !== 'TEXT',
        textMultiline: kind === 'TEXT',
        textMaxLength: 4000,
      }));
  let finish = await request('/admin/attributes/' + definitions.finish.id);
  const options = {};
  for (const [key, en, ar] of [
    ['brushed', 'Brushed stainless steel', 'ستانلس ستيل مصقول'],
    ['mirror', 'Mirror metal', 'معدن مرآة'],
    ['matte', 'Matte metal', 'معدن مطفي'],
    ['painted', 'Powder-coated finish', 'تشطيب مطلي بالمسحوق'],
  ]) {
    const current = finish.options.find((row) => row.code === 'DEMO_' + key);
    options[key] =
      current ??
      (await request('/admin/attributes/' + finish.id + '/options', {
        code: 'DEMO_' + key,
        sortOrder: String((Object.keys(options).length + 1) * 1024),
        translations: translations(en, ar),
      }));
    finish = await request('/admin/attributes/' + finish.id);
  }
  const leaves = {};
  for (const leaf of demoLeaves) {
    const parent = await request('/admin/categories/' + roots(leaf.root));
    const children = await request(
      '/admin/categories?parentId=' + parent.id + '&locale=en&limit=100',
    );
    const current = children.items.find((row) =>
      row.translations.some((text) => text.locale === 'en' && text.name === leaf.en),
    );
    leaves[leaf.key] =
      current ??
      (await request('/admin/categories', {
        parentId: parent.id,
        expectedParentVersion: parent.version,
        coverAssetId: manifest.images[leaf.image],
        translations: translations(
          leaf.en,
          leaf.ar,
          'Golden Lift demonstration collection.',
          'مجموعة عرض توضيحي لجولدن لفت.',
        ),
      }));
    const refreshed = await request('/admin/categories/' + parent.id);
    await request(
      '/admin/categories/' + parent.id,
      {
        expectedVersion: refreshed.version,
        coverAssetId: manifest.images[leaf.image],
        translations: refreshed.translations.map(({ locale, name, description, slug }) => ({
          locale,
          name,
          description,
          slug,
        })),
      },
      'PATCH',
    );
  }
  const products = await collection('products');
  for (const [index, data] of demoProducts.entries()) {
    let product = products.find((row) => row.modelCode === data.code);
    if (!product) {
      const category = await request('/admin/categories/' + leaves[data.leaf].id);
      const entries = {
        width: String(data.size[0]),
        height: String(data.size[1]),
        depth: String(data.size[2]),
        load: String(data.load),
        speed: data.speed,
        voltage: String(data.voltage),
      };
      const values = Object.entries(entries).map(([key, number]) => ({
        definitionId: definitions[key].id,
        value: { kind: 'NUMBER', number },
      }));
      values.push(
        {
          definitionId: definitions.finish.id,
          value: { kind: 'CHOICE', optionIds: [options[data.finish].id] },
        },
        {
          definitionId: definitions.accessible.id,
          value: { kind: 'BOOLEAN', boolean: data.accessible },
        },
        {
          definitionId: definitions.notes.id,
          value: {
            kind: 'TEXT',
            translations: [
              {
                locale: 'ar',
                text: 'نموذج عرض توضيحي؛ المواصفات والصورة للتوضيح وليست بيانات مصنع معتمدة.',
              },
              {
                locale: 'en',
                text: 'Demonstration model. Specifications and illustration are sample content, not certified manufacturer data.',
              },
            ],
          },
        },
      );
      product = await request('/admin/products', {
        categoryId: category.id,
        modelCode: data.code,
        translations: translations(
          data.en,
          data.ar,
          data.description +
            ' Demonstration model; sample specifications and original illustration.',
          data.descriptionAr + ' نموذج عرض توضيحي بمواصفات وصورة توضيحية.',
        ),
      });
      product = await request(
        '/admin/products/' + product.id,
        {
          expectedVersion: product.version,
          expectedSchemaRevision: product.schemaRevision,
          coverAssetId: manifest.images[data.image],
          values,
        },
        'PATCH',
      );
      if (data.gallery) {
        const detail = await request('/admin/products/' + product.id + '/management');
        await request('/admin/products/' + product.id + '/media', {
          expectedVersion: detail.version,
          coverAssetId: manifest.images[data.image],
          media: [
            ...detail.media.map(({ id, assetId, kind, translations }) => ({
              id,
              assetId,
              kind,
              translations,
            })),
            {
              id: randomUUID(),
              assetId: manifest.images[data.gallery],
              kind: 'IMAGE',
              translations: [
                { locale: 'ar', title: 'صورة توضيحية إضافية', caption: null, altText: data.ar },
                {
                  locale: 'en',
                  title: 'Additional concept illustration',
                  caption: null,
                  altText: data.en,
                },
              ],
            },
          ],
        });
      }
    }
    const detail = await request('/admin/products/' + product.id + '/management');
    await request('/admin/products/' + product.id + '/publication', {
      expectedVersion: detail.version,
      active: true,
      featured: !!data.featured,
      sortOrder: String((index + 1) * 1024),
      featuredOrder: String((index + 1) * 1024),
    });
    if (!manifest.products.some((row) => row.id === product.id))
      manifest.products.push({ id: product.id, code: data.code, name: data.en });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    console.log('Published: ' + data.en);
  }
  // Exact inventoried placeholders only; no deletion by broad name/prefix matching.
  const removed = [];
  for (const [id, expectedName] of [
    ['2121c45d-19a0-4a05-85b2-482827a96ebd', 'test'],
    ['61c9f9af-9ddf-4a11-b9e1-1ea0fdb6cd49', 'Elevator cabins ar sub'],
  ]) {
    let preview;
    try {
      preview = await request('/admin/categories/' + id + '/deletion-preview');
    } catch (error) {
      if (error.message.includes('HTTP 404')) continue;
      throw error;
    }
    if (
      !preview.category.translations.some((row) => row.locale === 'ar' && row.name === expectedName)
    )
      throw new Error('Placeholder changed; cleanup stopped for review.');
    const expectedProducts = id === '2121c45d-19a0-4a05-85b2-482827a96ebd' ? '1' : '0';
    if (
      preview.impact.descendantCategoryCount !== '0' ||
      preview.impact.productCount !== expectedProducts
    )
      throw new Error('Placeholder branch gained unrelated records; cleanup stopped for review.');
    await request(
      '/admin/categories/' + id,
      {
        confirm: true,
        expectedVersion: preview.category.version,
        previewPrecondition: preview.previewPrecondition,
      },
      'DELETE',
    );
    removed.push(id);
  }
  for (const [resource, id, code, kind] of [
    ['attributes', '1ce875f4-b664-460d-80fd-c44d69d3348e', 'tf', 'definition.delete'],
    ['attributes', '790c4931-0857-4ac8-a621-5ffcbc77e950', 'choice1', 'definition.delete'],
    ['attributes', '9d8b4760-8c2e-4561-8bee-35640ecce87e', 'choice2', 'definition.delete'],
  ]) {
    let current;
    try {
      current = await request('/admin/' + resource + '/' + id);
    } catch (error) {
      if (error.message.includes('HTTP 404')) continue;
      throw error;
    }
    if (current.code !== code) throw new Error('Placeholder identity changed; cleanup stopped.');
    await reviewed(resource, id, { kind });
    removed.push(id);
  }
  const retiredAssets = [];
  for (const [id, name] of [
    ['d15c3aac-2b0c-4213-9f74-85b0dee3da5a', 'cabin1.webp'],
    ['bb31048c-b603-460e-972c-eec662fcc448', 'p1.jpg'],
    ['69e39017-08d4-4680-99d1-14473b352a12', 'p11.jpg'],
    ['5c7f8c4e-ee3a-4aca-82d8-ff2d406cb2fc', 'istockphoto-864526000-640_adpp_is.mp4'],
  ]) {
    const detail = await request('/admin/media/assets/' + id);
    if (detail.asset.deleted) continue;
    if (detail.asset.name !== name)
      throw new Error('Inventoried placeholder asset changed; cleanup stopped.');
    const usage = await request('/admin/media/assets/' + id + '/usage?limit=1&after=0');
    if (usage.length) throw new Error('Placeholder Media has a live owner; refusing retirement.');
    await request('/admin/media/assets/' + id + '/retire', {
      expectedVersion: detail.asset.version,
      confirmed: true,
    });
    retiredAssets.push(id);
  }
  manifest.removedPlaceholderIds = [
    ...new Set([...(manifest.removedPlaceholderIds ?? []), ...removed]),
  ];
  manifest.retiredPlaceholderAssetIds = [
    ...new Set([...(manifest.retiredPlaceholderAssetIds ?? []), ...retiredAssets]),
  ];
  manifest.completedAt = new Date().toISOString();
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const live = await request('/products?locale=en&page=1&pageSize=24&sort=featured');
  const actualCodes = new Set(live.items.map((row) => row.modelCode));
  if (demoProducts.some((row) => !actualCodes.has(row.code)))
    throw new Error('Public API does not expose the complete demo catalog.');
  console.log(
    JSON.stringify({
      status: 'PASS',
      products: demoProducts.length,
      leafCategories: demoLeaves.length,
      verifiedImages: Object.keys(manifest.images).length,
      removedPlaceholderRecords: removed.length,
    }),
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (cookie) {
      try {
        await request('/auth/logout', {});
      } catch {
        console.error('Demo operator session logout failed.');
        process.exitCode = 1;
      }
    }
  });
