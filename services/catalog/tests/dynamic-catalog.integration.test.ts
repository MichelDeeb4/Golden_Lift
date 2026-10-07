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
  CreateProductType,
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
import { PrismaMediaRegistry } from '../src/infrastructure/prisma/media-registry.js';
import { publicProductQuery } from '../src/presentation/http/public-product-query.js';
import { ReadCatalogConfiguration } from '../src/application/use-cases/read-catalog-configuration.js';
import { ChangeProductType } from '../src/application/use-cases/change-product-type.js';
import { CreateCategory } from '../src/application/use-cases/create-category.js';
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
  fixture = await databaseFixture('catalog');
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
  const t = await type(),
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
        productTypeId: t.id,
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
test('Admin management preserves versions, publication privacy, ordered media and retained tombstones', async () => {
  const t = await type(),
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
  const detached = await management.media(
    p.id,
    updated.version,
    p.coverAssetId,
    updated.media.filter((m) => m.assetId !== video),
    actor,
  );
  assert.equal(
    await db.productMedia.count({
      where: { product_id: p.id, asset_id: video, deleted_at: { not: null } },
    }),
    1,
  );
  assert.equal(
    (await db.mediaAssetRefs.findUniqueOrThrow({ where: { id: video } })).deleted_at,
    null,
  );
  await assert.rejects(
    () => management.remove(p.id, detached.version, false, actor),
    isCode('VALIDATION_FAILED'),
  );
  const published = await management.publication(
    p.id,
    detached.version,
    { active: true, featured: false, sortOrder: '0', featuredOrder: '0' },
    actor,
  );
  assert.equal((await read.public(p.id, 'ckb')).id, p.id);
  await management.remove(p.id, published.version, true, actor);
  await assert.rejects(() => management.detail(p.id, actor), isCode('NOT_FOUND'));
  await assert.rejects(() => read.public(p.id, 'ar'), isCode('NOT_FOUND'));
  const tombstone = await db.products.findUniqueOrThrow({ where: { id: p.id } });
  assert.ok(tombstone.deleted_at);
  assert.equal(tombstone.is_active, false);
  const deletedEvents = await db.outboxEvents.findMany({
    where: { aggregate_id: p.id, event_type: 'catalog.product.deleted.v1' },
  });
  assert.equal(deletedEvents.length, 1);
  assert.equal(
    (deletedEvents[0]!.payload as { aggregate?: { version?: unknown } }).aggregate?.version,
    tombstone.version.toString(),
  );
});
function changes() {
  return new ChangeCatalogSchema(uow, ids, clock);
}

test('public collection searches and filters exact public values with bounded HTTP pagination and privacy', async () => {
  const t = await type(),
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
  const input = publicProductQuery({ locale: 'en', productType: t.id, pageSize: '1' });
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
    const response = await fetch(origin + '/api/v1/products?productType=' + t.id + '&locale=en');
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
async function type() {
  const t = await new CreateProductType().execute(
    { code: 'type-' + randomUUID(), translations },
    actor,
  );
  assert.ok(t);
  return t;
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
async function commit(target: ConfigurationTarget, change: ConfigurationChange) {
  const current = await reader().detail(target, actor),
    expected = {
      expectedVersion: current.version,
      expectedSchemaRevision:
        'schemaRevision' in current ? version(String(current.schemaRevision)) : null,
    },
    preview = await changes().preview(target, change, expected, actor);
  assert.deepEqual(preview.blockers, []);
  return changes().commit(target, change, expected, preview.precondition, true, actor);
}
async function assign(typeId: Uuid, definitionId: Uuid, required = false, visible = true) {
  await commit(
    { resource: 'types', id: typeId },
    {
      kind: 'assignment.put',
      assignmentId: null,
      assignment: {
        definitionId,
        groupPlacementId: null,
        sortOrder: '1024',
        required,
        public: visible,
        searchable: visible,
        filterable: visible,
        comparable: visible,
      },
    },
  );
}
async function product(
  typeId: Uuid,
  valueItems: readonly { definitionId: Uuid; value: AttributeValue }[] = [],
): Promise<ProductDto & { coverAssetId: Uuid }> {
  const c = await new CreateCategory(uow, ids, clock).execute(
      {
        parentId: null,
        expectedParentVersion: null,
        translations: [{ ...translations[0]!, slug: null }],
      },
      actor,
    ),
    assetId = ids.newUuid();
  await db.$transaction(
    (tx) =>
      tx.mediaAssetRefs.create({
        data: { id: assetId, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
      }),
    { isolationLevel: 'Serializable' },
  );
  const schema = await reader().schema(typeId, 'ar', actor),
    draft = await new CreateProduct(uow, ids, clock).execute(
      {
        categoryId: c.id,
        modelCode: 'SYNTHETIC-' + randomUUID(),
        translations,
      },
      actor,
    );
  const p = await new EditProduct(uow, ids, clock).execute(
    draft.id,
    {
      expectedVersion: draft.version,
      expectedSchemaRevision: draft.schemaRevision,
      coverAssetId: assetId,
      values: valueItems,
    },
    actor,
  );
  assert.ok(p.coverAssetId);
  assert.ok(schema);
  return { ...p, coverAssetId: p.coverAssetId };
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
test('configuration creates a dynamic form with translated groups and all four storage kinds', async () => {
  const t = await type(),
    unit = await new CreateCanonicalUnit(uow, ids, clock).execute(
      {
        code: 'unit-' + randomUUID(),
        symbol: 'mm',
        dimension: 'length',
        translations: labelTranslations,
      },
      actor,
    ),
    group = await new CreateAttributeGroup(uow, ids, clock).execute(
      { code: 'group-' + randomUUID(), translations },
      actor,
    );
  assert.ok(unit && group);
  await commit(
    { resource: 'types', id: t.id },
    { kind: 'group.place', placementId: null, groupId: group.id, sortOrder: '9007199254740993' },
  );
  for (const kind of ['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE'] as const) {
    const d = await attribute(kind);
    await assign(t.id, d.id);
  }
  const schema = await reader().schema(t.id, 'ckb', actor);
  assert.equal(schema.form.fields.length, 4);
  assert.equal(schema.form.groups[0]?.sortOrder, '9007199254740993');
  assert.equal(schema.form.fields[0]?.resolvedLabelLocale, 'ar');
  assert.deepEqual(schema.form.fields[0]?.missingTranslationLocales, ['en', 'ckb']);
});
test('product values preserve false/zero and enforce public disclosure at both levels', async () => {
  const t = await type(),
    number = await attribute(),
    boolean = await attribute('BOOLEAN'),
    hidden = await attribute('TEXT', false);
  await assign(t.id, number.id, true);
  await assign(t.id, boolean.id, true);
  await assign(t.id, hidden.id, false, true);
  const p = await product(t.id, [
    { definitionId: number.id, value: { kind: 'NUMBER', number: '0' } },
    { definitionId: boolean.id, value: { kind: 'BOOLEAN', boolean: false } },
    {
      definitionId: hidden.id,
      value: { kind: 'TEXT', translations: [{ locale: 'ar', text: 'private fixture secret' }] },
    },
  ]);
  const publicData = await new ReadProducts(uow).public(p.id, 'en');
  assert.equal(publicData.attributes.length, 2);
  assert.equal(JSON.stringify(publicData).includes('private fixture secret'), false);
  assert.ok(
    publicData.attributes.some((v) => v.value.kind === 'BOOLEAN' && v.value.boolean === false),
  );
  assert.ok(p.values.some((v) => v.definitionId === hidden.id));
});
test('definition changes invalidate editor schemas and tightening bounds is blocked by impact', async () => {
  const t = await type(),
    d = await attribute();
  await assign(t.id, d.id);
  const p = await product(t.id, [
    { definitionId: d.id, value: { kind: 'NUMBER', number: '25.123456' } },
  ]);
  await commit(
    { resource: 'definitions', id: d.id },
    {
      kind: 'definition.update',
      definition: {
        code: d.code,
        translations: [{ ...translations[0]!, name: 'Changed label' }],
        kind: 'NUMBER',
        unitCode: null,
        minimum: null,
        maximum: null,
        allowMultiple: false,
        public: true,
        filterable: true,
        textMultiline: false,
        textMaxLength: 4000,
      },
    },
  );
  await assert.rejects(
    new EditProduct(uow, ids, clock).execute(
      p.id,
      { expectedVersion: p.version, expectedSchemaRevision: p.schemaRevision, values: [] },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
  const current = await reader().detail({ resource: 'definitions', id: d.id }, actor),
    input = {
      kind: 'definition.update' as const,
      definition: {
        code: d.code,
        translations,
        kind: 'NUMBER' as const,
        unitCode: null,
        minimum: null,
        maximum: '10',
        allowMultiple: false,
        public: true,
        filterable: true,
        textMultiline: false,
        textMaxLength: 4000,
      },
    },
    expected = { expectedVersion: current.version, expectedSchemaRevision: null },
    preview = await changes().preview(
      { resource: 'definitions', id: d.id },
      input,
      expected,
      actor,
    );
  assert.equal(preview.invalidProductCount, '1');
  await assert.rejects(
    changes().commit(
      { resource: 'definitions', id: d.id },
      input,
      expected,
      preview.precondition,
      true,
      actor,
    ),
    isCode('INVALID_STATE'),
  );
});
test('requiredness uses staged values and a new product invalidates a saved preview', async () => {
  const t = await type(),
    d = await attribute();
  await assign(t.id, d.id);
  const schema = await reader().schema(t.id, 'ar', actor),
    a = schema.configuration.attributes[0]!;
  const input = {
      kind: 'assignment.put' as const,
      assignmentId: a.id,
      assignment: {
        definitionId: d.id,
        groupPlacementId: null,
        sortOrder: '1024',
        required: true,
        public: true,
        searchable: true,
        filterable: true,
        comparable: true,
      },
    },
    expected = {
      expectedVersion: schema.configuration.type.version,
      expectedSchemaRevision: schema.configuration.type.schemaRevision,
    },
    preview = await changes().preview({ resource: 'types', id: t.id }, input, expected, actor);
  await product(t.id);
  await assert.rejects(
    changes().commit(
      { resource: 'types', id: t.id },
      input,
      expected,
      preview.precondition,
      true,
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
});
test('soft deletion of a branch retains its shared type and attributes and schema edits stale B4 preview', async () => {
  const t = await type(),
    d = await attribute();
  await assign(t.id, d.id);
  const p = await product(t.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '42' } }]),
    preview = await new PreviewCategoryDeletion(uow).execute(p.categoryId, actor);
  await commit(
    { resource: 'types', id: t.id },
    { kind: 'type.metadata', translations: [{ ...translations[0]!, name: 'Revised type' }] },
  );
  await assert.rejects(
    new DeleteCategoryBranch(uow, ids, clock).execute(
      p.categoryId,
      {
        confirm: true,
        expectedVersion: preview.category.version,
        previewPrecondition: preview.previewPrecondition,
      },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
  const fresh = await new PreviewCategoryDeletion(uow).execute(p.categoryId, actor);
  await new DeleteCategoryBranch(uow, ids, clock).execute(
    p.categoryId,
    {
      confirm: true,
      expectedVersion: fresh.category.version,
      previewPrecondition: fresh.previewPrecondition,
    },
    actor,
  );
  assert.equal((await db.productTypes.findUniqueOrThrow({ where: { id: t.id } })).deleted_at, null);
  assert.equal(
    (await db.specificationDefinitions.findUniqueOrThrow({ where: { id: d.id } })).deleted_at,
    null,
  );
  assert.ok((await db.products.findUniqueOrThrow({ where: { id: p.id } })).deleted_at);
  await assert.rejects(new ReadProducts(uow).public(p.id, 'ar'), isCode('NOT_FOUND'));
});
test('configuration copy preserves destination-only fields and creates independent memberships', async () => {
  const source = await type(),
    destination = await type(),
    a = await attribute(),
    b = await attribute('BOOLEAN');
  await assign(source.id, a.id);
  await assign(destination.id, b.id);
  const sourceSchema = await reader().schema(source.id, 'ar', actor);
  await commit(
    { resource: 'types', id: destination.id },
    {
      kind: 'type.copy',
      sourceTypeId: source.id,
      expectedSourceSchemaRevision: sourceSchema.form.schemaRevision,
    },
  );
  const copied = await reader().schema(destination.id, 'ar', actor);
  assert.equal(copied.form.fields.length, 2);
  assert.notEqual(
    copied.configuration.attributes.find((x) => x.definition.id === a.id)?.id,
    sourceSchema.configuration.attributes[0]?.id,
  );
  await commit(
    { resource: 'types', id: source.id },
    { kind: 'assignment.remove', assignmentId: sourceSchema.configuration.attributes[0]!.id },
  );
  assert.equal((await reader().schema(destination.id, 'ar', actor)).form.fields.length, 2);
});
test('copy preview rejects collisions rather than overwriting destination policies', async () => {
  const source = await type(),
    destination = await type(),
    a = await attribute();
  await assign(source.id, a.id, false, true);
  await assign(destination.id, a.id, false, false);
  const src = await reader().schema(source.id, 'ar', actor),
    dst = await reader().schema(destination.id, 'ar', actor),
    change = {
      kind: 'type.copy' as const,
      sourceTypeId: source.id,
      expectedSourceSchemaRevision: src.form.schemaRevision,
    },
    expected = {
      expectedVersion: dst.configuration.type.version,
      expectedSchemaRevision: dst.form.schemaRevision,
    },
    impact = await changes().preview(
      { resource: 'types', id: destination.id },
      change,
      expected,
      actor,
    );
  assert.ok(impact.blockers.some((b) => b.includes('collisions')));
  await assert.rejects(
    changes().commit(
      { resource: 'types', id: destination.id },
      change,
      expected,
      impact.precondition,
      true,
      actor,
    ),
    isCode('INVALID_STATE'),
  );
});
test('retired product type change cannot mutate a product or its retained values', async () => {
  const source = await type(),
    a = await attribute();
  await assign(source.id, a.id);
  const p = await product(source.id, [
    { definitionId: a.id, value: { kind: 'NUMBER', number: '12' } },
  ]);
  const types = new ChangeProductType(uow, ids, clock);
  const input = {
    productTypeId: ids.newUuid(),
    expectedVersion: p.version,
    expectedSchemaRevision: p.schemaRevision,
    expectedDestinationSchemaRevision: version('1'),
    values: [],
  };
  await assert.rejects(types.preview(p.id, input, actor), isCode('INVALID_STATE'));
  await assert.rejects(types.commit(p.id, input, 'retired', true, actor), isCode('INVALID_STATE'));
  const current = await new ReadProducts(uow).admin(p.id, actor);
  assert.equal(current.coverAssetId, p.coverAssetId);
  assert.equal(current.modelCode, p.modelCode);
  assert.deepEqual(current.values, p.values);
  assert.equal(current.version, p.version);
});
test('option deprecation preserves unchanged selections and prohibits new use or reselection', async () => {
  const t = await type(),
    d = await attribute('CHOICE'),
    option = await new CreateAttributeOption(uow, ids, clock).execute(
      d.id,
      { code: 'synthetic-option', sortOrder: '1024', translations: labelTranslations },
      actor,
    );
  assert.ok(option);
  await assign(t.id, d.id);
  const p = await product(t.id, [
    { definitionId: d.id, value: { kind: 'CHOICE', optionIds: [option.id] } },
  ]);
  await commit({ resource: 'options', id: option.id }, { kind: 'option.deprecate' });
  const current = await new ReadProducts(uow).admin(p.id, actor),
    edit = new EditProduct(uow, ids, clock),
    retained = await edit.execute(
      p.id,
      {
        expectedVersion: current.version,
        expectedSchemaRevision: current.schemaRevision,
        translations,
        values: [],
      },
      actor,
    );
  assert.equal(retained.values.length, 1);
  await assert.rejects(
    product(t.id, [{ definitionId: d.id, value: { kind: 'CHOICE', optionIds: [option.id] } }]),
    isCode('INVALID_STATE'),
  );
  const removed = await edit.execute(
    p.id,
    {
      expectedVersion: retained.version,
      expectedSchemaRevision: retained.schemaRevision,
      values: [{ definitionId: d.id, value: null }],
    },
    actor,
  );
  await assert.rejects(
    edit.execute(
      p.id,
      {
        expectedVersion: removed.version,
        expectedSchemaRevision: removed.schemaRevision,
        values: [{ definitionId: d.id, value: { kind: 'CHOICE', optionIds: [option.id] } }],
      },
      actor,
    ),
    isCode('INVALID_STATE'),
  );
});
test('staged population permits requiredness while assignment removal with active values is blocked', async () => {
  const t = await type(),
    d = await attribute();
  await assign(t.id, d.id);
  const p = await product(t.id),
    s = await reader().schema(t.id, 'ar', actor),
    a = s.configuration.attributes[0]!,
    change = {
      kind: 'assignment.put' as const,
      assignmentId: a.id,
      assignment: {
        definitionId: d.id,
        groupPlacementId: null,
        sortOrder: '1024',
        required: true,
        public: true,
        searchable: true,
        filterable: true,
        comparable: true,
      },
    },
    expected = {
      expectedVersion: s.configuration.type.version,
      expectedSchemaRevision: s.form.schemaRevision,
    };
  assert.equal(
    (await changes().preview({ resource: 'types', id: t.id }, change, expected, actor))
      .invalidProductCount,
    '1',
  );
  await new EditProduct(uow, ids, clock).execute(
    p.id,
    {
      expectedVersion: p.version,
      expectedSchemaRevision: p.schemaRevision,
      values: [{ definitionId: d.id, value: { kind: 'NUMBER', number: '20' } }],
    },
    actor,
  );
  await commit({ resource: 'types', id: t.id }, change);
  const now = await reader().schema(t.id, 'ar', actor),
    impact = await changes().preview(
      { resource: 'types', id: t.id },
      { kind: 'assignment.remove', assignmentId: a.id },
      {
        expectedVersion: now.configuration.type.version,
        expectedSchemaRevision: now.form.schemaRevision,
      },
      actor,
    );
  assert.equal(impact.invalidProductCount, '1');
});
test('retained values prevent semantic changes and new configuration obeys lifecycle/runtime restrictions', async () => {
  const t = await type(),
    d = await attribute();
  await assign(t.id, d.id);
  const p = await product(t.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '3' } }]),
    deletion = await new PreviewCategoryDeletion(uow).execute(p.categoryId, actor);
  await new DeleteCategoryBranch(uow, ids, clock).execute(
    p.categoryId,
    {
      confirm: true,
      expectedVersion: deletion.category.version,
      previewPrecondition: deletion.previewPrecondition,
    },
    actor,
  );
  const current = await reader().detail({ resource: 'definitions', id: d.id }, actor),
    impact = await changes().preview(
      { resource: 'definitions', id: d.id },
      {
        kind: 'definition.update',
        definition: {
          code: d.code,
          translations,
          kind: 'BOOLEAN',
          unitCode: null,
          minimum: null,
          maximum: null,
          allowMultiple: false,
          public: true,
          filterable: true,
          textMultiline: false,
          textMaxLength: 4000,
        },
      },
      { expectedVersion: current.version, expectedSchemaRevision: null },
      actor,
    );
  assert.ok(impact.blockers.some((b) => b.includes('Retained')));
  const unused = await type();
  await commit({ resource: 'types', id: unused.id }, { kind: 'type.delete' });
  assert.ok((await db.productTypes.findUniqueOrThrow({ where: { id: unused.id } })).deleted_at);
  await assert.rejects(
    db.$transaction(
      (tx) => tx.productTypes.update({ where: { id: unused.id }, data: { deleted_at: null } }),
      { isolationLevel: 'Serializable' },
    ),
  );
  await assert.rejects(db.productTypes.delete({ where: { id: unused.id } }));
  await assert.rejects(db.$executeRaw`TRUNCATE catalog.product_types CASCADE`);
  await assert.rejects(db.$queryRaw`SELECT * FROM catalog.write_gate`);
});
test('deterministic product save versus shared-schema change rejects stale editor state after retry', async () => {
  const t = await type(),
    d = await attribute();
  await assign(t.id, d.id);
  const p = await product(t.id, [{ definitionId: d.id, value: { kind: 'NUMBER', number: '10' } }]),
    paused = pausedSnapshot(),
    pending = new EditProduct(paused.uow, ids, clock).execute(
      p.id,
      {
        expectedVersion: p.version,
        expectedSchemaRevision: p.schemaRevision,
        values: [{ definitionId: d.id, value: { kind: 'NUMBER', number: '12' } }],
      },
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await commit(
      { resource: 'definitions', id: d.id },
      {
        kind: 'definition.update',
        definition: {
          code: d.code,
          translations,
          kind: 'NUMBER',
          unitCode: null,
          minimum: null,
          maximum: '11',
          allowMultiple: false,
          public: true,
          filterable: true,
          textMultiline: false,
          textMaxLength: 4000,
        },
      },
    );
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal(paused.attempts(), 2);
  assert.equal((await new ReadProducts(uow).admin(p.id, actor)).values[0]?.value.kind, 'NUMBER');
});
test('deterministic assignment removal versus value creation rejects a stale impact token', async () => {
  const t = await type(),
    d = await attribute();
  await assign(t.id, d.id);
  const p = await product(t.id),
    s = await reader().schema(t.id, 'ar', actor),
    target = { resource: 'types' as const, id: t.id },
    change = {
      kind: 'assignment.remove' as const,
      assignmentId: s.configuration.attributes[0]!.id,
    },
    expected = {
      expectedVersion: s.configuration.type.version,
      expectedSchemaRevision: s.form.schemaRevision,
    },
    preview = await changes().preview(target, change, expected, actor),
    paused = pausedSnapshot(),
    pending = new ChangeCatalogSchema(paused.uow, ids, clock).commit(
      target,
      change,
      expected,
      preview.precondition,
      true,
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await new EditProduct(uow, ids, clock).execute(
      p.id,
      {
        expectedVersion: p.version,
        expectedSchemaRevision: p.schemaRevision,
        values: [{ definitionId: d.id, value: { kind: 'NUMBER', number: '5' } }],
      },
      actor,
    );
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal(paused.attempts(), 2);
  assert.equal((await reader().schema(t.id, 'ar', actor)).form.fields.length, 1);
});
test('deterministic type deletion versus product creation cannot delete a newly used type', async () => {
  const t = await type(),
    target = { resource: 'types' as const, id: t.id },
    change = { kind: 'type.delete' as const },
    expected = { expectedVersion: t.version, expectedSchemaRevision: t.schemaRevision },
    preview = await changes().preview(target, change, expected, actor),
    paused = pausedSnapshot(),
    pending = new ChangeCatalogSchema(paused.uow, ids, clock).commit(
      target,
      change,
      expected,
      preview.precondition,
      true,
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await product(t.id);
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal(paused.attempts(), 2);
  assert.equal((await db.productTypes.findUniqueOrThrow({ where: { id: t.id } })).deleted_at, null);
});
test('unrelated writer causes whole product transaction retry with exactly one committed event', async () => {
  const t = await type(),
    p = await product(t.id),
    paused = pausedSnapshot(),
    count = await db.outboxEvents.count(),
    pending = new EditProduct(paused.uow, ids, clock).execute(
      p.id,
      {
        expectedVersion: p.version,
        expectedSchemaRevision: p.schemaRevision,
        translations,
        values: [],
      },
      actor,
    );
  await paused.started;
  try {
    await type();
  } finally {
    paused.release();
  }
  await pending;
  assert.equal(paused.attempts(), 2);
  assert.equal(await db.outboxEvents.count(), count + 2);
});
test('deterministic option deprecation versus new selection invalidates the editor after retry', async () => {
  const t = await type(),
    d = await attribute('CHOICE'),
    option = await new CreateAttributeOption(uow, ids, clock).execute(
      d.id,
      { code: 'race-option', sortOrder: '1024', translations: labelTranslations },
      actor,
    );
  assert.ok(option);
  await assign(t.id, d.id);
  const p = await product(t.id),
    paused = pausedSnapshot();
  const pending = new EditProduct(paused.uow, ids, clock).execute(
      p.id,
      {
        expectedVersion: p.version,
        expectedSchemaRevision: p.schemaRevision,
        values: [{ definitionId: d.id, value: { kind: 'CHOICE', optionIds: [option.id] } }],
      },
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await commit({ resource: 'options', id: option.id }, { kind: 'option.deprecate' });
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal(paused.attempts(), 2);
  assert.equal((await new ReadProducts(uow).admin(p.id, actor)).values.length, 0);
});
test('deterministic requiredness preview versus a new missing product cannot commit', async () => {
  const t = await type(),
    d = await attribute();
  await assign(t.id, d.id);
  const s = await reader().schema(t.id, 'ar', actor),
    a = s.configuration.attributes[0]!,
    target = { resource: 'types' as const, id: t.id };
  const change: ConfigurationChange = {
      kind: 'assignment.put',
      assignmentId: a.id,
      assignment: {
        definitionId: d.id,
        groupPlacementId: null,
        sortOrder: a.sortOrder,
        required: true,
        public: true,
        filterable: true,
        searchable: true,
        comparable: true,
      },
    },
    expected = {
      expectedVersion: s.configuration.type.version,
      expectedSchemaRevision: s.form.schemaRevision,
    },
    preview = await changes().preview(target, change, expected, actor),
    paused = pausedSnapshot();
  const pending = new ChangeCatalogSchema(paused.uow, ids, clock).commit(
      target,
      change,
      expected,
      preview.precondition,
      true,
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await product(t.id);
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal(paused.attempts(), 2);
  assert.equal((await reader().schema(t.id, 'ar', actor)).form.fields[0]?.required, false);
});
test('copy retries atomically and group removal preserves attributes with explicit placement/order', async () => {
  const source = await type(),
    destination = await type(),
    d = await attribute(),
    d2 = await attribute(),
    group = await new CreateAttributeGroup(uow, ids, clock).execute(
      { code: 'group-' + randomUUID(), translations },
      actor,
    );
  assert.ok(group);
  await commit(
    { resource: 'types', id: source.id },
    { kind: 'group.place', placementId: null, groupId: group.id, sortOrder: '2048' },
  );
  await assign(source.id, d.id);
  await assign(source.id, d2.id);
  let schema = await reader().schema(source.id, 'ar', actor);
  const a = schema.configuration.attributes[0]!;
  await commit(
    { resource: 'types', id: source.id },
    {
      kind: 'assignment.put',
      assignmentId: a.id,
      assignment: {
        definitionId: a.definition.id,
        groupPlacementId: schema.configuration.groups[0]!.id,
        sortOrder: '1024',
        required: false,
        public: true,
        searchable: true,
        filterable: true,
        comparable: true,
      },
    },
  );
  schema = await reader().schema(source.id, 'ar', actor);
  const target = { resource: 'types' as const, id: destination.id },
    change = {
      kind: 'type.copy' as const,
      sourceTypeId: source.id,
      expectedSourceSchemaRevision: schema.form.schemaRevision,
    },
    expected = {
      expectedVersion: destination.version,
      expectedSchemaRevision: destination.schemaRevision,
    },
    preview = await changes().preview(target, change, expected, actor),
    paused = pausedSnapshot(),
    count = await db.outboxEvents.count();
  const pending = new ChangeCatalogSchema(paused.uow, ids, clock).commit(
    target,
    change,
    expected,
    preview.precondition,
    true,
    actor,
  );
  await paused.started;
  try {
    await type();
  } finally {
    paused.release();
  }
  await pending;
  assert.equal(paused.attempts(), 2);
  assert.equal(await db.outboxEvents.count(), count + 2);
  let copy = await reader().schema(destination.id, 'ar', actor);
  assert.equal(copy.configuration.attributes.length, 2);
  assert.equal(copy.configuration.groups.length, 1);
  const ordered = copy.configuration.attributes.map((x) => x.id).reverse();
  await commit(target, { kind: 'type.order', collection: 'attributes', orderedIds: ordered });
  copy = await reader().schema(destination.id, 'ar', actor);
  assert.deepEqual(
    [...copy.configuration.attributes]
      .sort((a, b) => (BigInt(a.sortOrder) < BigInt(b.sortOrder) ? -1 : 1))
      .map((x) => x.id),
    ordered,
  );
  await commit(target, {
    kind: 'group.remove',
    placementId: copy.configuration.groups[0]!.id,
    moveAssignmentsTo: null,
  });
  copy = await reader().schema(destination.id, 'ar', actor);
  assert.equal(copy.configuration.groups.length, 0);
  assert.ok(copy.configuration.attributes.every((x) => x.groupPlacementId === null));
  assert.deepEqual(
    copy.configuration.attributes.map((x) => x.id),
    ordered,
  );
  assert.equal((await reader().schema(source.id, 'ar', actor)).configuration.groups.length, 1);
});
test('representative fixture measures batched schema resolution, fanout, writes and validation without a production throughput claim', async () => {
  const timings: Record<string, number> = {},
    types = [await type(), await type(), await type()],
    defs: AttributeDefinitionDto[] = [];
  for (let i = 0; i < 40; i++) defs.push(await attribute());
  await db.$transaction(
    async (tx) => {
      await tx.productTypeSpecifications.createMany({
        data: types.flatMap((t) =>
          defs.map((d, i) => ({
            product_type_id: t.id,
            definition_id: d.id,
            sort_order: BigInt(i * 1024),
            is_public: true,
            is_filterable: true,
          })),
        ),
      });
    },
    { isolationLevel: 'Serializable', timeout: 10000 },
  );
  let start = performance.now();
  for (const t of types) await reader().schema(t.id, 'ckb', actor);
  timings['resolveThreeSchemasMs'] = performance.now() - start;
  start = performance.now();
  const products = [];
  for (let i = 0; i < 60; i++)
    products.push(
      await product(types[i % 3]!.id, [
        { definitionId: defs[0]!.id, value: { kind: 'NUMBER', number: '12.123456' } },
      ]),
    );
  timings['sixtyProductWorkflowsMs'] = performance.now() - start;
  const target = { resource: 'definitions' as const, id: defs[0]!.id },
    change = { kind: 'definition.deprecate' as const },
    expected = { expectedVersion: defs[0]!.version, expectedSchemaRevision: null };
  start = performance.now();
  const preview = await changes().preview(target, change, expected, actor);
  timings['sharedDefinitionValidationPreviewMs'] = performance.now() - start;
  assert.equal(preview.affectedProductCount, '60');
  assert.deepEqual(preview.blockers, []);
  start = performance.now();
  await changes().commit(target, change, expected, preview.precondition, true, actor);
  timings['sharedDefinitionFanoutCommitMs'] = performance.now() - start;
  for (const t of types)
    assert.notEqual(
      (await reader().schema(t.id, 'ar', actor)).form.schemaRevision,
      t.schemaRevision,
    );
  const p = await new ReadProducts(uow).admin(products[0]!.id, actor);
  start = performance.now();
  await new EditProduct(uow, ids, clock).execute(
    p.id,
    {
      expectedVersion: p.version,
      expectedSchemaRevision: p.schemaRevision,
      translations,
      values: [],
    },
    actor,
  );
  timings['singleProductEditMs'] = performance.now() - start;
  fs.writeFileSync(
    '.local/dynamic-performance.json',
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        fixture: { types: 3, definitions: 40, assignments: 120, products: 60, values: 60 },
        timings,
        scope:
          'Disposable local PostgreSQL, includes application/transaction overhead; not production throughput. Membership fixture batching uses Prisma; measured product workflows include synthetic category/image provisioning.',
      },
      null,
      2,
    ) + '\n',
  );
});
test('configuration translation replacement retains omitted rows and reports actual missing locales', async () => {
  const t = await new CreateProductType().execute(
    {
      code: 'translated-' + randomUUID(),
      translations: [...translations, { locale: 'en', name: 'Saved English', description: null }],
    },
    actor,
  );
  await commit({ resource: 'types', id: t.id }, { kind: 'type.metadata', translations });
  const current = await reader().detail({ resource: 'types', id: t.id }, actor);
  assert.equal(current.translations.length, 1);
  assert.ok(current.missingTranslationLocales.includes('en'));
  assert.equal(
    await db.productTypeTranslations.count({
      where: { product_type_id: t.id, locale: 'en', deleted_at: { not: null } },
    }),
    1,
  );
});
test('gateway headless contracts create configuration/product forms and reject mass assignment', async () => {
  const pool = await import('pg').then(
      ({ default: pg }) =>
        new pg.Pool({ connectionString: fixture.pool.options.connectionString, max: 5 }),
    ),
    origin = 'http://127.0.0.1:8083';
  const authentication = {
    authenticate: async (input: import('@golden-lift/contracts').StaffRequest) => {
      if (input.sessionToken !== 'fixture-admin')
        throw new ApplicationError('UNAUTHENTICATED', 'Staff authentication required.');
      return actor;
    },
  };
  const catalog = await catalogApplication(
    httpConfig('catalog', { NODE_ENV: 'development', HOST: '127.0.0.1', ALLOWED_ORIGINS: origin }),
    pool,
    authentication,
  );
  await catalog.listen(0, '127.0.0.1');
  const upstream = await catalog.getUrl(),
    gateway = await gatewayApplication(
      httpConfig('gateway', {
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        ALLOWED_ORIGINS: origin,
      }),
      { identity: upstream, catalog: upstream, media: upstream, inquiries: upstream },
    );
  await gateway.listen(0, '127.0.0.1');
  const base = await gateway.getUrl();
  const call = async (method: string, path: string, body?: unknown, staff = true) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        origin,
        'content-type': 'application/json',
        ...(staff ? { cookie: 'gl_staff=fixture-admin' } : {}),
        'x-request-id': 'dynamic-api-fixture',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  try {
    const created = await call('POST', '/api/v1/admin/product-types', {
      code: 'api-' + randomUUID(),
      translations,
    });
    assert.equal(created.status, 201);
    const typeId = uuid(created.body['id']);
    const definition = await call('POST', '/api/v1/admin/attributes', {
      code: 'api-boolean-' + randomUUID(),
      translations,
      kind: 'BOOLEAN',
      unitCode: null,
      minimum: null,
      maximum: null,
      allowMultiple: false,
      public: true,
      filterable: true,
      textMultiline: false,
      textMaxLength: 4000,
    });
    assert.equal(definition.status, 201);
    const definitionId = uuid(definition.body['id']);
    const spec = await call('GET', '/api/v1/admin/product-types/' + typeId + '/schema');
    assert.equal(spec.status, 200);
    const assignment = {
        kind: 'assignment.put',
        assignmentId: null,
        assignment: {
          definitionId,
          groupPlacementId: null,
          sortOrder: '1024',
          required: true,
          public: true,
          searchable: false,
          filterable: false,
          comparable: false,
        },
      },
      expected = {
        expectedVersion: created.body['version'],
        expectedSchemaRevision: created.body['schemaRevision'],
      };
    const preview = await call(
      'POST',
      '/api/v1/admin/product-types/' + typeId + '/changes/preview',
      { change: assignment, ...expected },
    );
    assert.equal(preview.status, 200);
    assert.equal(
      (
        await call('POST', '/api/v1/admin/product-types/' + typeId + '/changes', {
          change: assignment,
          ...expected,
          precondition: preview.body['precondition'],
          confirm: true,
        })
      ).status,
      200,
    );
    const current = await reader().schema(typeId, 'ar', actor),
      category = await new CreateCategory(uow, ids, clock).execute(
        {
          parentId: null,
          expectedParentVersion: null,
          translations: [{ ...translations[0]!, slug: null }],
        },
        actor,
      ),
      asset = ids.newUuid();
    await db.$transaction(
      (tx) =>
        tx.mediaAssetRefs.create({
          data: { id: asset, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
        }),
      { isolationLevel: 'Serializable' },
    );
    const p = await call('POST', '/api/v1/admin/products', {
      categoryId: category.id,
      productTypeId: typeId,
      coverAssetId: asset,
      translations,
      expectedSchemaRevision: current.form.schemaRevision,
      expectedCategoryVersion: category.version,
      values: [{ definitionId, value: { kind: 'BOOLEAN', boolean: false } }],
    });
    assert.equal(p.status, 201);
    const productId = uuid(p.body['id']);
    assert.equal(
      (await call('GET', '/api/v1/admin/products/' + productId + '/edit-schema')).status,
      200,
    );
    assert.equal(
      (await call('GET', '/api/v1/products/' + productId + '?locale=ckb', undefined, false)).status,
      200,
    );
    for (const forbidden of [
      { productTypeId: typeId },
      { categoryId: category.id },
      { deleted_at: null },
      { version: '99' },
      { ready_at: new Date().toISOString() },
      { role: 'SUPER_ADMIN' },
    ])
      assert.equal(
        (
          await call('PATCH', '/api/v1/admin/products/' + productId, {
            expectedVersion: p.body['version'],
            expectedSchemaRevision: p.body['schemaRevision'],
            ...forbidden,
          })
        ).status,
        400,
      );
    assert.equal((await call('GET', '/api/v1/admin/attributes', undefined, false)).status, 401);
    assert.equal((await call('POST', '/api/v1/admin/asset-registration', {})).status, 404);
  } finally {
    await gateway.close();
    await catalog.close();
  }
});
