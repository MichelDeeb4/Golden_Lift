import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { performance } from 'node:perf_hooks';
import { after, before, test } from 'node:test';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type {
  AttributeKind,
  AttributeValue,
  AttributeDefinitionDto,
  ProductDto,
  Uuid,
} from '@golden-lift/contracts';
import { databaseFixture } from '../../../packages/platform/tests/support/database-fixture.js';
import { orm } from '../src/infrastructure/prisma/client.js';
import type { PrismaClient } from '../src/infrastructure/prisma/client.js';
import { PrismaCatalogUnitOfWork } from '../src/infrastructure/prisma/unit-of-work.js';
import type { CatalogUnitOfWork } from '../src/application/ports/catalog.js';
import { catalogApplication } from '../src/composition/application.js';
import { gatewayApplication } from '../../gateway/src/composition/application.js';
import { httpConfig } from '@golden-lift/platform';
import {
  CreateAttributeDefinition,
  CreateAttributeGroup,
  CreateCanonicalUnit,
  CreateAttributeOption,
} from '../src/application/use-cases/create-catalog-configuration.js';
import { ChangeCatalogSchema } from '../src/application/use-cases/change-catalog-schema.js';
import { CreateProduct, EditProduct } from '../src/application/use-cases/save-product.js';
import { ReadProducts } from '../src/application/use-cases/read-products.js';
import { ManageProducts } from '../src/application/use-cases/manage-products.js';
import { PrismaProductManagementUnitOfWork } from '../src/infrastructure/prisma/product-management.js';
import { PrismaCatalogDeletionUnitOfWork } from '../src/infrastructure/prisma/deletion.js';
import {
  GetMediaDeletionImpact,
  DeleteMedia,
  GetProductDeletionImpact,
  DeleteProduct,
} from '../src/application/use-cases/delete-catalog-entities.js';
import { PrismaMediaRegistry } from '../src/infrastructure/prisma/media-registry.js';
import { publicProductQuery } from '../src/presentation/http/public-product-query.js';
import { ReadCatalogConfiguration } from '../src/application/use-cases/read-catalog-configuration.js';
import { ManageCatalogRelationships } from '../src/application/use-cases/manage-catalog-relationships.js';
import { CreateCategory } from '../src/application/use-cases/create-category.js';
import { MoveProduct } from '../src/application/use-cases/move-product.js';
import {
  PreviewCategoryDeletion,
  DeleteCategoryBranch,
} from '../src/application/use-cases/delete-category-branch.js';
import type {
  ConfigurationChange,
  ConfigurationTarget,
} from '../src/application/ports/product-schema.js';
let fixture: Awaited<ReturnType<typeof databaseFixture>>,
  db: PrismaClient,
  uow: PrismaCatalogUnitOfWork;
const ids = { newUuid: () => uuid(randomUUID()) },
  clock = { now: () => new Date().toISOString() },
  actor = { id: ids.newUuid(), role: 'ADMIN' as const, authVersion: version('1') },
  translations = [{ locale: 'ar' as const, name: 'Synthetic Arabic', description: 'Arabic help' }];
const labelTranslations = translations.map((t) => ({ ...t, description: null }));
const isCode = (code: string) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;
before(async () => {
  fixture = await databaseFixture('catalog', { catalogProfile: 'category' });
  db = orm(fixture.pool);
  uow = new PrismaCatalogUnitOfWork(db);
});
after(async () => {
  if (db) await db.$disconnect();
  if (fixture) await fixture.dispose();
});
function reader() {
  return new ReadCatalogConfiguration(uow);
}
test('manual product pagination preserves bigint ordering and ID tie breaks', async () => {
  const t = await classification(),
    management = new ManageProducts(new PrismaProductManagementUnitOfWork(db), ids, clock);
  const products = [];
  for (let index = 0; index < 3; index++) products.push(await product(t.id));
  for (const [index, p] of products.entries())
    await management.publication(
      p.id,
      p.version,
      {
        active: true,
        featured: false,
        sortOrder: index === 2 ? '9223372036854775807' : '0',
        featuredOrder: '0',
      },
      actor,
    );
  const seen: string[] = [];
  let afterId: Uuid | undefined, afterOrder: string | undefined;
  for (let index = 0; index < 3; index++) {
    const page = await management.list(
      {
        locale: 'en',
        categoryId: t.id,
        limit: 1,
        sort: 'manual',
        cursorScope: 'fixture',
        ...(afterId ? { afterId } : {}),
        ...(afterOrder !== undefined ? { afterOrder } : {}),
      },
      actor,
    );
    assert.equal(page.items.length, 1);
    seen.push(page.items[0]!.id);
    if (page.nextCursor) {
      const cursor = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString('utf8')) as {
        id: string;
        order: string;
        scope: string;
      };
      afterId = uuid(cursor.id);
      afterOrder = cursor.order;
      assert.equal(cursor.scope, 'fixture');
    } else assert.equal(index, 2);
  }
  assert.deepEqual(seen, [
    ...products
      .slice(0, 2)
      .map((p) => p.id)
      .sort(),
    products[2]!.id,
  ]);
});
test('Admin management preserves versions and publication privacy; explicit deletion removes owned Media and Products', async () => {
  const t = await classification(),
    p = await product(t.id);
  const management = new ManageProducts(new PrismaProductManagementUnitOfWork(db), ids, clock);
  const read = new ReadProducts(uow);
  const registry = new PrismaMediaRegistry(db, 300),
    context = { ownerType: 'PRODUCT' as const, ownerId: p.id };
  assert.ok((await registry.authorize(p.coverAssetId, context, 'PREVIEW')).expiresAt);
  const superAdmin = { ...actor, role: 'SUPER_ADMIN' as const };
  await assert.rejects(() => management.detail(p.id, superAdmin), isCode('FORBIDDEN'));
  const before = await management.detail(p.id, actor);
  assert.equal(before.active, true);
  const unpublished = await management.publication(
    p.id,
    before.version,
    {
      active: false,
      featured: true,
      sortOrder: '9223372036854775807',
      featuredOrder: '-7',
    },
    actor,
  );
  assert.equal(unpublished.sortOrder, '9223372036854775807');
  assert.ok(BigInt(unpublished.version) > BigInt(before.version));
  await assert.rejects(() => read.public(p.id, 'en'), isCode('NOT_FOUND'));
  await assert.rejects(
    () => registry.authorize(p.coverAssetId, context, 'PREVIEW'),
    isCode('FORBIDDEN'),
  );
  assert.ok((await registry.usage(p.coverAssetId, 0, 25)).some((owner) => owner.ownerId === p.id));
  assert.equal(
    (
      await management.list({ locale: 'ar', active: false, featured: true, limit: 25 }, actor)
    ).items.some((x) => x.id === p.id),
    true,
  );
  await assert.rejects(
    () =>
      management.publication(
        p.id,
        before.version,
        { active: true, featured: false, sortOrder: '0', featuredOrder: '0' },
        actor,
      ),
    isCode('VERSION_CONFLICT'),
  );
  await assert.rejects(
    () =>
      management.publication(
        p.id,
        unpublished.version,
        { active: true, featured: false, sortOrder: '9223372036854775808', featuredOrder: '0' },
        actor,
      ),
    isCode('VALIDATION_FAILED'),
  );
  const video = ids.newUuid();
  await db.$transaction(
    (tx) =>
      tx.mediaAssetRefs.create({
        data: { id: video, media_kind: 'VIDEO', source_version: 1n, ready_at: new Date() },
      }),
    { isolationLevel: 'Serializable' },
  );
  const media = [
    {
      id: ids.newUuid(),
      assetId: video,
      kind: 'VIDEO' as const,
      sortOrder: '0',
      blocked: false,
      translations: [
        { locale: 'ckb' as const, title: 'Test caption', caption: null, altText: null },
      ],
    },
    ...unpublished.media,
  ];
  const updated = await management.media(p.id, unpublished.version, p.coverAssetId, media, actor);
  assert.equal(updated.media[0]?.assetId, video);
  assert.equal(updated.media[0]?.translations[0]?.title, 'Test caption');
  await db.$transaction(
    (tx) =>
      tx.mediaAssetRefs.update({
        where: { id: video },
        data: { security_blocked: true, source_version: 2n },
      }),
    { isolationLevel: 'Serializable' },
  );
  await assert.rejects(
    () =>
      management.publication(
        p.id,
        updated.version,
        { active: true, featured: false, sortOrder: '0', featuredOrder: '0' },
        actor,
      ),
    isCode('INVALID_STATE'),
  );
  await assert.rejects(
    management.media(
      p.id,
      updated.version,
      p.coverAssetId,
      updated.media.filter((m) => m.assetId !== video),
      actor,
    ),
    isCode('VALIDATION_FAILED'),
  );
  const deletions = new PrismaCatalogDeletionUnitOfWork(db);
  const mediaImpact = await new GetMediaDeletionImpact(deletions).execute(video, actor);
  const mediaDeletion = await new DeleteMedia(deletions, ids).execute(
    video,
    {
      confirmed: true,
      expectedVersion: mediaImpact.expectedVersion,
      impactRevision: mediaImpact.impactRevision,
    },
    actor,
  );
  assert.equal(mediaDeletion.status, 'MEDIA_CLEANUP');
  assert.equal(await db.productMedia.count({ where: { product_id: p.id, asset_id: video } }), 0);
  // Exercise the Catalog consumer contract; physical Media cleanup has separate real-storage tests.
  await deletions.execute((r) =>
    r.complete({
      schemaVersion: 1,
      id: ids.newUuid(),
      operationId: mediaDeletion.id,
      producer: 'media',
      type: 'media.delete.completed.v1',
      assetIds: [video],
    }),
  );
  assert.equal(await db.mediaAssetRefs.findUnique({ where: { id: video } }), null);
  const retained = await management.detail(p.id, actor);
  await management.publication(
    p.id,
    retained.version,
    { active: true, featured: false, sortOrder: '0', featuredOrder: '0' },
    actor,
  );
  assert.equal((await read.public(p.id, 'ckb')).id, p.id);
  const impact = await new GetProductDeletionImpact(deletions).execute(p.id, actor);
  const operation = await new DeleteProduct(deletions, ids).execute(
    p.id,
    {
      confirmed: true,
      expectedVersion: impact.expectedVersion,
      impactRevision: impact.impactRevision,
    },
    actor,
  );
  assert.equal(operation.status, 'MEDIA_CLEANUP');
  await assert.rejects(() => management.detail(p.id, actor), isCode('NOT_FOUND'));
  await assert.rejects(() => read.public(p.id, 'ar'), isCode('NOT_FOUND'));
  assert.equal(
    (await db.products.findUniqueOrThrow({ where: { id: p.id } })).deletion_pending,
    true,
  );
  await deletions.execute((r) =>
    r.complete({
      schemaVersion: 1,
      id: ids.newUuid(),
      operationId: operation.id,
      producer: 'media',
      type: 'media.delete.completed.v1',
      assetIds: [p.coverAssetId],
    }),
  );
  assert.equal(await db.products.findUnique({ where: { id: p.id } }), null);
  assert.equal(await db.productTranslations.count({ where: { product_id: p.id } }), 0);
  assert.equal(await db.productCodeReservations.count({ where: { product_id: p.id } }), 0);
  assert.ok(await db.categories.findUnique({ where: { id: t.id } }));
});
function changes() {
  return new ChangeCatalogSchema(uow, ids, clock);
}

test('public collection searches and filters exact public values with bounded HTTP pagination and privacy', async () => {
  const t = await classification(),
    number = await attribute('NUMBER'),
    boolean = await attribute('BOOLEAN'),
    secret = await attribute('TEXT', false);
  await assign(t.id, number.id, true);
  await assign(t.id, boolean.id);
  await assign(t.id, secret.id, false, false);
  const first = await product(t.id, [
    { definitionId: number.id, value: { kind: 'NUMBER', number: '0.000001' } },
    { definitionId: boolean.id, value: { kind: 'BOOLEAN', boolean: false } },
    {
      definitionId: secret.id,
      value: {
        kind: 'TEXT',
        translations: [{ locale: 'ar', text: 'UnsearchablePrivateEvidence' }],
      },
    },
  ]);
  const second = await product(t.id, [
    { definitionId: number.id, value: { kind: 'NUMBER', number: '99999999999999.999999' } },
  ]);
  const read = new ReadProducts(uow);
  const input = publicProductQuery({ locale: 'en', category: t.id, pageSize: '1' });
  const page = await read.collection(input);
  assert.equal(page.items.length, 1);
  assert.equal(page.hasNextPage, true);
  const next = await read.collection({ ...input, page: 2 });
  assert.equal(next.items.length, 1);
  assert.equal(next.hasNextPage, false);
  assert.notEqual(page.items[0]!.id, next.items[0]!.id);
  assert.equal(
    page.filters.some((f) => f.id === secret.id),
    false,
  );
  const exact = await read.collection({
    ...input,
    pageSize: 12,
    filters: [
      { definitionId: number.id, kind: 'NUMBER', minimum: '0.000001', maximum: '0.000001' },
      { definitionId: boolean.id, kind: 'BOOLEAN', value: false },
    ],
  });
  assert.deepEqual(
    exact.items.map((p) => p.id),
    [first.id],
  );
  assert.equal(
    exact.items[0]!.attributes.some((a) => a.definitionId === secret.id),
    false,
  );
  assert.equal(exact.items[0]!.media[0]!.assetId, first.coverAssetId);
  assert.ok(exact.items[0]!.categoryName);
  assert.equal('productTypeId' in exact.items[0]!, false);
  assert.equal(
    (await read.collection({ ...input, search: 'UnsearchablePrivateEvidence' })).items.length,
    0,
  );
  assert.equal(
    (await read.collection({ ...input, search: first.modelCode! })).items[0]!.id,
    first.id,
  );
  await assert.rejects(
    read.collection({
      ...input,
      filters: [{ definitionId: secret.id, kind: 'TEXT', value: 'Evidence' }],
    }),
    isCode('VALIDATION_FAILED'),
  );
  const management = new ManageProducts(new PrismaProductManagementUnitOfWork(db), ids, clock);
  await management.publication(
    second.id,
    second.version,
    { active: false, featured: false, sortOrder: '0', featuredOrder: '0' },
    actor,
  );
  assert.equal((await read.collection(input)).items.length, 1);
  await new PrismaMediaRegistry(db, 300).apply({
    schemaVersion: 1,
    id: ids.newUuid(),
    producer: 'media',
    type: 'media.asset.security.v1',
    assetId: first.coverAssetId,
    kind: 'IMAGE',
    sourceVersion: version('2'),
    blocked: true,
  });
  await assert.rejects(read.public(first.id, 'en'), isCode('NOT_FOUND'));
  assert.equal((await read.collection(input)).items.length, 0);
  const config = { ...httpConfig('catalog'), port: 0 };
  const catalog = await catalogApplication(config, new pg.Pool(fixture.pool.options));
  await catalog.listen(0, '127.0.0.1');
  const gateway = await gatewayApplication(
    { ...httpConfig('gateway'), port: 0 },
    {
      catalog: await catalog.getUrl(),
      identity: 'http://127.0.0.1:1',
      media: 'http://127.0.0.1:1',
      inquiries: 'http://127.0.0.1:1',
    },
  );
  await gateway.listen(0, '127.0.0.1');
  try {
    const origin = await gateway.getUrl();
    const response = await fetch(origin + '/api/v1/products?category=' + t.id + '&locale=en');
    assert.equal(response.status, 200);
    assert.deepEqual(((await response.json()) as { items: unknown[] }).items, []);
    for (const query of [
      'page=0',
      'pageSize=101',
      'sort=sql',
      'filters=%7B%7D',
      'unknown=1',
      'search=%20',
    ])
      assert.equal((await fetch(origin + '/api/v1/products?' + query)).status, 400, query);
  } finally {
    await gateway.close();
    await catalog.close();
  }
});
async function classification() {
  return new CreateCategory(uow, ids, clock).execute(
    {
      parentId: null,
      expectedParentVersion: null,
      translations: translations.map((t) => ({ ...t, slug: null })),
    },
    actor,
  );
}
async function attribute(kind: AttributeKind = 'NUMBER', visible = true) {
  const d = await new CreateAttributeDefinition(uow, ids, clock).execute(
    {
      code: 'attribute-' + randomUUID(),
      translations,
      kind,
      unitCode: null,
      minimum: null,
      maximum: null,
      allowMultiple: false,
      public: visible,
      filterable: visible,
      textMultiline: false,
      textMaxLength: 4000,
    },
    actor,
  );
  assert.ok(d);
  return d;
}

const relationships = () => new ManageCatalogRelationships(uow, ids, clock);
async function links(
  target: import('../src/application/ports/catalog-relationships.js').RelationshipTarget,
  orderedIds: readonly Uuid[],
) {
  const current = await relationships().read(target, actor);
  const impact = await relationships().preview(target, orderedIds, current.version, actor);
  assert.deepEqual(impact.blockers, []);
  return relationships().commit(
    target,
    orderedIds,
    current.version,
    impact.precondition,
    true,
    actor,
  );
}
async function assign(categoryId: Uuid, definitionId: Uuid, required = false, visible = true) {
  const g = await new CreateAttributeGroup(uow, ids, clock).execute(
    { code: 'group-' + randomUUID(), translations, attributeIds: [definitionId] },
    actor,
  );
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`UPDATE catalog.attribute_group_attributes SET is_required=${required},is_public=${visible},is_searchable=${visible},is_filterable=${visible},is_comparable=${visible} WHERE group_id=${g.id}::uuid AND definition_id=${definitionId}::uuid AND deleted_at IS NULL`;
    },
    { isolationLevel: 'Serializable' },
  );
  const current = await relationships().read({ resource: 'categories', id: categoryId }, actor);
  await links({ resource: 'categories', id: categoryId }, [...current.orderedIds, g.id]);
  return g;
}
async function product(
  categoryId: Uuid,
  valueItems: readonly { definitionId: Uuid; value: AttributeValue }[] = [],
): Promise<ProductDto & { coverAssetId: Uuid }> {
  const assetId = ids.newUuid();
  await db.$transaction(
    (tx) =>
      tx.mediaAssetRefs.create({
        data: { id: assetId, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
      }),
    { isolationLevel: 'Serializable' },
  );
  const draft = await new CreateProduct(uow, ids, clock).execute(
    { categoryId, modelCode: 'SYNTHETIC-' + randomUUID(), translations },
    actor,
  );
  const saved = await new EditProduct(uow, ids, clock).execute(
    draft.id,
    {
      expectedVersion: draft.version,
      expectedSchemaRevision: draft.schemaRevision,
      coverAssetId: assetId,
      values: valueItems,
    },
    actor,
  );
  const published = await new ManageProducts(
    new PrismaProductManagementUnitOfWork(db),
    ids,
    clock,
  ).publication(
    saved.id,
    saved.version,
    { active: true, featured: false, sortOrder: '0', featuredOrder: '0' },
    actor,
  );
  assert.ok(published.coverAssetId);
  return { ...published, coverAssetId: published.coverAssetId };
}
async function commit(target: ConfigurationTarget, change: ConfigurationChange) {
  const current = await reader().detail(target, actor),
    expected = { expectedVersion: current.version, expectedSchemaRevision: null };
  const preview = await changes().preview(target, change, expected, actor);
  assert.deepEqual(preview.blockers, []);
  return changes().commit(target, change, expected, preview.precondition, true, actor);
}
function pausedSnapshot() {
  let started!: () => void,
    release!: () => void,
    attempts = 0;
  const ready = new Promise<void>((r) => {
      started = r;
    }),
    released = new Promise<void>((r) => {
      release = r;
    });
  const paused: CatalogUnitOfWork = {
    execute: (work) =>
      uow.execute(async (r) => {
        attempts++;
        await r.navigation.revision(null);
        if (attempts === 1) {
          started();
          await released;
        }
        return work(r);
      }),
  };
  return { uow: paused, started: ready, release, attempts: () => attempts };
}

test('category groups and group attributes are reusable, ordered and deduplicated without duplicate stored values', async () => {
  const c = await classification(),
    other = await classification(),
    d = await attribute();
  const g1 = await new CreateAttributeGroup(uow, ids, clock).execute(
    { code: 'reuse-' + randomUUID(), translations, attributeIds: [d.id] },
    actor,
  );
  const g2 = await new CreateAttributeGroup(uow, ids, clock).execute(
    { code: 'reuse-' + randomUUID(), translations, attributeIds: [d.id] },
    actor,
  );
  await links({ resource: 'categories', id: c.id }, [g2.id, g1.id]);
  await links({ resource: 'categories', id: other.id }, [g1.id]);
  const s = await uow.execute((r) => r.categorySchemas.schema(c.id));
  assert.equal(s.attributes.length, 1);
  assert.equal(s.attributes[0]?.groupPlacementId, s.groups[0]?.id);
  const p = await product(c.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '0' } }]);
  assert.equal(
    await db.productSpecificationValues.count({
      where: { product_id: p.id, definition_id: d.id, deleted_at: null },
    }),
    1,
  );
  const before = p.values;
  await links({ resource: 'categories', id: c.id }, [g1.id]);
  assert.deepEqual((await new ReadProducts(uow).admin(p.id, actor)).values, before);
});

test('membership writes from either direction edit the same join and preserve values on detachment', async () => {
  const c = await classification(),
    d = await attribute(),
    g = await assign(c.id, d.id);
  const p = await product(c.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '12' } }]);
  await new ManageProducts(new PrismaProductManagementUnitOfWork(db), ids, clock).publication(
    p.id,
    p.version,
    { active: false, featured: false, sortOrder: '0', featuredOrder: '0' },
    actor,
  );
  await links({ resource: 'definitions', id: d.id }, []);
  assert.deepEqual(
    (await relationships().read({ resource: 'groups', id: g.id }, actor)).orderedIds,
    [],
  );
  assert.equal((await new ReadProducts(uow).admin(p.id, actor)).values.length, 1);
  await links({ resource: 'definitions', id: d.id }, [g.id]);
  assert.deepEqual(
    (await relationships().read({ resource: 'groups', id: g.id }, actor)).orderedIds,
    [d.id],
  );
  const [count] = await db.$queryRaw<
    { count: string }[]
  >`SELECT count(*)::text FROM catalog.attribute_group_attributes WHERE group_id=${g.id}::uuid AND definition_id=${d.id}::uuid AND deleted_at IS NULL`;
  assert.equal(count?.count, '1');
});

test('published-value removal is blocked; shared reachability is retained when one group is removed', async () => {
  const c = await classification(),
    d = await attribute(),
    g = await assign(c.id, d.id);
  await product(c.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '1' } }]);
  const state = await relationships().read({ resource: 'categories', id: c.id }, actor);
  const impact = await relationships().preview(
    { resource: 'categories', id: c.id },
    [],
    state.version,
    actor,
  );
  assert.equal(impact.invalidProductCount, '1');
  assert.deepEqual(impact.removedAttributeIds, [d.id]);
  assert.ok(impact.blockers.length);
  await assert.rejects(
    relationships().commit(
      { resource: 'categories', id: c.id },
      [],
      state.version,
      impact.precondition,
      true,
      actor,
    ),
    isCode('INVALID_STATE'),
  );
  const shared = await new CreateAttributeGroup(uow, ids, clock).execute(
    { code: 'shared-' + randomUUID(), translations, attributeIds: [d.id] },
    actor,
  );
  await links({ resource: 'categories', id: c.id }, [g.id, shared.id]);
  await links({ resource: 'categories', id: c.id }, [shared.id]);
  assert.equal((await uow.execute((r) => r.categorySchemas.schema(c.id))).attributes.length, 1);
});

test('schema revision and impact tokens reject intervening membership, product and translation changes', async () => {
  const c = await classification(),
    d = await attribute(),
    g = await assign(c.id, d.id);
  const target = { resource: 'groups' as const, id: g.id };
  const current = await relationships().read(target, actor);
  const impact = await relationships().preview(target, [], current.version, actor);
  await product(c.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '2' } }]);
  await assert.rejects(
    relationships().commit(target, [], current.version, impact.precondition, true, actor),
    isCode('VERSION_CONFLICT'),
  );
  const p = await new ReadProducts(uow).collection(
    publicProductQuery({ locale: 'ar', category: c.id }),
  );
  assert.equal(p.items.length, 1);
  const saved = await new ReadProducts(uow).admin(p.items[0]!.id, actor);
  await commit({ resource: 'definitions', id: d.id }, { kind: 'definition.deprecate' });
  await assert.rejects(
    new EditProduct(uow, ids, clock).execute(
      saved.id,
      { expectedVersion: saved.version, expectedSchemaRevision: saved.schemaRevision, values: [] },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
});

test('all four typed values, options and exact canonical units retain precision and privacy', async () => {
  const c = await classification();
  const unit = await new CreateCanonicalUnit(uow, ids, clock).execute(
    {
      code: 'mm-' + randomUUID(),
      symbol: 'mm',
      dimension: 'length',
      translations: labelTranslations,
    },
    actor,
  );
  const number = await new CreateAttributeDefinition(uow, ids, clock).execute(
    {
      code: 'num-' + randomUUID(),
      translations,
      kind: 'NUMBER',
      unitCode: unit.code,
      minimum: null,
      maximum: null,
      allowMultiple: false,
      public: true,
      filterable: true,
      textMultiline: false,
      textMaxLength: 4000,
    },
    actor,
  );
  const bool = await attribute('BOOLEAN'),
    text = await attribute('TEXT', false),
    choice = await attribute('CHOICE');
  const option = await new CreateAttributeOption(uow, ids, clock).execute(
    choice.id,
    {
      code: 'option-' + randomUUID(),
      sortOrder: '9007199254740993',
      translations: labelTranslations,
    },
    actor,
  );
  assert.ok(option);
  for (const d of [number, bool, text, choice]) await assign(c.id, d.id);
  const p = await product(c.id, [
    { definitionId: number.id, value: { kind: 'NUMBER', number: '99999999999999.999999' } },
    { definitionId: bool.id, value: { kind: 'BOOLEAN', boolean: false } },
    {
      definitionId: text.id,
      value: { kind: 'TEXT', translations: [{ locale: 'ar', text: 'Secret' }] },
    },
    { definitionId: choice.id, value: { kind: 'CHOICE', optionIds: [option.id] } },
  ]);
  const published = await new ReadProducts(uow).public(p.id, 'en');
  assert.equal(published.attributes.length, 3);
  assert.equal(published.attributes.find((a) => a.definitionId === number.id)?.unitSymbol, 'mm');
  assert.deepEqual(published.attributes.find((a) => a.definitionId === bool.id)?.value, {
    kind: 'BOOLEAN',
    boolean: false,
  });
  assert.equal(p.values.find((a) => a.definitionId === number.id)?.value.kind, 'NUMBER');
});

test('tightened bounds and semantic unit/type changes cannot corrupt retained engineering values', async () => {
  const c = await classification(),
    d = await attribute();
  await assign(c.id, d.id);
  await product(c.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '12' } }]);
  const draft = (definition: AttributeDefinitionDto) => ({
    code: definition.code,
    kind: definition.kind,
    translations: definition.translations,
    unitCode: definition.unit?.code ?? null,
    minimum: definition.minimum,
    maximum: definition.maximum,
    allowMultiple: definition.allowMultiple,
    public: definition.public,
    filterable: definition.filterable,
    textMultiline: definition.textMultiline,
    textMaxLength: definition.textMaxLength,
  });
  const target = { resource: 'definitions' as const, id: d.id },
    current = await reader().detail(target, actor);
  const expected = { expectedVersion: current.version, expectedSchemaRevision: null };
  const change = { kind: 'definition.update' as const, definition: { ...draft(d), maximum: '11' } };
  assert.ok((await changes().preview(target, change, expected, actor)).blockers.length);
  const typeChange = {
    kind: 'definition.update' as const,
    definition: { ...draft(d), kind: 'BOOLEAN' as const },
  };
  assert.ok(
    (await changes().preview(target, typeChange, expected, actor)).blockers.some((b) =>
      b.includes('semantic'),
    ),
  );
});

test('option deprecation retains unchanged selection and rejects new or repeated selection', async () => {
  const c = await classification(),
    d = await attribute('CHOICE');
  const option = await new CreateAttributeOption(uow, ids, clock).execute(
    d.id,
    { code: 'option-' + randomUUID(), sortOrder: '1024', translations: labelTranslations },
    actor,
  );
  assert.ok(option);
  await assign(c.id, d.id);
  const p = await product(c.id, [
    { definitionId: d.id, value: { kind: 'CHOICE', optionIds: [option.id] } },
  ]);
  await commit({ resource: 'options', id: option.id }, { kind: 'option.deprecate' });
  const latest = await new ReadProducts(uow).admin(p.id, actor);
  const unchanged = await new EditProduct(uow, ids, clock).execute(
    p.id,
    { expectedVersion: latest.version, expectedSchemaRevision: latest.schemaRevision, values: [] },
    actor,
  );
  assert.deepEqual(unchanged.values, latest.values);
  await assert.rejects(
    product(c.id, [{ definitionId: d.id, value: { kind: 'CHOICE', optionIds: [option.id] } }]),
    isCode('INVALID_STATE'),
  );
});

test('category branch deletion retains reusable groups/attributes and rejects stale schema previews', async () => {
  const c = await classification(),
    d = await attribute(),
    g = await assign(c.id, d.id);
  const preview = await new PreviewCategoryDeletion(uow).execute(c.id, actor);
  await links({ resource: 'groups', id: g.id }, []);
  await assert.rejects(
    new DeleteCategoryBranch(uow, ids, clock).execute(
      c.id,
      {
        expectedVersion: preview.category.version,
        previewPrecondition: preview.previewPrecondition,
        confirm: true,
      },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
  const fresh = await new PreviewCategoryDeletion(uow).execute(c.id, actor);
  await new DeleteCategoryBranch(uow, ids, clock).execute(
    c.id,
    {
      expectedVersion: fresh.category.version,
      previewPrecondition: fresh.previewPrecondition,
      confirm: true,
    },
    actor,
  );
  assert.ok(await reader().detail({ resource: 'groups', id: g.id }, actor));
  assert.ok(await reader().detail({ resource: 'definitions', id: d.id }, actor));
});

test('shared schema conflicts preserve exact product values during a concurrent save', async () => {
  const c = await classification(),
    d = await attribute();
  await assign(c.id, d.id);
  const p = await product(c.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '3' } }]);
  const paused = pausedSnapshot();
  const saving = new EditProduct(paused.uow, ids, clock).execute(
    p.id,
    {
      expectedVersion: p.version,
      expectedSchemaRevision: p.schemaRevision,
      values: [{ definitionId: d.id, value: { kind: 'NUMBER', number: '4' } }],
    },
    actor,
  );
  await paused.started;
  await commit({ resource: 'definitions', id: d.id }, { kind: 'definition.deprecate' });
  paused.release();
  await assert.rejects(saving, isCode('VERSION_CONFLICT'));
  assert.deepEqual((await new ReadProducts(uow).admin(p.id, actor)).values, p.values);
});

test('representative category schema measures deduplicated reads without production throughput claims', async () => {
  const start = performance.now(),
    c = await classification(),
    d = await attribute();
  for (let i = 0; i < 5; i++) await assign(c.id, d.id);
  const schema = await uow.execute((r) => r.categorySchemas.schema(c.id));
  assert.equal(schema.groups.length, 5);
  assert.equal(schema.attributes.length, 1);
  fs.writeFileSync(
    '.local/category-schema-performance.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        milliseconds: performance.now() - start,
        groups: 5,
        uniqueAttributes: 1,
        productionBenchmark: false,
      },
      null,
      2,
    ) + '\n',
  );
});

test('reviewed category moves retain values, reject stale impact and resolve the target schema', async () => {
  const source = await classification(),
    target = await classification();
  const shared = await attribute(),
    removed = await attribute(),
    added = await attribute();
  await assign(source.id, shared.id);
  await assign(source.id, removed.id);
  await assign(target.id, shared.id);
  await assign(target.id, added.id);
  const p = await product(source.id, [
    { definitionId: shared.id, value: { kind: 'NUMBER', number: '1.000001' } },
    { definitionId: removed.id, value: { kind: 'NUMBER', number: '2' } },
  ]);
  const moving = new MoveProduct(uow, ids, clock);
  const input = async () => {
    const product = await new ReadProducts(uow).admin(p.id, actor);
    const category = await uow.execute((r) => r.categorySchemas.schema(target.id));
    return {
      categoryId: target.id,
      expectedVersion: product.version,
      expectedSchemaRevision: product.schemaRevision,
      expectedCategoryVersion: category.categoryVersion,
    };
  };
  assert.equal((await moving.preview(p.id, await input(), actor)).blockers.length, 1);
  await new ManageProducts(new PrismaProductManagementUnitOfWork(db), ids, clock).publication(
    p.id,
    p.version,
    { active: false, featured: false, sortOrder: '0', featuredOrder: '0' },
    actor,
  );
  const captured = await input(),
    impact = await moving.preview(p.id, captured, actor);
  assert.deepEqual(impact.sharedAttributeIds, [shared.id]);
  assert.deepEqual(impact.addedAttributeIds, [added.id]);
  assert.deepEqual(impact.removedAttributeIds, [removed.id]);
  assert.equal(impact.nonApplicableValueCount, '1');
  const changed = await new EditProduct(uow, ids, clock).execute(
    p.id,
    {
      expectedVersion: captured.expectedVersion,
      expectedSchemaRevision: captured.expectedSchemaRevision,
      values: [],
      modelCode: 'changed',
    },
    actor,
  );
  await assert.rejects(
    moving.execute(p.id, { ...captured, precondition: impact.precondition, confirm: true }, actor),
    isCode('VERSION_CONFLICT'),
  );
  const latest = await input(),
    review = await moving.preview(p.id, latest, actor);
  const moved = await moving.execute(
    p.id,
    { ...latest, precondition: review.precondition, confirm: true },
    actor,
  );
  assert.equal(moved.categoryId, target.id);
  assert.deepEqual(moved.values, changed.values);
  const schema = await reader().productSchema(p.id, 'ar', actor);
  assert.deepEqual(
    new Set(schema.form.fields.map((f) => f.definitionId)),
    new Set([shared.id, added.id]),
  );
  const saved = await new EditProduct(uow, ids, clock).execute(
    p.id,
    {
      expectedVersion: moved.version,
      expectedSchemaRevision: moved.schemaRevision,
      values: [{ definitionId: added.id, value: { kind: 'NUMBER', number: '3' } }],
    },
    actor,
  );
  assert.equal(saved.values.length, 3);
});
