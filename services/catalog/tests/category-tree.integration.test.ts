import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type {
  CategoryCollectionPage,
  AdminCategoryDto,
  BreadcrumbPage,
  DeletionImpact,
  Uuid,
} from '@golden-lift/contracts';
import pg from 'pg';
import { httpConfig } from '@golden-lift/platform';
import { databaseFixture } from '../../../packages/platform/tests/support/database-fixture.js';
import type { CatalogUnitOfWork } from '../src/application/ports/catalog.js';
import { orm } from '../src/infrastructure/prisma/client.js';
import type { PrismaClient } from '../src/infrastructure/prisma/client.js';
import { PrismaCatalogUnitOfWork } from '../src/infrastructure/prisma/unit-of-work.js';
import { PrismaCategoryNavigation } from '../src/infrastructure/prisma/category-navigation.js';
import { CreateCategory } from '../src/application/use-cases/create-category.js';
import { EditCategory } from '../src/application/use-cases/edit-category.js';
import { MoveCategory } from '../src/application/use-cases/move-category.js';
import { ReorderCategories } from '../src/application/use-cases/reorder-categories.js';
import {
  DeleteCategoryBranch,
  PreviewCategoryDeletion,
} from '../src/application/use-cases/delete-category-branch.js';
import { PrismaCatalogDeletionUnitOfWork } from '../src/infrastructure/prisma/deletion.js';
import {
  GetCategoryDeletionImpact,
  DeleteCategoryTree,
} from '../src/application/use-cases/delete-catalog-entities.js';
import { ReadCategoryNavigation } from '../src/application/use-cases/read-category-navigation.js';
import { catalogApplication } from '../src/composition/application.js';
import { gatewayApplication } from '../../gateway/src/composition/application.js';
let fixture: Awaited<ReturnType<typeof databaseFixture>>,
  database: PrismaClient,
  transactions: PrismaCatalogUnitOfWork,
  navigation: PrismaCategoryNavigation;
const ids = { newUuid: () => uuid(randomUUID()) },
  clock = { now: () => new Date().toISOString() },
  actor = { id: ids.newUuid(), role: 'ADMIN' as const, authVersion: version('1') },
  ar = {
    locale: 'ar' as const,
    name: 'Synthetic category',
    description: 'Arabic description',
    slug: null,
  };
const isCode = (code: string) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;
before(async () => {
  fixture = await databaseFixture('catalog', { catalogProfile: 'category' });
  database = orm(fixture.pool);
  transactions = new PrismaCatalogUnitOfWork(database);
  navigation = new PrismaCategoryNavigation(database);
});
after(async () => {
  if (database) await database.$disconnect();
  if (fixture) await fixture.dispose();
});
async function category(parentId: Uuid | null = null) {
  const parent = parentId ? await navigation.detail(parentId, 'ar') : null;
  return new CreateCategory(transactions, ids, clock).execute(
    { parentId, expectedParentVersion: parent?.version ?? null, translations: [ar] },
    actor,
  );
}
test('created siblings append in creation order, including concurrent root creation', async () => {
  const parent = await category();
  const first = await category(parent.id),
    second = await category(parent.id),
    third = await category(parent.id);
  const siblings = await navigation.siblings(parent.id, 100);
  assert.deepEqual(
    siblings.map((row) => row.id),
    [first.id, second.id, third.id],
  );
  const roots = await Promise.all([category(), category()]);
  assert.notEqual(roots[0]!.sortOrder, roots[1]!.sortOrder);
  assert.ok(BigInt(roots[0]!.sortOrder) > 0n && BigInt(roots[1]!.sortOrder) > 0n);
});
async function moveInput(id: Uuid, parentId: Uuid | null, beforeId: Uuid | null = null) {
  const row = await navigation.detail(id, 'ar');
  assert.ok(row);
  return {
    parentId,
    beforeId,
    expectedVersion: row.version,
    expectedSourceRevision: await navigation.revision(row.parentId),
    expectedDestinationRevision: await navigation.revision(parentId),
  };
}
function move(uow: CatalogUnitOfWork = transactions) {
  return new MoveCategory(uow, ids, clock);
}
function deletion(uow: CatalogUnitOfWork = transactions) {
  return new DeleteCategoryBranch(uow, ids, clock);
}
async function preview(id: Uuid) {
  return new PreviewCategoryDeletion(transactions).execute(id, actor);
}
async function remove(id: Uuid) {
  const state = await preview(id);
  return deletion().execute(
    id,
    {
      confirm: true,
      expectedVersion: state.category.version,
      previewPrecondition: state.previewPrecondition,
    },
    actor,
  );
}
async function product(categoryId: Uuid) {
  const id = ids.newUuid(),
    groupId = ids.newUuid(),
    mediaId = ids.newUuid(),
    assetId = ids.newUuid(),
    code = 'SYNTHETIC-' + randomUUID();
  await database.$transaction(
    async (tx) => {
      await tx.mediaAssetRefs.create({
        data: { id: assetId, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
      });
      await tx.specificationGroups.create({ data: { id: groupId, code: 'b4-fixture-' + groupId } });
      await tx.specificationGroupTranslations.create({
        data: { group_id: groupId, locale: 'ar', name: 'Synthetic fixture group' },
      });
      await tx.$executeRaw`INSERT INTO catalog.category_attribute_groups(category_id,group_id) VALUES(${categoryId}::uuid,${groupId}::uuid)`;
      await tx.products.create({
        data: { id, category_id: categoryId, cover_media_id: mediaId, is_active: true },
      });
      await tx.productTranslations.create({
        data: { product_id: id, locale: 'ar', name: 'Synthetic product' },
      });
      await tx.productMedia.create({ data: { id: mediaId, product_id: id, asset_id: assetId } });
      await tx.productMediaTranslations.create({
        data: { product_media_id: mediaId, locale: 'ar', title: 'Synthetic image' },
      });
      const reservation = await tx.productCodeReservations.create({
        data: { product_id: id, code },
      });
      await tx.products.update({ where: { id }, data: { current_model_code_id: reservation.id } });
    },
    { isolationLevel: 'Serializable' },
  );
  return { id, mediaId, assetId, code, groupId };
}
async function richBranch() {
  const root = await category(),
    leaf = await category(root.id),
    outside = await category(),
    p = await product(leaf.id);
  const sheetId = ids.newUuid(),
    configurationId = ids.newUuid(),
    pdfId = ids.newUuid(),
    sourceId = ids.newUuid(),
    observationId = ids.newUuid(),
    textDefinition = ids.newUuid(),
    choiceDefinition = ids.newUuid(),
    numberDefinition = ids.newUuid(),
    coverAsset = ids.newUuid();
  await database.$transaction(
    async (tx) => {
      await tx.mediaAssetRefs.create({
        data: { id: coverAsset, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
      });
      await tx.categories.update({ where: { id: root.id }, data: { cover_asset_id: coverAsset } });
      await tx.technicalSheets.create({ data: { id: sheetId, sheet_key: 'synthetic-' + sheetId } });
      await tx.technicalSheetTranslations.create({
        data: { sheet_id: sheetId, locale: 'ar', title: 'Synthetic shared sheet' },
      });
      await tx.technicalConfigurations.create({
        data: { id: configurationId, sheet_id: sheetId, configuration_key: 'synthetic' },
      });
      await tx.technicalConfigurationTranslations.create({
        data: { configuration_id: configurationId, locale: 'ar', label: 'Synthetic configuration' },
      });
      await tx.categoryTechnicalSheets.createMany({
        data: [
          { category_id: root.id, sheet_id: sheetId },
          { category_id: outside.id, sheet_id: sheetId },
        ],
      });
      const link = await tx.productTechnicalSheets.create({
        data: { product_id: p.id, sheet_id: sheetId, relation_kind: 'PRODUCT_SPECIFICATION' },
      });
      await tx.productTechnicalConfigurations.create({
        data: { sheet_id: sheetId, product_sheet_id: link.id, configuration_id: configurationId },
      });
      await tx.mediaAssetRefs.create({
        data: { id: pdfId, media_kind: 'PDF', source_version: 1n, ready_at: new Date() },
      });
      await tx.technicalSheetSources.create({
        data: {
          id: sourceId,
          sheet_id: sheetId,
          asset_id: pdfId,
          source_label: 'Synthetic private PDF',
          page_from: 1,
          page_to: 1,
        },
      });
      await tx.technicalSourceObservations.create({
        data: {
          id: observationId,
          sheet_id: sheetId,
          source_id: sourceId,
          page_number: 1,
          table_label: 'fixture',
          row_label: 'fixture',
          column_label: 'fixture',
          raw_value_text: 'Synthetic evidence',
        },
      });
      await tx.specificationDefinitions.createMany({
        data: [
          { id: textDefinition, code: 'text-' + textDefinition, value_type: 'TEXT' },
          { id: choiceDefinition, code: 'choice-' + choiceDefinition, value_type: 'CHOICE' },
          { id: numberDefinition, code: 'number-' + numberDefinition, value_type: 'NUMBER' },
        ],
      });
      await tx.specificationTranslations.createMany({
        data: [textDefinition, choiceDefinition, numberDefinition].map((id) => ({
          definition_id: id,
          locale: 'ar',
          label: 'Synthetic specification',
        })),
      });
      await tx.$executeRaw`INSERT INTO catalog.attribute_group_attributes(group_id,definition_id) SELECT ${p.groupId}::uuid,id FROM unnest(${[textDefinition, choiceDefinition, numberDefinition]}::uuid[]) ids(id)`;
      const text = await tx.productSpecificationValues.create({
        data: { product_id: p.id, definition_id: textDefinition, value_type: 'TEXT' },
      });
      await tx.productSpecificationTexts.create({
        data: { value_id: text.id, locale: 'ar', text_value: 'Synthetic saved value' },
      });
      const option = await tx.specificationOptions.create({
        data: { definition_id: choiceDefinition, code: 'fixture' },
      });
      await tx.specificationOptionTranslations.create({
        data: { option_id: option.id, locale: 'ar', label: 'Synthetic option' },
      });
      const choice = await tx.productSpecificationValues.create({
        data: { product_id: p.id, definition_id: choiceDefinition, value_type: 'CHOICE' },
      });
      await tx.productSpecificationChoices.create({
        data: { value_id: choice.id, definition_id: choiceDefinition, option_id: option.id },
      });
      await tx.productSpecificationValues.create({
        data: {
          product_id: p.id,
          definition_id: numberDefinition,
          value_type: 'NUMBER',
          number_value: '99999999999999.123456',
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  return { root, leaf, outside, p, sheetId, pdfId, sourceId, observationId };
}
function pausedSnapshot() {
  let ready!: () => void,
    release!: () => void,
    attempts = 0;
  const started = new Promise<void>((resolve) => {
      ready = resolve;
    }),
    released = new Promise<void>((resolve) => {
      release = resolve;
    });
  const uow: CatalogUnitOfWork = {
    execute: (work) =>
      transactions.execute(async (repositories) => {
        attempts++;
        await repositories.navigation.revision(null);
        if (attempts === 1) {
          ready();
          await released;
        }
        return work(repositories);
      }),
  };
  return { uow, started, release, attempts: () => attempts };
}
test('Admin detail exposes actual translations, missing locales, exact counts and derived eligibility', async () => {
  const root = await category(),
    p = await product(root.id);
  await new EditCategory(transactions, ids, clock).execute(
    root.id,
    (await navigation.detail(root.id, 'ar'))!.version,
    [ar, { ...ar, locale: 'en', name: 'English', description: null }],
    actor,
  );
  const row = await navigation.detail(root.id, 'en');
  assert.ok(row);
  assert.equal(row.name, 'English');
  assert.equal(row.description, 'Arabic description');
  assert.equal(row.translations.find((t) => t.locale === 'en')?.description, null);
  assert.deepEqual(row.missingTranslationLocales, ['ckb']);
  assert.equal(row.activeChildCount, '0');
  assert.equal(row.activeProductCount, '1');
  assert.equal(row.canAddChildren, false);
  assert.equal(row.canAddProducts, true);
  await database.$transaction(
    (tx) =>
      tx.$queryRaw`SELECT catalog.soft_delete_branch(${root.id}::uuid,${row.version}::bigint)`,
    { isolationLevel: 'Serializable' },
  );
  assert.equal(await navigation.detail(root.id, 'ar'), null);
  assert.ok((await database.products.findUniqueOrThrow({ where: { id: p.id } })).deleted_at);
});
test('deep ancestor navigation pages root-to-node without fixed depth or silent truncation', async () => {
  const path = Array.from({ length: 107 }, () => ids.newUuid());
  await transactions.execute(async ({ categories }) => {
    for (const [index, id] of path.entries()) {
      await categories.insert(id, path[index - 1] ?? null);
      await categories.putTranslations(id, [ar]);
    }
  });
  const target = path.at(-1);
  assert.ok(target);
  const read = new ReadCategoryNavigation(transactions);
  const first = await read.breadcrumbs(target, 'ckb', '-1', 100, null, actor),
    second = await read.breadcrumbs(
      target,
      'ckb',
      first.depths.at(-1) ?? '-1',
      100,
      first.revision,
      actor,
    );
  assert.equal(first.items.length, 100);
  assert.equal(second.items.length, 7);
  assert.deepEqual(
    [...first.items, ...second.items].map((row) => row.id),
    path,
  );
  await move().execute(target, await moveInput(target, null), actor);
  await assert.rejects(
    read.breadcrumbs(target, 'ckb', '99', 100, first.revision, actor),
    isCode('VERSION_CONFLICT'),
  );
});
test('branch moves root-to-child, branch-to-branch and child-to-root retain descendants, products, specifications and technical links', async () => {
  const branch = await richBranch(),
    target = await category();
  const rowsBefore = await database.categoryTranslations.findMany({
    where: { category_id: { in: [branch.root.id, branch.leaf.id] } },
  });
  await move().execute(branch.root.id, await moveInput(branch.root.id, target.id), actor);
  assert.equal((await navigation.detail(branch.root.id, 'ar'))?.parentId, target.id);
  await move().execute(branch.root.id, await moveInput(branch.root.id, branch.outside.id), actor);
  await move().execute(branch.root.id, await moveInput(branch.root.id, null), actor);
  assert.equal((await navigation.detail(branch.root.id, 'ar'))?.parentId, null);
  assert.equal(
    (await database.products.findUniqueOrThrow({ where: { id: branch.p.id } })).category_id,
    branch.leaf.id,
  );
  assert.deepEqual(
    await database.categoryTranslations.findMany({
      where: { category_id: { in: [branch.root.id, branch.leaf.id] } },
    }),
    rowsBefore,
  );
  const [members] = await database.$queryRaw<
    { count: string }[]
  >`SELECT count(*)::text FROM catalog.attribute_group_attributes WHERE group_id=${branch.p.groupId}::uuid AND deleted_at IS NULL`;
  assert.equal(members?.count, '3');
  assert.equal(
    await database.productTechnicalConfigurations.count({
      where: { deleted_at: null, product_technical_sheets: { product_id: branch.p.id } },
    }),
    1,
  );
  assert.equal(
    await database.categoryTechnicalSheets.count({
      where: { category_id: branch.root.id, deleted_at: null },
    }),
    1,
  );
  assert.equal(
    (
      await database.productSpecificationValues.findFirstOrThrow({
        where: { product_id: branch.p.id, value_type: 'NUMBER' },
      })
    ).number_value?.toFixed(6),
    '99999999999999.123456',
  );
});
test('moves reject self/descendant, invalid/deleted/product-bearing destinations and stale collection or row versions', async () => {
  const root = await category(),
    child = await category(root.id),
    parent = await category();
  await product(parent.id);
  for (const target of [root.id, child.id, parent.id])
    await assert.rejects(
      move().execute(root.id, await moveInput(root.id, target), actor),
      isCode('INVALID_STATE'),
    );
  const missing = ids.newUuid();
  await assert.rejects(
    move().execute(root.id, await moveInput(root.id, missing), actor),
    isCode('NOT_FOUND'),
  );
  const gone = await category();
  await remove(gone.id);
  await assert.rejects(
    move().execute(root.id, await moveInput(root.id, gone.id), actor),
    isCode('NOT_FOUND'),
  );
  const input = await moveInput(child.id, null);
  await category();
  await assert.rejects(move().execute(child.id, input, actor), isCode('VERSION_CONFLICT'));
  const editInput = await moveInput(child.id, null);
  await new EditCategory(transactions, ids, clock).execute(
    child.id,
    child.version,
    [{ ...ar, name: 'new name' }],
    actor,
  );
  await assert.rejects(move().execute(child.id, editInput, actor), isCode('VERSION_CONFLICT'));
});
test('same-parent anchored moves define append, before, no-op and invalid anchors without spurious events', async () => {
  const parent = await category(),
    a = await category(parent.id),
    b = await category(parent.id),
    c = await category(parent.id);
  await database.$transaction(
    async (tx) => {
      for (const [index, row] of [a, b, c].entries())
        await tx.categories.update({
          where: { id: row.id },
          data: { sort_order: BigInt(index + 1) * 1024n },
        });
    },
    { isolationLevel: 'Serializable' },
  );
  const before = await database.outboxEvents.count();
  const first = await move().execute(c.id, await moveInput(c.id, parent.id, a.id), actor);
  assert.equal(first.changed, true);
  assert.equal((await navigation.siblings(parent.id, 100))[0]?.id, c.id);
  const noop = await move().execute(c.id, await moveInput(c.id, parent.id, a.id), actor);
  assert.equal(noop.changed, false);
  assert.equal(noop.category.version, first.category.version);
  assert.equal(await database.outboxEvents.count(), before + 1);
  await assert.rejects(
    move().execute(c.id, await moveInput(c.id, parent.id, c.id), actor),
    isCode('VALIDATION_FAILED'),
  );
  const foreign = await category();
  await assert.rejects(
    move().execute(b.id, await moveInput(b.id, parent.id, foreign.id), actor),
    isCode('INVALID_STATE'),
  );
  await move().execute(c.id, await moveInput(c.id, parent.id), actor);
  assert.equal((await navigation.siblings(parent.id, 100)).at(-1)?.id, c.id);
});
test('nested reorder normalizes ties atomically, rejects invalid membership and stale revisions, and invalidates cursors', async () => {
  const parent = await category(),
    a = await category(parent.id),
    b = await category(parent.id),
    revision = await navigation.revision(parent.id),
    reorder = new ReorderCategories(transactions, ids, clock);
  const initial = await navigation.siblings(parent.id, 100),
    desired = [...initial].reverse().map((row) => row.id);
  for (const orderedIds of [[a.id, a.id], [a.id], [a.id, ids.newUuid()]])
    await assert.rejects(
      reorder.execute({ parentId: parent.id, orderedIds, expectedListRevision: revision }, actor),
    );
  assert.deepEqual(await navigation.siblings(parent.id, 100), initial);
  const result = await reorder.execute(
    { parentId: parent.id, orderedIds: desired, expectedListRevision: revision },
    actor,
  );
  assert.equal(result.changed, true);
  assert.deepEqual(
    result.items.map((row) => row.id),
    desired,
  );
  assert.deepEqual(
    result.items.map((row) => row.sortOrder),
    ['1024', '2048'],
  );
  await assert.rejects(
    reorder.execute(
      { parentId: parent.id, orderedIds: [a.id, b.id], expectedListRevision: revision },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
  assert.notEqual(result.listRevision, revision);
  assert.equal(
    (
      await reorder.execute(
        { parentId: parent.id, orderedIds: desired, expectedListRevision: result.listRevision },
        actor,
      )
    ).changed,
    false,
  );
});
test('root reorder checks full membership without treating the six seeds as protected values', async () => {
  const current = await navigation.siblings(null, 500),
    desired = [...current].reverse().map((row) => row.id),
    result = await new ReorderCategories(transactions, ids, clock).execute(
      {
        parentId: null,
        orderedIds: desired,
        expectedListRevision: await navigation.revision(null),
      },
      actor,
    );
  assert.deepEqual(
    result.items.map((row) => row.id),
    desired,
  );
});
test('ordering keeps large bigint keys exact and recovers exhausted gaps without touching unrelated siblings', async () => {
  const parent = await category(),
    a = await category(parent.id),
    b = await category(parent.id),
    c = await category(parent.id);
  await database.$transaction(
    async (tx) => {
      await tx.categories.update({ where: { id: a.id }, data: { sort_order: 9007199254740993n } });
      await tx.categories.update({ where: { id: b.id }, data: { sort_order: 9007199254740997n } });
      await tx.categories.update({
        where: { id: c.id },
        data: { sort_order: 9223372036854775807n },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  const first = await move().execute(c.id, await moveInput(c.id, parent.id, b.id), actor);
  assert.equal(first.category.sortOrder, '9007199254740995');
  await database.$transaction(
    (tx) => tx.categories.update({ where: { id: b.id }, data: { sort_order: 9007199254740994n } }),
    { isolationLevel: 'Serializable' },
  );
  await move().execute(c.id, await moveInput(c.id, parent.id, b.id), actor);
  assert.deepEqual(
    (await navigation.siblings(parent.id, 100)).map((row) => row.id),
    [a.id, c.id, b.id],
  );
});
test('preview has no side effects and precisely counts the complete owned deletion impact', async () => {
  const branch = await richBranch(),
    count = await database.outboxEvents.count(),
    state = await preview(branch.root.id);
  assert.deepEqual(state.impact, {
    totalCategoryCount: '2',
    descendantCategoryCount: '1',
    productCount: '1',
    categoryTranslationCount: '2',
    categorySpecificationCount: '0',
    categoryCoverCount: '1',
    categoryTechnicalLinkCount: '1',
    productTranslationCount: '1',
    productCodeReservationCount: '1',
    productMediaCount: '1',
    productMediaTranslationCount: '1',
    productSpecificationValueCount: '3',
    productSpecificationTextCount: '1',
    productSpecificationChoiceCount: '1',
    productTechnicalLinkCount: '1',
    productTechnicalConfigurationCount: '1',
  });
  assert.equal(await database.outboxEvents.count(), count);
  assert.equal((await preview(branch.root.id)).previewPrecondition, state.previewPrecondition);
  assert.equal(JSON.stringify(state).includes('Synthetic private PDF'), false);
  assert.equal(state.retention.mediaDeliveryRevoked, false);
});
test('preview becomes stale after descendant edits, products, attachments and scope changes even without touching the root', async () => {
  const root = await category(),
    child = await category(root.id),
    state = await preview(root.id);
  await new EditCategory(transactions, ids, clock).execute(
    child.id,
    child.version,
    [{ ...ar, name: 'descendant edit' }],
    actor,
  );
  await assert.rejects(
    deletion().execute(
      root.id,
      {
        confirm: true,
        expectedVersion: state.category.version,
        previewPrecondition: state.previewPrecondition,
      },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
  const next = await preview(root.id);
  await product(child.id);
  await assert.rejects(
    deletion().execute(
      root.id,
      {
        confirm: true,
        expectedVersion: next.category.version,
        previewPrecondition: next.previewPrecondition,
      },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
  const other = await category(),
    scope = await preview(other.id);
  await assert.rejects(
    deletion().execute(
      root.id,
      {
        confirm: true,
        expectedVersion: next.category.version,
        previewPrecondition: scope.previewPrecondition,
      },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
  const rich = await richBranch(),
    attached = await preview(rich.root.id);
  await database.$transaction(
    (tx) =>
      tx.productTechnicalSheets.updateMany({
        where: { product_id: rich.p.id, deleted_at: null },
        data: { sort_order: 2048n },
      }),
    { isolationLevel: 'Serializable' },
  );
  await assert.rejects(
    deletion().execute(
      rich.root.id,
      {
        confirm: true,
        expectedVersion: attached.category.version,
        previewPrecondition: attached.previewPrecondition,
      },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
});
test('permanent Category deletion blocks descendant Products without changing retained records or publishing cleanup', async () => {
  const branch = await richBranch(),
    deletions = new PrismaCatalogDeletionUnitOfWork(database);
  const state = await new GetCategoryDeletionImpact(deletions).execute(branch.root.id, actor),
    count = await database.outboxEvents.count();
  assert.equal(state.allowed, false);
  await assert.rejects(
    new DeleteCategoryTree(deletions, ids).execute(
      branch.root.id,
      {
        confirmed: true,
        expectedVersion: state.expectedVersion,
        impactRevision: state.impactRevision,
      },
      actor,
    ),
    isCode('DELETE_BLOCKED_BY_PRODUCTS'),
  );
  for (const id of [branch.root.id, branch.leaf.id]) assert.ok(await navigation.detail(id, 'ar'));
  assert.equal(
    (await database.products.findUniqueOrThrow({ where: { id: branch.p.id } })).deleted_at,
    null,
  );
  assert.equal(
    await database.productSpecificationValues.count({
      where: { product_id: branch.p.id, deleted_at: null },
    }),
    3,
  );
  assert.equal(
    (await database.technicalSheets.findUniqueOrThrow({ where: { id: branch.sheetId } }))
      .deleted_at,
    null,
  );
  assert.equal(
    (
      await database.technicalSourceObservations.findUniqueOrThrow({
        where: { id: branch.observationId },
      })
    ).deleted_at,
    null,
  );
  for (const id of [branch.pdfId, branch.p.assetId])
    assert.equal(
      (await database.mediaAssetRefs.findUniqueOrThrow({ where: { id } })).deleted_at,
      null,
    );
  assert.equal(await database.outboxEvents.count(), count);
});
test('failure after deletion/event normalization rolls everything back', async () => {
  const root = await category(),
    child = await category(root.id),
    state = await preview(root.id),
    count = await database.outboxEvents.count();
  const failing: CatalogUnitOfWork = {
    execute: (work) =>
      transactions.execute(async (repositories) => {
        await work(repositories);
        throw new ApplicationError('INVALID_STATE', 'Synthetic post-event failure.');
      }),
  };
  await assert.rejects(
    deletion(failing).execute(
      root.id,
      {
        confirm: true,
        expectedVersion: state.category.version,
        previewPrecondition: state.previewPrecondition,
      },
      actor,
    ),
    isCode('INVALID_STATE'),
  );
  assert.ok(await navigation.detail(child.id, 'ar'));
  assert.equal((await preview(root.id)).previewPrecondition, state.previewPrecondition);
  assert.equal(await database.outboxEvents.count(), count);
});
test('deterministic competing moves retry and cannot form a cycle', async () => {
  const a = await category(),
    b = await category(),
    input = await moveInput(a.id, b.id),
    paused = pausedSnapshot(),
    pending = move(paused.uow).execute(a.id, input, actor),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await move().execute(b.id, await moveInput(b.id, a.id), actor);
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal((await navigation.detail(b.id, 'ar'))?.parentId, a.id);
  assert.equal((await navigation.detail(a.id, 'ar'))?.parentId, null);
});
test('deterministic move versus product insertion fails safely after a complete transaction retry', async () => {
  const source = await category(),
    parent = await category(),
    paused = pausedSnapshot(),
    input = await moveInput(source.id, parent.id),
    pending = move(paused.uow).execute(source.id, input, actor),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await product(parent.id);
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal(paused.attempts(), 2);
  assert.equal((await navigation.detail(source.id, 'ar'))?.parentId, null);
  assert.equal((await navigation.detail(parent.id, 'ar'))?.activeProductCount, '1');
});
test('deterministic reorder versus sibling creation rejects stale membership', async () => {
  const parent = await category();
  await category(parent.id);
  await category(parent.id);
  const ordered = await navigation.siblings(parent.id, 100),
    paused = pausedSnapshot(),
    pending = new ReorderCategories(paused.uow, ids, clock).execute(
      {
        parentId: parent.id,
        orderedIds: [...ordered].reverse().map((row) => row.id),
        expectedListRevision: await navigation.revision(parent.id),
      },
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await category(parent.id);
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal((await navigation.siblings(parent.id, 100)).length, 3);
});
test('deterministic deletion versus new descendant detects stale impact and never deletes unseen membership', async () => {
  const root = await category(),
    state = await preview(root.id),
    paused = pausedSnapshot(),
    pending = deletion(paused.uow).execute(
      root.id,
      {
        confirm: true,
        expectedVersion: state.category.version,
        previewPrecondition: state.previewPrecondition,
      },
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  let child;
  try {
    child = await category(root.id);
  } finally {
    paused.release();
  }
  await outcome;
  assert.ok(child && (await navigation.detail(child.id, 'ar')));
});
test('an unrelated committed writer retries the entire move and commits exactly one event', async () => {
  const a = await category(),
    b = await category(),
    outside = await category(),
    child = await category(a.id),
    unrelated = await category(outside.id),
    paused = pausedSnapshot(),
    pending = move(paused.uow).execute(child.id, await moveInput(child.id, b.id), actor);
  await paused.started;
  try {
    await new EditCategory(transactions, ids, clock).execute(
      unrelated.id,
      unrelated.version,
      [{ ...ar, name: 'unrelated concurrent edit' }],
      actor,
    );
  } finally {
    paused.release();
  }
  assert.equal((await pending).category.parentId, b.id);
  assert.equal(paused.attempts(), 2);
  assert.equal(
    await database.outboxEvents.count({
      where: { aggregate_id: child.id, event_type: 'catalog.category.moved.v1' },
    }),
    1,
  );
});
test('runtime credentials cannot access the private write gate, physically delete, truncate or restore', async () => {
  await assert.rejects(fixture.pool.query('SELECT revision FROM catalog.write_gate'), {
    code: '42501',
  });
  await assert.rejects(fixture.pool.query('DELETE FROM catalog.categories'), { code: '25000' });
  await assert.rejects(fixture.pool.query('TRUNCATE catalog.categories'), { code: '42501' });
  const root = await category();
  await remove(root.id);
  await assert.rejects(
    database.$transaction(
      (tx) => tx.categories.update({ where: { id: root.id }, data: { deleted_at: null } }),
      { isolationLevel: 'Serializable' },
    ),
  );
});
test('deterministic reorder versus incoming branch move rejects the stale sibling set', async () => {
  const parent = await category(),
    a = await category(parent.id),
    b = await category(parent.id),
    incoming = await category(),
    initial = await navigation.siblings(parent.id, 100),
    paused = pausedSnapshot();
  const pending = new ReorderCategories(paused.uow, ids, clock).execute(
      {
        parentId: parent.id,
        orderedIds: [...initial].reverse().map((row) => row.id),
        expectedListRevision: await navigation.revision(parent.id),
      },
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  try {
    await move().execute(incoming.id, await moveInput(incoming.id, parent.id), actor);
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal((await navigation.siblings(parent.id, 100)).length, 3);
  assert.ok(await navigation.detail(a.id, 'ar'));
  assert.ok(await navigation.detail(b.id, 'ar'));
});
test('deterministic deletion versus new product/media attachment rejects unseen impact with an unchanged root version', async () => {
  const root = await category(),
    leaf = await category(root.id),
    state = await preview(root.id),
    paused = pausedSnapshot(),
    count = await database.outboxEvents.count();
  const pending = deletion(paused.uow).execute(
      root.id,
      {
        confirm: true,
        expectedVersion: state.category.version,
        previewPrecondition: state.previewPrecondition,
      },
      actor,
    ),
    outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await paused.started;
  let added;
  try {
    added = await product(leaf.id);
  } finally {
    paused.release();
  }
  await outcome;
  assert.equal((await navigation.detail(root.id, 'ar'))?.version, state.category.version);
  assert.ok(added);
  assert.equal(
    (await database.products.findUniqueOrThrow({ where: { id: added.id } })).deleted_at,
    null,
  );
  assert.equal(await database.outboxEvents.count(), count);
  assert.equal(paused.attempts(), 2);
});
test('failure after sibling reorder and event append restores every previous order/version atomically', async () => {
  const parent = await category();
  await category(parent.id);
  await category(parent.id);
  await category(parent.id);
  const initial = await navigation.siblings(parent.id, 100),
    revision = await navigation.revision(parent.id),
    count = await database.outboxEvents.count();
  const failing: CatalogUnitOfWork = {
    execute: (work) =>
      transactions.execute(async (repositories) => {
        await work(repositories);
        throw new ApplicationError('INVALID_STATE', 'Synthetic post-event reorder failure.');
      }),
  };
  await assert.rejects(
    new ReorderCategories(failing, ids, clock).execute(
      {
        parentId: parent.id,
        orderedIds: [...initial].reverse().map((row) => row.id),
        expectedListRevision: revision,
      },
      actor,
    ),
    isCode('INVALID_STATE'),
  );
  assert.deepEqual(await navigation.siblings(parent.id, 100), initial);
  assert.equal(await navigation.revision(parent.id), revision);
  assert.equal(await database.outboxEvents.count(), count);
});
test('large sibling lists remain navigable and movable; bounded recovery refuses atomically instead of truncating', async () => {
  const parent = await category(),
    children = Array.from({ length: 501 }, () => ids.newUuid());
  await database.$transaction(
    async (tx) => {
      await tx.categories.createMany({
        data: children.map((id, index) => ({
          id,
          parent_id: parent.id,
          sort_order: BigInt(index + 1) * 1024n,
        })),
      });
      await tx.categoryTranslations.createMany({
        data: children.map((id) => ({
          category_id: id,
          locale: 'ar',
          name: 'Synthetic large list category',
        })),
      });
    },
    { isolationLevel: 'Serializable' },
  );
  assert.equal((await navigation.detail(parent.id, 'ar'))?.activeChildCount, '501');
  assert.equal((await navigation.list(parent.id, 'ar', 100, null, null)).length, 100);
  const first = children[0],
    last = children.at(-1);
  assert.ok(first && last);
  assert.equal(
    (await move().execute(last, await moveInput(last, parent.id, first), actor)).changed,
    true,
  );
  await assert.rejects(
    new ReorderCategories(transactions, ids, clock).execute(
      {
        parentId: parent.id,
        orderedIds: children,
        expectedListRevision: await navigation.revision(parent.id),
      },
      actor,
    ),
    isCode('INVALID_STATE'),
  );
  await database.$transaction(
    (tx) =>
      tx.categories.updateMany({
        where: { parent_id: parent.id, deleted_at: null },
        data: { sort_order: 1024n },
      }),
    { isolationLevel: 'Serializable' },
  );
  const incoming = await category(),
    before = (await navigation.siblings(parent.id, 3))[1];
  assert.ok(before);
  const revision = await navigation.revision(parent.id),
    count = await database.outboxEvents.count();
  await assert.rejects(
    move().execute(incoming.id, await moveInput(incoming.id, parent.id, before.id), actor),
    isCode('INVALID_STATE'),
  );
  assert.equal(await navigation.revision(parent.id), revision);
  assert.equal((await navigation.detail(incoming.id, 'ar'))?.parentId, null);
  assert.equal(await database.outboxEvents.count(), count);
});
test('gateway API exposes bounded Admin navigation, scope-bound cursors, destinations, moves, reorder and confirmed deletion', async () => {
  const apiPool = new pg.Pool(fixture.pool.options),
    catalog = await catalogApplication(httpConfig('catalog', {}), apiPool, {
      authenticate: async () => actor,
    });
  await catalog.listen(0, '127.0.0.1');
  const upstream = await catalog.getUrl(),
    gateway = await gatewayApplication(httpConfig('gateway', {}), {
      catalog: upstream,
      identity: upstream,
      media: upstream,
      inquiries: upstream,
    });
  await gateway.listen(0, '127.0.0.1');
  const url = await gateway.getUrl();
  const call = (method: string, path: string, body?: unknown) =>
    fetch(url + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-request-id': 'b4-api-fixture' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const base = '/api/v1/admin/categories';
  try {
    const parent = await category(),
      a = await category(parent.id),
      b = await category(parent.id),
      c = await category(parent.id),
      bearing = await category();
    await product(bearing.id);
    const response = await call('GET', base + '?parentId=' + parent.id + '&limit=1&locale=ckb');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'b4-api-fixture');
    const first = (await response.json()) as CategoryCollectionPage;
    assert.ok(first.nextCursor);
    assert.equal(first.items[0]?.resolvedNameLocale, 'ar');
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0]?.activeChildCount, '0');
    assert.equal(first.items[0]?.activeProductCount, '0');
    assert.equal(first.items[0]?.canAddChildren, true);
    assert.equal(first.items[0]?.canAddProducts, true);
    const countBeforeMalformedTranslation = await database.outboxEvents.count();
    assert.equal(
      (await call('POST', base, { translations: [{ name: 'Missing explicit locale' }] })).status,
      400,
    );
    assert.equal(await database.outboxEvents.count(), countBeforeMalformedTranslation);
    assert.equal('rootRevision' in first, false);
    assert.ok(first.items[0]?.translations.some((t) => t.locale === 'ar'));
    const next = (await (
      await call(
        'GET',
        base + '?parentId=' + parent.id + '&limit=1&locale=ckb&cursor=' + first.nextCursor,
      )
    ).json()) as CategoryCollectionPage;
    assert.notEqual(next.items[0]?.id, first.items[0]?.id);
    for (const query of [
      'cursor=invalid',
      'parentId=' + parent.id + '&locale=en&cursor=' + first.nextCursor,
      'locale=ckb&cursor=' + first.nextCursor,
      'limit=0',
      'limit=101',
      'mode=LEAF',
    ])
      assert.equal((await call('GET', base + '?' + query)).status, 400);
    const detail = (await (await call('GET', base + '/' + parent.id)).json()) as AdminCategoryDto;
    assert.equal(detail.activeChildCount, '3');
    assert.equal(detail.canAddProducts, false);
    const pathFirst = (await (
      await call('GET', base + '/' + a.id + '/breadcrumbs?limit=1')
    ).json()) as BreadcrumbPage;
    assert.equal(pathFirst.items[0]?.id, parent.id);
    assert.ok(pathFirst.nextCursor);
    const pathNext = (await (
      await call('GET', base + '/' + a.id + '/breadcrumbs?limit=1&cursor=' + pathFirst.nextCursor)
    ).json()) as BreadcrumbPage;
    assert.equal(pathNext.items[0]?.id, a.id);
    assert.equal(pathNext.nextCursor, null);
    assert.equal(
      (await call('GET', base + '/' + b.id + '/breadcrumbs?cursor=' + pathFirst.nextCursor)).status,
      400,
    );
    const destinations = (await (
      await call('GET', base + '/' + parent.id + '/move-destinations?limit=100')
    ).json()) as {
      items: AdminCategoryDto[];
      rootDestination: { parentId: null; listRevision: string };
    };
    assert.ok(!destinations.items.some((row) => [parent.id, bearing.id].includes(row.id)));
    assert.equal(destinations.rootDestination.parentId, null);
    assert.equal(
      (await call('GET', base + '/' + parent.id + '/move-destinations?parentId=' + parent.id))
        .status,
      422,
    );
    const before = await navigation.siblings(parent.id, 100),
      orderedIds = [...before].reverse().map((row) => row.id),
      reordered = await call('POST', base + '/reorder', {
        parentId: parent.id,
        orderedIds,
        expectedListRevision: first.listRevision,
      });
    assert.equal(reordered.status, 200);
    assert.equal(
      (
        await call(
          'GET',
          base + '?parentId=' + parent.id + '&locale=ckb&cursor=' + first.nextCursor,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call('POST', base + '/reorder', {
          orderedIds,
          expectedListRevision: await navigation.revision(parent.id),
        })
      ).status,
      400,
    );
    const input = await moveInput(c.id, null),
      moved = await call('POST', base + '/' + c.id + '/move', input);
    assert.equal(moved.status, 200);
    assert.equal(((await moved.json()) as { category: AdminCategoryDto }).category.parentId, null);
    assert.equal(
      (
        await call('PATCH', base + '/' + a.id, {
          expectedVersion: a.version,
          translations: [ar],
          parentId: null,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call('POST', base + '/' + a.id + '/move', {
          ...(await moveInput(a.id, null)),
          beforeId: undefined,
        })
      ).status,
      400,
    );
    const state = (await (
      await call('GET', base + '/' + parent.id + '/deletion-impact')
    ).json()) as DeletionImpact;
    assert.equal(
      (
        await call('DELETE', base + '/' + parent.id, {
          expectedVersion: state.expectedVersion,
          impactRevision: state.impactRevision,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call('DELETE', base + '/' + parent.id, {
          confirmed: true,
          expectedVersion: state.expectedVersion,
          impactRevision: state.impactRevision,
        })
      ).status,
      202,
    );
    for (const route of [
      base + '/' + parent.id,
      base + '/' + a.id,
      base + '/' + a.id + '/breadcrumbs',
      base + '/' + a.id + '/move-destinations',
      '/api/v1/categories/' + a.id,
      '/api/v1/categories?parentId=' + parent.id,
    ])
      assert.equal((await call('GET', route)).status, 404);
    assert.equal(
      (
        await call('DELETE', base + '/' + parent.id, {
          confirmed: true,
          expectedVersion: state.expectedVersion,
          impactRevision: state.impactRevision,
        })
      ).status,
      404,
    );
    assert.equal((await call('GET', '/api/v1/categories/' + c.id)).status, 200);
    assert.equal((await call('POST', '/internal/v1/sessions/introspect', {})).status, 404);
    assert.equal(
      (await call('POST', base + '/reorder', { padding: 'x'.repeat(70000) })).status,
      413,
    );
  } finally {
    await gateway.close();
    await catalog.close();
  }
});
test('cover edits preserve omission/null semantics and reject unverified or wrong-kind assets through deferred integrity', async () => {
  const leaf = await category(),
    p = await product(leaf.id),
    cover = ids.newUuid(),
    registration = await database.$transaction(
      (tx) =>
        tx.mediaAssetRefs.create({
          data: { id: cover, media_kind: 'IMAGE', source_version: 1n, ready_at: new Date() },
        }),
      { isolationLevel: 'Serializable' },
    ),
    target = await new CreateCategory(transactions, ids, clock).execute(
      {
        parentId: null,
        expectedParentVersion: null,
        translations: [ar],
        coverAssetId: registration.id as Uuid,
      },
      actor,
    ),
    edit = new EditCategory(transactions, ids, clock);
  assert.equal((await navigation.detail(target.id, 'ar'))?.coverAssetId, cover);
  const updated = await edit.execute(target.id, target.version, [ar], actor);
  assert.equal((await navigation.detail(target.id, 'ar'))?.coverAssetId, cover);
  const cleared = await edit.execute(target.id, updated.version, [ar], actor, null);
  assert.equal((await navigation.detail(target.id, 'ar'))?.coverAssetId, null);
  await assert.rejects(
    edit.execute(target.id, cleared.version, [ar], actor, p.assetId),
    isCode('INVALID_STATE'),
  );
  const count = await database.outboxEvents.count();
  await assert.rejects(
    edit.execute(target.id, cleared.version, [ar], actor, ids.newUuid()),
    isCode('INVALID_STATE'),
  );
  assert.equal(await database.outboxEvents.count(), count);
  const pdf = ids.newUuid();
  await database.$transaction(
    (tx) =>
      tx.mediaAssetRefs.create({
        data: { id: pdf, media_kind: 'PDF', source_version: 1n, ready_at: new Date() },
      }),
    { isolationLevel: 'Serializable' },
  );
  await assert.rejects(
    edit.execute(target.id, cleared.version, [ar], actor, pdf),
    isCode('INVALID_STATE'),
  );
});
