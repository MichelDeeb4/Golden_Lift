import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ApplicationError, uuid, version } from '@business-platform/contracts';
import type { DeletionImpact, Uuid } from '@business-platform/contracts';
import { databaseFixture } from '../../../packages/platform/tests/support/database-fixture.js';
import { orm } from '../src/infrastructure/prisma/client.js';
import type { PrismaClient } from '../src/infrastructure/prisma/client.js';
import { PrismaCatalogUnitOfWork } from '../src/infrastructure/prisma/unit-of-work.js';
import { PrismaCatalogDeletionUnitOfWork } from '../src/infrastructure/prisma/deletion.js';
import type { CatalogDeletionUnitOfWork } from '../src/application/ports/deletion.js';
import { CatalogOwnerCopies } from '../src/infrastructure/prisma/owner-copies.js';
import * as Cases from '../src/application/use-cases/delete-catalog-entities.js';
import { CreateCategory } from '../src/application/use-cases/create-category.js';
import { CreateProduct, EditProduct } from '../src/application/use-cases/save-product.js';
import {
  CreateAttributeDefinition,
  CreateAttributeGroup,
  CreateCanonicalUnit,
} from '../src/application/use-cases/create-catalog-configuration.js';
import { ManageCatalogRelationships } from '../src/application/use-cases/manage-catalog-relationships.js';
let fixture: Awaited<ReturnType<typeof databaseFixture>>,
  db: PrismaClient,
  uow: PrismaCatalogUnitOfWork,
  deletions: PrismaCatalogDeletionUnitOfWork;
const ids = { newUuid: () => uuid(randomUUID()) },
  clock = { now: () => new Date().toISOString() },
  actor = { id: ids.newUuid(), role: 'ADMIN' as const, authVersion: version('1') },
  translations = [{ locale: 'ar' as const, name: 'Deletion fixture', description: null }];
const command = (p: DeletionImpact) => ({
  expectedVersion: p.expectedVersion,
  impactRevision: p.impactRevision,
  confirmed: true as const,
});
const code = (expected: string) => (e: unknown) =>
  e instanceof ApplicationError && e.code === expected;
before(async () => {
  fixture = await databaseFixture('catalog', { catalogProfile: 'category' });
  db = orm(fixture.pool);
  uow = new PrismaCatalogUnitOfWork(db);
  deletions = new PrismaCatalogDeletionUnitOfWork(db);
});
after(async () => {
  await db?.$disconnect();
  await fixture?.dispose();
});
async function category(parent: Uuid | null = null) {
  const p = parent ? await uow.execute((r) => r.categories.find(parent, 'ar')) : null;
  return new CreateCategory(uow, ids, clock).execute(
    {
      parentId: parent,
      expectedParentVersion: p?.version ?? null,
      translations: translations.map((t) => ({ ...t, slug: null })),
    },
    actor,
  );
}
async function attribute(unitCode: string | null = null) {
  return new CreateAttributeDefinition(uow, ids, clock).execute(
    {
      code: 'delete-' + randomUUID(),
      translations,
      kind: 'NUMBER',
      unitCode,
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
}
async function groups(categoryId: Uuid, groupIds: Uuid[]) {
  const links = new ManageCatalogRelationships(uow, ids, clock),
    target = { resource: 'categories' as const, id: categoryId },
    current = await links.read(target, actor),
    review = await links.preview(target, groupIds, current.version, actor);
  return links.commit(target, groupIds, current.version, review.precondition, true, actor);
}
test('unused Unit hard-deletes; any Attribute usage blocks without changing references', async () => {
  const create = () =>
    new CreateCanonicalUnit(uow, ids, clock).execute(
      { code: 'u-' + randomUUID(), symbol: 'mm', dimension: 'length', translations },
      actor,
    );
  const used = await create();
  const d = await attribute(used.code);
  const preview = await new Cases.GetUnitDeletionImpact(deletions).execute(used.code, actor);
  assert.equal(preview.allowed, false);
  await assert.rejects(
    new Cases.DeleteUnit(deletions, ids, clock).execute(used.code, command(preview), actor),
    code('DELETE_BLOCKED_BY_UNIT_USAGE'),
  );
  assert.equal(
    (await db.specificationDefinitions.findUniqueOrThrow({ where: { id: d.id } })).unit_code,
    used.code,
  );
  const unused = await create();
  await new Cases.DeleteUnit(deletions, ids, clock).execute(
    unused.code,
    command(await new Cases.GetUnitDeletionImpact(deletions).execute(unused.code, actor)),
    actor,
  );
  assert.equal(await db.units.findUnique({ where: { code: unused.code } }), null);
});
test('Category blocks Products anywhere in descendants, including impact-to-delete race; empty tree hard-deletes and preserves Groups', async () => {
  const root = await category(),
    leaf = await category(root.id),
    preview = await new Cases.GetCategoryDeletionImpact(deletions).execute(root.id, actor);
  const p = await new CreateProduct(uow, ids, clock).execute(
    { categoryId: leaf.id, translations, modelCode: null },
    actor,
  );
  await assert.rejects(
    new Cases.DeleteCategoryTree(deletions, ids).execute(root.id, command(preview), actor),
    code('DELETE_BLOCKED_BY_PRODUCTS'),
  );
  assert.ok(await db.products.findUnique({ where: { id: p.id } }));
  assert.ok(await db.categories.findUnique({ where: { id: root.id } }));
  const empty = await category(),
    child = await category(empty.id),
    group = await new CreateAttributeGroup(uow, ids, clock).execute(
      { code: 'g-' + randomUUID(), translations, attributeIds: [] },
      actor,
    );
  await groups(child.id, [group.id]);
  const result = await new Cases.DeleteCategoryTree(deletions, ids).execute(
    empty.id,
    command(await new Cases.GetCategoryDeletionImpact(deletions).execute(empty.id, actor)),
    actor,
  );
  assert.equal(result.status, 'COMPLETED');
  assert.equal(await db.categories.findUnique({ where: { id: child.id } }), null);
  assert.equal(await db.categories.findUnique({ where: { id: empty.id } }), null);
  assert.ok(await db.specificationGroups.findUnique({ where: { id: group.id } }));
});
test('Group deletion preserves shared reachability and removes only values losing their last supplying Group', async () => {
  const c = await category(),
    material = await attribute(),
    finish = await attribute(),
    a = await new CreateAttributeGroup(uow, ids, clock).execute(
      { code: 'a-' + randomUUID(), translations, attributeIds: [material.id, finish.id] },
      actor,
    ),
    b = await new CreateAttributeGroup(uow, ids, clock).execute(
      { code: 'b-' + randomUUID(), translations, attributeIds: [material.id] },
      actor,
    );
  await groups(c.id, [a.id, b.id]);
  let p = await new CreateProduct(uow, ids, clock).execute(
    { categoryId: c.id, translations, modelCode: null },
    actor,
  );
  p = await new EditProduct(uow, ids, clock).execute(
    p.id,
    {
      expectedVersion: p.version,
      expectedSchemaRevision: p.schemaRevision,
      values: [
        { definitionId: material.id, value: { kind: 'NUMBER', number: '12.000001' } },
        { definitionId: finish.id, value: { kind: 'NUMBER', number: '9' } },
      ],
    },
    actor,
  );
  const review = await new Cases.GetAttributeGroupDeletionImpact(deletions).execute(a.id, actor);
  assert.equal(
    review.cascadingDeletes.find((x) => x.type === 'newly unreachable Product values')?.count,
    '1',
  );
  await new Cases.DeleteAttributeGroup(deletions, ids, clock).execute(a.id, command(review), actor);
  assert.equal(await db.specificationGroups.findUnique({ where: { id: a.id } }), null);
  assert.ok(await db.specificationDefinitions.findUnique({ where: { id: finish.id } }));
  assert.equal(
    await db.productSpecificationValues.count({
      where: { product_id: p.id, definition_id: finish.id },
    }),
    0,
  );
  assert.equal(
    await db.productSpecificationValues.count({
      where: { product_id: p.id, definition_id: material.id },
    }),
    1,
  );
  const attrReview = await new Cases.GetAttributeDeletionImpact(deletions).execute(
    material.id,
    actor,
  );
  await new Cases.DeleteAttribute(deletions, ids, clock).execute(
    material.id,
    command(attrReview),
    actor,
  );
  assert.equal(
    await db.productSpecificationValues.count({ where: { definition_id: material.id } }),
    0,
  );
  assert.equal(await db.specificationDefinitions.findUnique({ where: { id: material.id } }), null);
  assert.ok(await db.products.findUnique({ where: { id: p.id } }));
  assert.ok(await db.specificationGroups.findUnique({ where: { id: b.id } }));
});
test('Product deletion without Media hard-deletes translations and preserves its Category; SUPER_ADMIN is forbidden', async () => {
  const c = await category(),
    p = await new CreateProduct(uow, ids, clock).execute(
      { categoryId: c.id, translations, modelCode: 'DEL-' + randomUUID() },
      actor,
    ),
    review = await new Cases.GetProductDeletionImpact(deletions).execute(p.id, actor);
  assert.throws(
    () =>
      new Cases.DeleteProduct(deletions, ids).execute(p.id, command(review), {
        ...actor,
        role: 'SUPER_ADMIN',
      }),
    code('FORBIDDEN'),
  );
  const result = await new Cases.DeleteProduct(deletions, ids).execute(
    p.id,
    command(review),
    actor,
  );
  assert.equal(result.status, 'COMPLETED');
  assert.equal(await db.products.findUnique({ where: { id: p.id } }), null);
  assert.equal(await db.productTranslations.count({ where: { product_id: p.id } }), 0);
  assert.equal(await db.productCodeReservations.count({ where: { product_id: p.id } }), 0);
  assert.ok(await db.categories.findUnique({ where: { id: c.id } }));
});
test('entity version conflicts reject stale deletion without deleting any row', async () => {
  const d = await attribute(),
    review = await new Cases.GetAttributeDeletionImpact(deletions).execute(d.id, actor);
  await db.$transaction(
    (tx) =>
      tx.specificationDefinitions.update({ where: { id: d.id }, data: { updated_at: new Date() } }),
    { isolationLevel: 'Serializable' },
  );
  await assert.rejects(
    new Cases.DeleteAttribute(deletions, ids, clock).execute(d.id, command(review), actor),
    code('VERSION_CONFLICT'),
  );
  assert.ok(await db.specificationDefinitions.findUnique({ where: { id: d.id } }));
});
test('Product deletion removes historical gallery rows but preserves former Media now owned by a surviving Product', async () => {
  const c = await category(),
    removed = await new CreateProduct(uow, ids, clock).execute(
      { categoryId: c.id, translations, modelCode: null },
      actor,
    ),
    survivor = await new CreateProduct(uow, ids, clock).execute(
      { categoryId: c.id, translations, modelCode: null },
      actor,
    ),
    asset = ids.newUuid();
  await db.$transaction(
    async (tx) => {
      await tx.mediaAssetRefs.create({
        data: { id: asset, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
      });
      await tx.productMedia.create({
        data: { product_id: removed.id, asset_id: asset, deleted_at: new Date() },
      });
      await tx.productMedia.create({ data: { product_id: survivor.id, asset_id: asset } });
    },
    { isolationLevel: 'Serializable' },
  );
  const impact = await new Cases.GetProductDeletionImpact(deletions).execute(removed.id, actor);
  assert.equal(impact.allowed, true);
  assert.equal(impact.cascadingDeletes.find((x) => x.type === 'IMAGE')?.count, '0');
  const result = await new Cases.DeleteProduct(deletions, ids).execute(
    removed.id,
    command(impact),
    actor,
  );
  assert.equal(result.status, 'COMPLETED');
  assert.equal(await db.productMedia.count({ where: { product_id: removed.id } }), 0);
  assert.ok(await db.mediaAssetRefs.findUnique({ where: { id: asset } }));
  assert.equal(
    await db.productMedia.count({ where: { product_id: survivor.id, asset_id: asset } }),
    1,
  );
});
test('Attribute deletion and its business event roll back together when the transaction fails', async () => {
  const d = await attribute(),
    review = await new Cases.GetAttributeDeletionImpact(deletions).execute(d.id, actor),
    before = await db.outboxEvents.count();
  const failing: CatalogDeletionUnitOfWork = {
    execute: (work) =>
      deletions.execute(async (repository) => {
        await work(repository);
        throw new ApplicationError('INVALID_STATE', 'Injected transaction failure.');
      }),
  };
  await assert.rejects(
    new Cases.DeleteAttribute(failing, ids, clock).execute(d.id, command(review), actor),
    code('INVALID_STATE'),
  );
  assert.ok(await db.specificationDefinitions.findUnique({ where: { id: d.id } }));
  assert.equal(await db.outboxEvents.count(), before);
  await new Cases.DeleteAttribute(deletions, ids, clock).execute(d.id, command(review), actor);
  assert.equal(
    await db.outboxEvents.count({
      where: { aggregate_id: d.id, event_type: 'catalog.attribute.deleted.v1' },
    }),
    1,
  );
});

test('owner-copy switching preserves gallery identity, cover and captions and resumes without changing the owner twice', async () => {
  const c = await category(),
    p = await new CreateProduct(uow, ids, clock).execute(
      { categoryId: c.id, translations, modelCode: null },
      actor,
    ),
    source = ids.newUuid(),
    target = ids.newUuid(),
    gallery = ids.newUuid();
  await db.$transaction(
    async (tx) => {
      await tx.mediaAssetRefs.create({
        data: { id: source, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
      });
      await tx.productMedia.create({ data: { id: gallery, product_id: p.id, asset_id: source } });
      await tx.productMediaTranslations.create({
        data: { product_media_id: gallery, locale: 'ar', caption: 'Preserved caption' },
      });
      await tx.products.update({ where: { id: p.id }, data: { cover_media_id: gallery } });
    },
    { isolationLevel: 'Serializable' },
  );
  const copies = new CatalogOwnerCopies(db);
  await copies.switch(source, target, 'PRODUCT', p.id, 'IMAGE', '1');
  const versionAfter = (await db.products.findUniqueOrThrow({ where: { id: p.id } })).version;
  await copies.switch(source, target, 'PRODUCT', p.id, 'IMAGE', '1');
  const saved = await db.products.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(saved.version, versionAfter);
  assert.equal(saved.cover_media_id, gallery);
  assert.equal(
    (await db.productMedia.findUniqueOrThrow({ where: { id: gallery } })).asset_id,
    target,
  );
  assert.equal(
    (await db.productMediaTranslations.findFirstOrThrow({ where: { product_media_id: gallery } }))
      .caption,
    'Preserved caption',
  );
  assert.ok(await db.mediaAssetRefs.findUnique({ where: { id: source } }));
});

test('database guards reject new Products or descendants under a Category accepted for Media cleanup', async () => {
  const root = await category(),
    asset = ids.newUuid();
  await db.$transaction(
    async (tx) => {
      await tx.mediaAssetRefs.create({
        data: { id: asset, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
      });
      await tx.categories.update({ where: { id: root.id }, data: { cover_asset_id: asset } });
    },
    { isolationLevel: 'Serializable' },
  );
  const impact = await new Cases.GetCategoryDeletionImpact(deletions).execute(root.id, actor);
  const result = await new Cases.DeleteCategoryTree(deletions, ids).execute(
    root.id,
    command(impact),
    actor,
  );
  assert.equal(result.status, 'MEDIA_CLEANUP');
  await assert.rejects(
    db.$transaction((tx) => tx.products.create({ data: { category_id: root.id } }), {
      isolationLevel: 'Serializable',
    }),
  );
  await assert.rejects(
    db.$transaction((tx) => tx.categories.create({ data: { parent_id: root.id } }), {
      isolationLevel: 'Serializable',
    }),
  );
  assert.equal(await db.products.count({ where: { category_id: root.id } }), 0);
  assert.equal(await db.categories.count({ where: { parent_id: root.id } }), 0);
});
