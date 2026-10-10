import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { ApplicationError, uuid, version } from '@business-platform/contracts';
import type {
  AuthenticatedActor,
  ProductDto,
  CategorySchemaResponse,
  Uuid,
} from '@business-platform/contracts';
import { httpConfig } from '@business-platform/platform';
import { databaseFixture } from '../../../packages/platform/tests/support/database-fixture.js';
import { catalogApplication } from '../src/composition/application.js';
import { gatewayApplication } from '../../gateway/src/composition/application.js';
import { orm } from '../src/infrastructure/prisma/client.js';
import type { PrismaClient } from '../src/infrastructure/prisma/client.js';
import { PrismaCatalogUnitOfWork } from '../src/infrastructure/prisma/unit-of-work.js';
import { CreateCategory } from '../src/application/use-cases/create-category.js';

let fixture: Awaited<ReturnType<typeof databaseFixture>>, db: PrismaClient;
let catalog: Awaited<ReturnType<typeof catalogApplication>>,
  gateway: Awaited<ReturnType<typeof gatewayApplication>>,
  origin: string;
const actor: AuthenticatedActor = {
  id: uuid(randomUUID()),
  role: 'ADMIN',
  authVersion: version('1'),
};
let requestActor: AuthenticatedActor | null = actor;
const ids = { newUuid: () => uuid(randomUUID()) },
  clock = { now: () => new Date().toISOString() };
const translations = [{ locale: 'ar' as const, name: 'Ù…Ù†ØªØ¬ ØªØ¬Ø±ÙŠØ¨ÙŠ', description: null }];
before(async () => {
  fixture = await databaseFixture('catalog', { catalogProfile: 'category' });
  db = orm(fixture.pool);
  catalog = await catalogApplication(httpConfig('catalog', {}), new pg.Pool(fixture.pool.options), {
    authenticate: async () => {
      if (!requestActor) throw new ApplicationError('UNAUTHENTICATED', 'Staff session required.');
      return requestActor;
    },
  });
  await catalog.listen(0, '127.0.0.1');
  const upstream = await catalog.getUrl();
  gateway = await gatewayApplication(httpConfig('gateway', {}), {
    catalog: upstream,
    identity: upstream,
    media: upstream,
    inquiries: upstream,
  });
  await gateway.listen(0, '127.0.0.1');
  origin = await gateway.getUrl();
});
after(async () => {
  await gateway?.close();
  await catalog?.close();
  await db?.$disconnect();
  await fixture?.dispose();
});
async function call(method: string, path: string, body?: unknown) {
  return fetch(origin + '/api/v1' + path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function category(parentId: Uuid | null = null) {
  const uow = new PrismaCatalogUnitOfWork(db),
    parent = parentId ? await uow.execute((r) => r.categories.find(parentId, 'ar')) : null;
  return new CreateCategory(uow, ids, clock).execute(
    {
      parentId,
      expectedParentVersion: parent?.version ?? null,
      translations: [{ ...translations[0]!, slug: null }],
    },
    actor,
  );
}
async function create(categoryId: Uuid, extra: object = {}): Promise<ProductDto> {
  const response = await call('POST', '/admin/products', { categoryId, translations, ...extra });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as ProductDto;
}
test('minimal category and Arabic name persist an inactive draft with no type, cover or values', async () => {
  const c = await category(),
    p = await create(c.id);
  assert.equal(p.active, false);
  assert.equal(p.coverAssetId, null);
  assert.deepEqual(p.values, []);
  assert.equal('productTypeId' in p, false);
  assert.match(p.version, /^[1-9]\d*$/);
  const row = await db.products.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal('product_type_id' in row, false);
  assert.equal(row.cover_media_id, null);
  assert.equal(row.is_active, false);
  const response = await call('GET', '/admin/products/' + p.id + '/management');
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as ProductDto).id, p.id);
  const list = await call('GET', '/admin/products?locale=ar&categoryId=' + c.id);
  assert.equal(((await list.json()) as { items: ProductDto[] }).items[0]?.id, p.id);
  assert.equal((await call('GET', '/products/' + p.id + '?locale=ar')).status, 404);
  assert.equal(await db.productMedia.count({ where: { product_id: p.id } }), 0);
  assert.equal(await db.outboxEvents.count({ where: { aggregate_id: p.id } }), 1);
});
test('optional names and model code persist; stable code conflicts roll back the entire creation', async () => {
  const c = await category(),
    code = 'DRAFT-' + randomUUID();
  const p = await create(c.id, {
    modelCode: code,
    translations: [
      ...translations,
      { locale: 'en', name: 'Draft', description: null },
      { locale: 'ckb', name: 'Ø¨Û•Ø±Ù‡Û•Ù…', description: null },
    ],
  });
  assert.equal(p.modelCode, code);
  assert.equal(p.translations.length, 3);
  const count = await db.products.count();
  const conflict = await call('POST', '/admin/products', {
    categoryId: c.id,
    translations,
    modelCode: code,
  });
  assert.equal(conflict.status, 409);
  assert.equal(await db.products.count(), count);
  assert.doesNotMatch(await conflict.text(), /Prisma|INSERT INTO|pg_/);
});
test('non-leaf, missing and deleted category placement are rejected and create no product', async () => {
  const root = await category();
  await category(root.id);
  const deleted = await category();
  await db.$transaction(
    (tx) =>
      tx.$queryRaw`SELECT catalog.soft_delete_branch(${deleted.id}::uuid,${deleted.version}::bigint)`,
    { isolationLevel: 'Serializable' },
  );
  const count = await db.products.count();
  for (const categoryId of [root.id, deleted.id, ids.newUuid()]) {
    const response = await call('POST', '/admin/products', { categoryId, translations });
    assert.equal(response.status, categoryId === root.id ? 422 : 404);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      categoryId === root.id ? 'INVALID_STATE' : 'NOT_FOUND',
    );
  }
  assert.equal(await db.products.count(), count);
});
test('Arabic name is mandatory and obsolete create fields are rejected instead of ignored', async () => {
  const c = await category(),
    count = await db.products.count();
  for (const body of [
    { categoryId: c.id, translations: [] },
    { categoryId: c.id, translations: [{ locale: 'ar', name: '   ' }] },
    { categoryId: c.id, translations: [{ locale: 'en', name: 'English only' }] },
    ...[
      'productTypeId',
      'coverAssetId',
      'expectedSchemaRevision',
      'expectedCategoryVersion',
      'values',
      'active',
    ].map((key) => ({ categoryId: c.id, translations, [key]: key === 'active' ? true : [] })),
  ]) {
    const response = await call('POST', '/admin/products', body);
    assert.equal(response.status, 400, await response.clone().text());
  }
  assert.equal(await db.products.count(), count);
});
test('required category attributes do not block drafts; duplicate group membership resolves one value', async () => {
  const c = await category(),
    definitionId = ids.newUuid();
  await db.$transaction(
    async (tx) => {
      await tx.specificationDefinitions.create({
        data: {
          id: definitionId,
          code: 'D-' + definitionId,
          value_type: 'NUMBER',
          is_public: true,
          is_filterable: true,
        },
      });
      await tx.specificationTranslations.create({
        data: { definition_id: definitionId, locale: 'ar', label: 'Ø§Ù„Ø·ÙˆÙ„' },
      });
      for (let index = 0; index < 2; index++) {
        const groupId = ids.newUuid();
        await tx.specificationGroups.create({ data: { id: groupId, code: 'G-' + groupId } });
        await tx.specificationGroupTranslations.create({
          data: { group_id: groupId, locale: 'ar', name: 'Ø£Ø¨Ø¹Ø§Ø¯' },
        });
        await tx.$executeRaw`INSERT INTO catalog.attribute_group_attributes(group_id,definition_id,is_required,is_filterable) VALUES(${groupId}::uuid,${definitionId}::uuid,true,true)`;
        await tx.$executeRaw`INSERT INTO catalog.category_attribute_groups(category_id,group_id,sort_order) VALUES(${c.id}::uuid,${groupId}::uuid,${String(index * 1024)}::bigint)`;
      }
    },
    { isolationLevel: 'Serializable' },
  );
  const p = await create(c.id);
  const schemaResponse = await call('GET', '/admin/products/' + p.id + '/edit-schema?locale=ar');
  assert.equal(schemaResponse.status, 200);
  const schema = (await schemaResponse.json()) as CategorySchemaResponse;
  assert.equal(schema.form.categoryId, c.id);
  assert.equal(schema.form.fields.length, 1);
  assert.equal(schema.form.fields[0]?.required, true);
  assert.equal('productTypeId' in schema.form, false);
  const publish = (version: string) =>
    call('POST', '/admin/products/' + p.id + '/publication', {
      expectedVersion: version,
      active: true,
      featured: false,
      sortOrder: '1024',
      featuredOrder: '1024',
    });
  assert.equal((await publish(p.version)).status, 422);
  const asset = ids.newUuid();
  await db.$transaction(
    (tx) =>
      tx.mediaAssetRefs.create({
        data: { id: asset, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
      }),
    { isolationLevel: 'Serializable' },
  );
  const edit = await call('PATCH', '/admin/products/' + p.id, {
    expectedVersion: p.version,
    expectedSchemaRevision: p.schemaRevision,
    coverAssetId: asset,
  });
  assert.equal(edit.status, 200);
  const covered = (await edit.json()) as ProductDto;
  assert.equal((await publish(covered.version)).status, 422);
  const values = await call('PATCH', '/admin/products/' + p.id, {
    expectedVersion: covered.version,
    expectedSchemaRevision: covered.schemaRevision,
    values: [{ definitionId, value: { kind: 'NUMBER', number: '99999999999999.123456' } }],
  });
  assert.equal(values.status, 200);
  const filled = (await values.json()) as ProductDto;
  assert.equal(filled.values.length, 1);
  assert.equal((await publish(filled.version)).status, 200);
  assert.equal(
    await db.productSpecificationValues.count({
      where: { product_id: p.id, definition_id: definitionId, deleted_at: null },
    }),
    1,
  );
  assert.equal((await call('GET', '/products/' + p.id + '?locale=ar')).status, 200);
  const stale = await call('PATCH', '/admin/products/' + p.id, {
    expectedVersion: p.version,
    expectedSchemaRevision: p.schemaRevision,
    translations,
  });
  assert.equal(stale.status, 409);
});
test('Admin authorization remains in the use case, including Super Admin separation', async () => {
  const c = await category(),
    count = await db.products.count();
  try {
    requestActor = { ...actor, role: 'SUPER_ADMIN' };
    assert.equal(
      (await call('POST', '/admin/products', { categoryId: c.id, translations })).status,
      403,
    );
    requestActor = null;
    assert.equal(
      (await call('POST', '/admin/products', { categoryId: c.id, translations })).status,
      401,
    );
  } finally {
    requestActor = actor;
  }
  assert.equal(await db.products.count(), count);
});
