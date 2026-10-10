import { createHash, randomUUID } from 'node:crypto';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type {
  AuthenticatedActor,
  DeletionEntity,
  DeletionEvent,
  DeletionImpact,
  DeletionOperation,
  Uuid,
} from '@golden-lift/contracts';
import { retryTransaction } from '@golden-lift/platform';
import type {
  CatalogDeletionRepository,
  CatalogDeletionUnitOfWork,
} from '../../application/ports/deletion.js';
import type { Database, PrismaClient } from './client.js';
import { mapFailure } from './unit-of-work.js';
import { PrismaOutbox } from './outbox.js';

type OperationRow = {
  id: string;
  entity_type: DeletionEntity;
  entity_id: string;
  status: DeletionOperation['status'];
  failure_code: string | null;
  retry_count: number;
  completed_at: Date | null;
  asset_ids: string[];
  owner_ids: string[];
};
const count = (type: string, n: number | bigint) => ({ type, count: String(n) });
function dto(row: OperationRow): DeletionOperation {
  return {
    id: uuid(row.id),
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    failureCode: row.failure_code,
    retryCount: row.retry_count,
    completedAt: row.completed_at?.toISOString() ?? null,
  };
}
function impact(
  type: DeletionEntity,
  id: string,
  name: string,
  v: bigint,
  state: unknown,
  deletes: DeletionImpact['cascadingDeletes'],
  blockers: DeletionImpact['blockingDependencies'] = [],
  unaffected: DeletionImpact['unaffectedEntities'] = [],
  warnings: string[] = [],
): DeletionImpact {
  return {
    entity: { id, type, displayName: name },
    permanent: true,
    allowed: blockers.length === 0,
    expectedVersion: version(String(v)),
    impactRevision:
      'd1-' +
      createHash('sha256')
        .update(
          JSON.stringify({ type, id, state }, (_, x: unknown) =>
            typeof x === 'bigint' ? String(x) : x,
          ),
        )
        .digest('hex'),
    cascadingDeletes: deletes,
    blockingDependencies: blockers,
    detachedReferences: [],
    unaffectedEntities: unaffected,
    warnings: [...warnings, 'This action is permanent and cannot be undone.'],
  };
}

export class PrismaCatalogDeletionRepository implements CatalogDeletionRepository {
  constructor(private readonly db: Database) {}
  append(event: Parameters<CatalogDeletionRepository['append']>[0]) {
    return new PrismaOutbox(this.db).append(event);
  }
  async rejectMedia(event: Parameters<CatalogDeletionRepository['rejectMedia']>[0]) {
    const seen = await this.db.inboxMessages.findUnique({
      where: {
        consumer_name_message_id: {
          consumer_name: 'catalog-direct-media-deletion-v1',
          message_id: event.id,
        },
      },
    });
    if (seen) return;
    const result: DeletionEvent = {
      schemaVersion: 1,
      id: uuid(randomUUID()),
      operationId: event.operationId,
      producer: 'catalog',
      type: 'catalog.media.delete.rejected.v1',
      assetIds: [event.assetId],
    };
    await this.db.outboxEvents.create({
      data: {
        id: result.id,
        aggregate_type: 'DeletionOperation',
        aggregate_id: result.operationId,
        event_type: result.type,
        payload: { ...result, assetIds: [...result.assetIds] },
      },
    });
    await this.db.inboxMessages.create({
      data: { consumer_name: 'catalog-direct-media-deletion-v1', message_id: event.id },
    });
  }
  private async pending(type: DeletionEntity, id: string) {
    const rows = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM ops.deletion_operations WHERE entity_type=${type} AND entity_id=${id} AND completed_at IS NULL`;
    if (rows.length)
      throw new ApplicationError(
        'DELETE_ALREADY_IN_PROGRESS',
        'Deletion is already in progress; check its operation status.',
      );
  }
  async productImpact(id: Uuid) {
    await this.pending('PRODUCT', id);
    const p = await this.db.products.findFirst({
      where: { id, deleted_at: null },
      include: {
        product_translations: true,
        product_media_product_media_product_idToproducts: {
          include: { media_asset_refs: true, product_media_translations: true },
        },
        product_specification_values: {
          include: { product_specification_texts: true, product_specification_choices: true },
        },
        product_code_reservations_product_code_reservations_product_idToproducts: true,
        product_technical_sheets: { include: { product_technical_configurations: true } },
      },
    });
    if (!p) throw new ApplicationError('NOT_FOUND', 'Product not found.');
    const media = p.product_media_product_media_product_idToproducts.filter(
      (m) => m.deleted_at === null,
    );
    const owned = await this.mediaOwnership(
      media.map((m) => uuid(m.asset_id)),
      'PRODUCT',
      [id],
    );
    const name = p.product_translations.find((t) => t.locale === 'ar' && !t.deleted_at)?.name ?? id;
    return impact(
      'PRODUCT',
      id,
      name,
      p.version,
      { p, owned },
      [
        count('specification values', p.product_specification_values.length),
        count('translations', p.product_translations.length),
        ...['IMAGE', 'VIDEO', 'PDF'].map((kind) =>
          count(
            kind,
            new Set(
              media.filter((m) => m.media_asset_refs.media_kind === kind).map((m) => m.asset_id),
            ).size,
          ),
        ),
        count(
          'model codes',
          p.product_code_reservations_product_code_reservations_product_idToproducts.length,
        ),
        count('technical sheet links', p.product_technical_sheets.length),
      ],
      owned.length ? [count('shared Media requiring owner-copy migration', owned.length)] : [],
      ['Category', 'Attributes', 'Attribute Groups', 'Units', 'shared technical sheets'].map(
        (type) => ({ type }),
      ),
    );
  }
  private async mediaOwnership(ids: Uuid[], type: 'PRODUCT' | 'CATEGORY', owners: Uuid[]) {
    if (!ids.length) return [];
    const rows = await this.db.$queryRaw<
      { asset_id: string; owner_type: string; owner_id: string | null }[]
    >`SELECT asset_id::text,owner_type,owner_id::text FROM catalog.active_asset_usage WHERE asset_id=ANY(${ids}::uuid[]) AND (owner_type<>${type} OR NOT(owner_id=ANY(${owners}::uuid[]))) ORDER BY asset_id,owner_type,owner_id`;
    return rows;
  }
  async mediaImpact(id: Uuid) {
    await this.pending('MEDIA', id);
    const asset = await this.db.mediaAssetRefs.findUnique({ where: { id } });
    if (!asset)
      return impact('MEDIA', id, id, 1n, { unregistered: true }, [
        count('Media assets and all stored files', 1),
      ]);
    if (asset.deletion_pending)
      throw new ApplicationError(
        'DELETE_ALREADY_IN_PROGRESS',
        'Media deletion is already in progress.',
      );
    if (asset.deleted_at) throw new ApplicationError('NOT_FOUND', 'Media registration not found.');
    const products = await this.db.productMedia.findMany({
      where: { asset_id: id },
      include: {
        products_product_media_product_idToproducts: { include: { product_translations: true } },
        product_media_translations: true,
      },
    });
    const categories = await this.db.categories.findMany({
      where: { cover_asset_id: id },
      include: { category_translations: true },
    });
    const other = await this.db.$queryRaw<
      { owner_type: string; owner_id: string | null }[]
    >`SELECT owner_type,owner_id::text FROM catalog.active_asset_usage WHERE asset_id=${id}::uuid AND owner_type NOT IN ('PRODUCT','CATEGORY') ORDER BY owner_type,owner_id`;
    const covers =
      products.filter((m) => m.products_product_media_product_idToproducts.cover_media_id === m.id)
        .length + categories.length;
    const ownerIds = new Set([
      ...products
        .filter((m) => !m.deleted_at && !m.products_product_media_product_idToproducts.deleted_at)
        .map((m) => 'PRODUCT:' + m.product_id),
      ...categories.filter((c) => !c.deleted_at).map((c) => 'CATEGORY:' + c.id),
    ]);
    const blockers = other.length
      ? [count('other retained media holders', other.length)]
      : ownerIds.size > 1
        ? [count('shared owners requiring owner-copy migration', ownerIds.size)]
        : [];
    const retainedCovers =
      products.filter(
        (m) =>
          m.products_product_media_product_idToproducts.deleted_at &&
          m.products_product_media_product_idToproducts.cover_media_id === m.id,
      ).length + categories.filter((c) => c.deleted_at).length;
    if (retainedCovers)
      blockers.push(
        count('immutable historical covers requiring compatibility migration', retainedCovers),
      );
    return impact(
      'MEDIA',
      id,
      asset.media_kind + ' ' + id,
      asset.version,
      { asset, products, categories, other },
      [
        count('Media assets and all stored files', 1),
        count('gallery references', products.length),
        count('cover assignments', covers),
      ],
      blockers,
      [{ type: 'owning Product/Category' }],
      covers
        ? [
            'This Media is used as a cover; deletion clears the cover and unpublishes a Product requiring it.',
          ]
        : [],
    );
  }
  async attributeImpact(id: Uuid) {
    const d = await this.db.specificationDefinitions.findFirst({
      where: { id, deleted_at: null },
      include: {
        specification_translations: true,
        specification_options: { include: { specification_option_translations: true } },
        product_specification_values: {
          include: { product_specification_texts: true, product_specification_choices: true },
        },
      },
    });
    if (!d) throw new ApplicationError('NOT_FOUND', 'Attribute not found.');
    const links = await this.db.$queryRaw<
      { id: string; group_id: string; version: bigint }[]
    >`SELECT id::text,group_id::text,version FROM catalog.attribute_group_attributes WHERE definition_id=${id}::uuid ORDER BY id`;
    const technical = await this.db.technicalMeasurements.findMany({
      where: { definition_id: id },
      select: { id: true, version: true },
    });
    const [legacy] = await this.db.$queryRaw<
      { dependency_count: bigint; dependency_revision: string }[]
    >`SELECT * FROM catalog.retained_deletion_dependencies('ATTRIBUTE',${id}::uuid)`;
    const blockers = [
      ...(technical.length ? [count('retained technical measurements', technical.length)] : []),
      ...((legacy?.dependency_count ?? 0n)
        ? [
            count(
              'retained legacy type assignments requiring compatibility migration',
              legacy?.dependency_count ?? 0n,
            ),
          ]
        : []),
    ];
    return impact(
      'ATTRIBUTE',
      id,
      d.code,
      d.version,
      { d, links, technical, legacy },
      [
        count('Product specification values', d.product_specification_values.length),
        count('Group memberships', links.length),
        count(
          'affected Products',
          new Set(d.product_specification_values.map((v) => v.product_id)).size,
        ),
      ],
      blockers,
      ['Products', 'Attribute Groups', 'Categories', 'Unit'].map((type) => ({ type })),
      blockers.length
        ? [
            'Retained documentation and legacy assignments need an explicit migration before their definition can be deleted.',
          ]
        : [],
    );
  }
  private async groupValues(id: Uuid) {
    return this.db.$queryRaw<
      { id: string; product_id: string; definition_id: string; version: bigint }[]
    >`
      SELECT v.id::text,v.product_id::text,v.definition_id::text,v.version FROM catalog.product_specification_values v JOIN catalog.products p ON p.id=v.product_id
      WHERE EXISTS(SELECT 1 FROM catalog.category_attribute_groups c JOIN catalog.attribute_group_attributes a ON a.group_id=c.group_id WHERE c.category_id=p.category_id AND c.group_id=${id}::uuid AND c.deleted_at IS NULL AND a.definition_id=v.definition_id AND a.deleted_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM catalog.category_attribute_groups c JOIN catalog.specification_groups g ON g.id=c.group_id JOIN catalog.attribute_group_attributes a ON a.group_id=g.id JOIN catalog.specification_definitions d ON d.id=a.definition_id WHERE c.category_id=p.category_id AND c.group_id<>${id}::uuid AND c.deleted_at IS NULL AND g.deleted_at IS NULL AND a.deleted_at IS NULL AND d.deleted_at IS NULL AND a.definition_id=v.definition_id) ORDER BY v.id`;
  }
  async groupImpact(id: Uuid) {
    const g = await this.db.specificationGroups.findFirst({
      where: { id, deleted_at: null },
      include: { specification_group_translations: true },
    });
    if (!g) throw new ApplicationError('NOT_FOUND', 'Attribute Group not found.');
    const categories = await this.db.$queryRaw<
      { category_id: string }[]
    >`SELECT category_id::text FROM catalog.category_attribute_groups WHERE group_id=${id}::uuid AND deleted_at IS NULL ORDER BY category_id`;
    const links = await this.db.$queryRaw<
      { id: string; version: bigint }[]
    >`SELECT id::text,version FROM catalog.attribute_group_attributes WHERE group_id=${id}::uuid ORDER BY id`;
    const categoryIds = categories.map((c) => c.category_id);
    const remaining = await this.db.$queryRaw<
      { id: string; version: bigint }[]
    >`SELECT a.id::text,a.version FROM catalog.attribute_group_attributes a WHERE a.group_id IN (SELECT group_id FROM catalog.category_attribute_groups WHERE category_id=ANY(${categoryIds}::uuid[]) AND deleted_at IS NULL) ORDER BY a.id`;
    const catState = await this.db.categories.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, version: true },
    });
    const products = await this.db.products.findMany({
      where: { category_id: { in: categoryIds } },
      select: { id: true, version: true },
    });
    const values = await this.groupValues(id);
    const children = await this.db.productSpecificationValues.findMany({
      where: { id: { in: values.map((v) => v.id) } },
      include: { product_specification_choices: true, product_specification_texts: true },
    });
    const [legacy] = await this.db.$queryRaw<
      { dependency_count: bigint; dependency_revision: string }[]
    >`SELECT * FROM catalog.retained_deletion_dependencies('ATTRIBUTE_GROUP',${id}::uuid)`;
    return impact(
      'ATTRIBUTE_GROUP',
      id,
      g.code,
      g.version,
      { g, links, remaining, catState, products, children, legacy },
      [
        count('Category assignments', categories.length),
        count('Attribute memberships', links.length),
        count('affected Products', products.length),
        count('newly unreachable Product values', values.length),
      ],
      (legacy?.dependency_count ?? 0n)
        ? [
            count(
              'retained legacy Group assignments requiring compatibility migration',
              legacy?.dependency_count ?? 0n,
            ),
          ]
        : [],
      [
        'Attributes',
        'Products',
        'Categories',
        'Units',
        'values reachable through another Group',
      ].map((type) => ({ type })),
    );
  }
  async unitImpact(code: string) {
    const u = await this.db.units.findFirst({
      where: { code, deleted_at: null },
      include: {
        unit_translations: true,
        specification_definitions: { select: { id: true, version: true, code: true } },
      },
    });
    if (!u) throw new ApplicationError('NOT_FOUND', 'Unit not found.');
    return impact(
      'UNIT',
      code,
      u.symbol,
      u.version,
      u,
      [count('Unit translations', u.unit_translations.length)],
      u.specification_definitions.length
        ? [
            {
              type: 'Attributes',
              count: String(u.specification_definitions.length),
              examples: u.specification_definitions
                .slice(0, 5)
                .map((d) => ({ id: d.id, displayName: d.code })),
            },
          ]
        : [],
      [{ type: 'Attributes' }],
      u.specification_definitions.length
        ? ['Change or remove Unit references from the listed Attributes first.']
        : [],
    );
  }
  private async tree(id: Uuid) {
    return this.db.$queryRaw<
      {
        id: string;
        depth: number;
        version: bigint;
        cover_asset_id: string | null;
        deleted_at: Date | null;
      }[]
    >`WITH RECURSIVE tree AS (SELECT id,0 depth,version,cover_asset_id,deleted_at FROM catalog.categories WHERE id=${id}::uuid UNION ALL SELECT c.id,t.depth+1,c.version,c.cover_asset_id,c.deleted_at FROM catalog.categories c JOIN tree t ON c.parent_id=t.id) SELECT id::text,depth,version,cover_asset_id::text,deleted_at FROM tree ORDER BY depth DESC,id`;
  }
  async categoryImpact(id: Uuid) {
    await this.pending('CATEGORY', id);
    const c = await this.db.categories.findFirst({
      where: { id, deleted_at: null },
      include: { category_translations: true },
    });
    if (!c) throw new ApplicationError('NOT_FOUND', 'Category not found.');
    const tree = await this.tree(id),
      ids = tree.map((t) => t.id);
    const products = await this.db.products.findMany({
      where: { category_id: { in: ids } },
      select: { id: true, category_id: true, version: true },
    });
    const translations = await this.db.categoryTranslations.findMany({
      where: { category_id: { in: ids } },
    });
    const groups = await this.db.$queryRaw<
      { id: string; version: bigint }[]
    >`SELECT id::text,version FROM catalog.category_attribute_groups WHERE category_id=ANY(${ids}::uuid[]) ORDER BY id`;
    const owned = await this.mediaOwnership(
      tree.flatMap((t) => (t.cover_asset_id ? [uuid(t.cover_asset_id)] : [])),
      'CATEGORY',
      ids.map(uuid),
    );
    const blockers: DeletionImpact['blockingDependencies'][number][] = [];
    for (const categoryId of [...new Set(products.map((p) => p.category_id))]) {
      const label =
        translations.find((t) => t.category_id === categoryId && t.locale === 'ar' && !t.deleted_at)
          ?.name ?? categoryId;
      blockers.push({
        type: 'Products in ' + label,
        count: String(products.filter((p) => p.category_id === categoryId).length),
        examples: products
          .filter((p) => p.category_id === categoryId)
          .slice(0, 5)
          .map((p) => ({ id: p.id, displayName: p.id })),
      });
    }
    if (owned.length)
      blockers.push(count('shared Category Media requiring owner-copy migration', owned.length));
    const historicalCovers = tree.filter((t) => t.cover_asset_id && t.deleted_at).length;
    if (historicalCovers)
      blockers.push(
        count(
          'immutable historical Category covers requiring compatibility migration',
          historicalCovers,
        ),
      );
    return impact(
      'CATEGORY',
      id,
      c.category_translations.find((t) => t.locale === 'ar' && !t.deleted_at)?.name ?? id,
      c.version,
      { c, tree, products, translations, groups, owned },
      [
        count('Categories', tree.length),
        count('Category translations', translations.length),
        count('Category Group assignments', groups.length),
        count(
          'Category-owned Media',
          new Set(tree.flatMap((t) => (t.cover_asset_id ? [t.cover_asset_id] : []))).size,
        ),
      ],
      blockers,
      ['Attribute Groups', 'Attributes', 'Units', 'shared technical sheets'].map((type) => ({
        type,
      })),
      products.length
        ? ['Move Products to another leaf Category or finish deleting them first.']
        : [],
    );
  }
  private async values(ids: string[]) {
    await this.db.productSpecificationChoices.deleteMany({ where: { value_id: { in: ids } } });
    await this.db.productSpecificationTexts.deleteMany({ where: { value_id: { in: ids } } });
    await this.db.productSpecificationValues.deleteMany({ where: { id: { in: ids } } });
  }
  private async touchCategories(ids: string[]) {
    if (ids.length)
      await this.db
        .$executeRaw`UPDATE catalog.categories SET schema_revision=schema_revision+1 WHERE id=ANY(${ids}::uuid[]) AND deleted_at IS NULL AND NOT deletion_pending`;
  }
  async deleteAttribute(id: Uuid) {
    const categories = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT DISTINCT c.category_id::text id FROM catalog.category_attribute_groups c JOIN catalog.attribute_group_attributes a ON a.group_id=c.group_id WHERE a.definition_id=${id}::uuid AND c.deleted_at IS NULL`;
    const vals = await this.db.productSpecificationValues.findMany({
      where: { definition_id: id },
      select: { id: true, product_id: true },
    });
    await this.values(vals.map((v) => v.id));
    await this.db
      .$executeRaw`DELETE FROM catalog.attribute_group_attributes WHERE definition_id=${id}::uuid`;
    await this.db.categorySpecifications.deleteMany({ where: { definition_id: id } });
    await this.db.specificationOptionTranslations.deleteMany({
      where: { specification_options: { definition_id: id } },
    });
    await this.db.specificationOptions.deleteMany({ where: { definition_id: id } });
    await this.db.specificationTranslations.deleteMany({ where: { definition_id: id } });
    await this.db.specificationDefinitions.delete({ where: { id } });
    await this.touchCategories(categories.map((c) => c.id));
    await this.db.products.updateMany({
      where: {
        id: { in: vals.map((v) => v.product_id) },
        deleted_at: null,
        deletion_pending: false,
      },
      data: { updated_at: new Date() },
    });
  }
  async deleteGroup(id: Uuid) {
    const categories = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT category_id::text id FROM catalog.category_attribute_groups WHERE group_id=${id}::uuid AND deleted_at IS NULL`;
    const vals = await this.groupValues(id);
    await this.values(vals.map((v) => v.id));
    await this.db
      .$executeRaw`DELETE FROM catalog.category_attribute_groups WHERE group_id=${id}::uuid`;
    await this.db
      .$executeRaw`DELETE FROM catalog.attribute_group_attributes WHERE group_id=${id}::uuid`;
    await this.db.specificationGroupTranslations.deleteMany({ where: { group_id: id } });
    await this.db.specificationGroups.delete({ where: { id } });
    await this.touchCategories(categories.map((c) => c.id));
    await this.db.products.updateMany({
      where: {
        id: { in: vals.map((v) => v.product_id) },
        deleted_at: null,
        deletion_pending: false,
      },
      data: { updated_at: new Date() },
    });
  }
  async deleteUnit(code: string) {
    await this.db.unitTranslations.deleteMany({ where: { unit_code: code } });
    await this.db.units.delete({ where: { code } });
  }
  async operation(id: Uuid) {
    const [row] = await this.db.$queryRaw<
      OperationRow[]
    >`SELECT * FROM ops.deletion_operations WHERE id=${id}::uuid`;
    if (!row) throw new ApplicationError('NOT_FOUND', 'Deletion operation not found.');
    return dto(row);
  }
  private async start(
    type: 'PRODUCT' | 'CATEGORY' | 'MEDIA',
    id: Uuid,
    op: Uuid,
    actor: AuthenticatedActor,
    assets: string[],
    owners: string[],
  ) {
    assets = [...new Set(assets)];
    if (assets.length > 1000)
      throw new ApplicationError(
        'INVALID_STATE',
        'Deletion exceeds the reviewed 1000-asset operation bound.',
      );
    await this.db
      .$executeRaw`INSERT INTO ops.deletion_operations(id,entity_type,entity_id,requested_by,status,asset_ids,owner_ids) VALUES(${op}::uuid,${type},${id},${actor.id}::uuid,'MEDIA_CLEANUP',${assets}::uuid[],${owners}::uuid[])`;
    if (assets.length) {
      await this.db.mediaAssetRefs.updateMany({
        where: { id: { in: assets }, deleted_at: null },
        data: { deletion_pending: true, security_blocked: true },
      });
      const event: DeletionEvent = {
        schemaVersion: 1,
        id: uuid(randomUUID()),
        operationId: op,
        producer: 'catalog',
        type: 'catalog.media.delete.requested.v1',
        assetIds: assets.map(uuid),
      };
      await this.db.outboxEvents.create({
        data: {
          id: event.id,
          aggregate_type: 'DeletionOperation',
          aggregate_id: op,
          event_type: event.type,
          payload: { ...event, assetIds: [...event.assetIds] },
        },
      });
    } else await this.finalize(op);
    return this.operation(op);
  }
  private async gallery(productIds: string[]) {
    await this.db.productMediaTranslations.deleteMany({
      where: { product_media: { product_id: { in: productIds } } },
    });
    await this.db.productMedia.deleteMany({ where: { product_id: { in: productIds } } });
  }
  async deleteProduct(id: Uuid, op: Uuid, actor: AuthenticatedActor) {
    const rows = await this.db.productMedia.findMany({
      where: { product_id: id, deleted_at: null },
      select: { asset_id: true },
    });
    await this.db.products.update({
      where: { id },
      data: {
        deletion_pending: true,
        is_active: false,
        cover_media_id: null,
        current_model_code_id: null,
      },
    });
    await this.gallery([id]);
    return this.start(
      'PRODUCT',
      id,
      op,
      actor,
      rows.map((r) => r.asset_id),
      [id],
    );
  }
  async deleteMedia(id: Uuid, op: Uuid, actor: AuthenticatedActor) {
    const rows = await this.db.productMedia.findMany({
      where: { asset_id: id },
      select: { id: true, product_id: true },
    });
    const coverIds = rows.map((r) => r.id);
    await this.db.products.updateMany({
      where: { cover_media_id: { in: coverIds }, deleted_at: null },
      data: { cover_media_id: null, is_active: false },
    });
    await this.db.categories.updateMany({
      where: { cover_asset_id: id, deleted_at: null },
      data: { cover_asset_id: null },
    });
    // Retained deleted owner rows cannot be updated; nullable cover FKs are deferred and are cleared only by reviewed migration/finalization.
    const retained = await this.db.products.count({
      where: { cover_media_id: { in: coverIds }, deleted_at: { not: null } },
    });
    if (retained)
      throw new ApplicationError(
        'INVALID_STATE',
        'Retained deleted Product cover requires reviewed compatibility migration.',
      );
    await this.db.productMediaTranslations.deleteMany({
      where: { product_media_id: { in: coverIds } },
    });
    await this.db.productMedia.deleteMany({ where: { asset_id: id } });
    return this.start('MEDIA', id, op, actor, [id], []);
  }
  async deleteCategoryTree(id: Uuid, op: Uuid, actor: AuthenticatedActor) {
    const tree = await this.tree(id),
      ids = tree.map((t) => t.id);
    if (await this.db.products.count({ where: { category_id: { in: ids } } }))
      throw new ApplicationError(
        'DELETE_BLOCKED_BY_PRODUCTS',
        'Products anywhere in the subtree block deletion.',
      );
    if (
      await this.db.categories.count({
        where: { id: { in: ids }, deleted_at: { not: null }, cover_asset_id: { not: null } },
      })
    )
      throw new ApplicationError(
        'INVALID_STATE',
        'Retained deleted Category covers require reviewed compatibility migration.',
      );
    await this.db.categories.updateMany({
      where: { id: { in: ids }, deleted_at: null },
      data: { deletion_pending: true, cover_asset_id: null },
    });
    return this.start(
      'CATEGORY',
      id,
      op,
      actor,
      tree.flatMap((t) => (t.cover_asset_id ? [t.cover_asset_id] : [])),
      ids,
    );
  }
  private async finalize(op: Uuid) {
    const [row] = await this.db.$queryRaw<
      OperationRow[]
    >`SELECT * FROM ops.deletion_operations WHERE id=${op}::uuid FOR UPDATE`;
    if (!row || row.status === 'COMPLETED') return;
    if (row.entity_type === 'PRODUCT') {
      const id = row.entity_id;
      await this.values(
        (
          await this.db.productSpecificationValues.findMany({
            where: { product_id: id },
            select: { id: true },
          })
        ).map((v) => v.id),
      );
      await this.db.productTechnicalConfigurations.deleteMany({
        where: { product_technical_sheets: { product_id: id } },
      });
      await this.db.productTechnicalSheets.deleteMany({ where: { product_id: id } });
      await this.db.productTranslations.deleteMany({ where: { product_id: id } });
      await this.db.productCodeReservations.deleteMany({ where: { product_id: id } });
      await this.db.products.delete({ where: { id } });
    } else if (row.entity_type === 'CATEGORY') {
      const ids = row.owner_ids;
      if (await this.db.products.count({ where: { category_id: { in: ids } } }))
        throw new ApplicationError(
          'DELETE_BLOCKED_BY_PRODUCTS',
          'Category deletion cannot finalize while Products exist.',
        );
      await this.db
        .$executeRaw`DELETE FROM catalog.category_attribute_groups WHERE category_id=ANY(${ids}::uuid[])`;
      await this.db.categorySpecifications.deleteMany({ where: { category_id: { in: ids } } });
      await this.db.categoryTechnicalSheets.deleteMany({ where: { category_id: { in: ids } } });
      await this.db.categoryTranslations.deleteMany({ where: { category_id: { in: ids } } });
      for (const id of ids) await this.db.categories.delete({ where: { id } });
    }
    await this.db.mediaAssetRefs.deleteMany({ where: { id: { in: row.asset_ids } } });
    await this.db
      .$executeRaw`UPDATE ops.deletion_operations SET status='COMPLETED',completed_at=clock_timestamp(),failure_code=NULL WHERE id=${op}::uuid`;
  }
  async complete(event: DeletionEvent) {
    if (
      event.producer !== 'media' ||
      !['media.delete.completed.v1', 'media.delete.failed.v1'].includes(event.type)
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Unexpected deletion result.');
    const seen = await this.db.inboxMessages.findUnique({
      where: {
        consumer_name_message_id: { consumer_name: 'catalog-deletion-v1', message_id: event.id },
      },
    });
    if (seen) return;
    const [row] = await this.db.$queryRaw<
      OperationRow[]
    >`SELECT * FROM ops.deletion_operations WHERE id=${event.operationId}::uuid FOR UPDATE`;
    if (!row || [...row.asset_ids].sort().join(',') !== [...event.assetIds].sort().join(','))
      throw new ApplicationError(
        'INVALID_STATE',
        'Deletion result does not match the accepted operation.',
      );
    if (event.type === 'media.delete.failed.v1') {
      await this.db.deletionOperations.updateMany({
        where: { id: event.operationId, status: { not: 'COMPLETED' } },
        data: {
          status: 'RETRYABLE',
          failure_code: 'MEDIA_DELETE_FAILED',
          retry_count: { increment: 1 },
        },
      });
    } else await this.finalize(event.operationId);
    await this.db.inboxMessages.create({
      data: { consumer_name: 'catalog-deletion-v1', message_id: event.id },
    });
  }
}

export class PrismaCatalogDeletionUnitOfWork implements CatalogDeletionUnitOfWork {
  constructor(private readonly db: PrismaClient) {}
  async execute<T>(work: (r: CatalogDeletionRepository) => Promise<T>): Promise<T> {
    try {
      return await retryTransaction(
        () =>
          this.db.$transaction(
            async (tx) => {
              await tx.$executeRaw`SET LOCAL lock_timeout='3s'`;
              await tx.$executeRaw`SET LOCAL statement_timeout='10s'`;
              return work(new PrismaCatalogDeletionRepository(tx));
            },
            { isolationLevel: 'Serializable', timeout: 15000, maxWait: 3000 },
          ),
        3,
      );
    } catch (error) {
      throw mapFailure(error);
    }
  }
}
