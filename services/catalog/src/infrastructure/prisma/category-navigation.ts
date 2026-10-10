import { createHash } from 'node:crypto';
import { ApplicationError, locales, uuid, version } from '@business-platform/contracts';
import type {
  AdminCategoryDto,
  BranchDeletionImpact,
  CategoryDto,
  Locale,
  Uuid,
} from '@business-platform/contracts';
import type { CategoryNavigation, Sibling } from '../../application/ports/category-tree.js';
import type { CategoryCursor } from '../../application/ports/catalog.js';
import { categoryDto } from './category-repository.js';
import type { Database } from './client.js';
function fingerprint(prefix: 'l' | 'p' | 'b', scope: string, state: string): string {
  return (
    prefix +
    '1-' +
    createHash('sha256')
      .update(scope + '\n' + state)
      .digest('hex')
  );
}
function sibling(row: { id: string; version: bigint; sort_order: bigint }): Sibling {
  return {
    id: uuid(row.id),
    version: version(row.version.toString()),
    sortOrder: row.sort_order.toString(),
  };
}
interface Counts {
  id: string;
  child_count: string;
  product_count: string;
  group_count: string;
}
export class PrismaCategoryNavigation implements CategoryNavigation {
  constructor(private readonly database: Database) {}
  private async readRows(
    rows: readonly Counts[],
    language: Locale,
  ): Promise<readonly AdminCategoryDto[]> {
    if (!rows.length) return [];
    const data = await this.database.categories.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: {
        category_translations: { where: { deleted_at: null }, orderBy: { locale: 'asc' } },
      },
    });
    const byId = new Map(data.map((row) => [row.id, row]));
    return rows.map((counts) => {
      const row = byId.get(counts.id);
      if (!row) throw new ApplicationError('INTERNAL_ERROR', 'Category could not be read.');
      return {
        ...categoryDto(row, language),
        coverAssetId: row.cover_asset_id ? uuid(row.cover_asset_id) : null,
        translations: row.category_translations.map((item) => ({
          locale: item.locale as Locale,
          name: item.name,
          description: item.description,
          slug: item.slug,
          version: version(item.version.toString()),
        })),
        missingTranslationLocales: locales.filter(
          (language) => !row.category_translations.some((item) => item.locale === language),
        ),
        activeChildCount: counts.child_count,
        activeProductCount: counts.product_count,
        canAddChildren: counts.product_count === '0' && counts.group_count === '0',
        canAddProducts: counts.child_count === '0',
      };
    });
  }
  async detail(id: Uuid, language: Locale): Promise<AdminCategoryDto | null> {
    const rows = await this.database.$queryRaw<Counts[]>`SELECT c.id,
      (SELECT count(*)::text FROM catalog.categories x WHERE x.parent_id=c.id AND x.deleted_at IS NULL) child_count,
      (SELECT count(*)::text FROM catalog.products p WHERE p.category_id=c.id AND p.deleted_at IS NULL) product_count,
      (SELECT count(*)::text FROM catalog.category_attribute_groups g WHERE g.category_id=c.id AND g.deleted_at IS NULL) group_count
      FROM catalog.live_categories c WHERE c.id=${id}::uuid`;
    return (await this.readRows(rows, language))[0] ?? null;
  }
  async list(
    parentId: Uuid | null,
    language: Locale,
    limit: number,
    after: CategoryCursor | null,
    movingId: Uuid | null,
  ): Promise<readonly AdminCategoryDto[]> {
    const rows = await this.database.$queryRaw<Counts[]>`WITH RECURSIVE excluded AS (
      SELECT id FROM catalog.categories WHERE id=${movingId}::uuid AND deleted_at IS NULL
      UNION ALL SELECT c.id FROM catalog.categories c JOIN excluded e ON c.parent_id=e.id WHERE c.deleted_at IS NULL)
      SELECT c.id,
      (SELECT count(*)::text FROM catalog.categories x WHERE x.parent_id=c.id AND x.deleted_at IS NULL) child_count,
      (SELECT count(*)::text FROM catalog.products p WHERE p.category_id=c.id AND p.deleted_at IS NULL) product_count,
      (SELECT count(*)::text FROM catalog.category_attribute_groups g WHERE g.category_id=c.id AND g.deleted_at IS NULL) group_count
      FROM catalog.live_categories c WHERE c.parent_id IS NOT DISTINCT FROM ${parentId}::uuid
      AND (${after?.id ?? null}::uuid IS NULL OR (c.sort_order,c.id)>(${after?.sortOrder ?? '0'}::bigint,${after?.id ?? null}::uuid))
      AND (${movingId}::uuid IS NULL OR (NOT EXISTS(SELECT 1 FROM excluded e WHERE e.id=c.id) AND NOT EXISTS(SELECT 1 FROM catalog.products p WHERE p.category_id=c.id AND p.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM catalog.category_attribute_groups g WHERE g.category_id=c.id AND g.deleted_at IS NULL)))
      ORDER BY c.sort_order,c.id LIMIT ${limit}`;
    return this.readRows(rows, language);
  }
  async revision(parentId: Uuid | null): Promise<string> {
    const [row] = await this.database.$queryRaw<{ state: string }[]>`WITH siblings AS (
      SELECT id,version FROM catalog.live_categories WHERE parent_id IS NOT DISTINCT FROM ${parentId}::uuid), state AS (
      SELECT 'c' kind,id,version::text v FROM siblings
      UNION ALL SELECT 't',t.id,t.version::text FROM catalog.category_translations t JOIN siblings s ON s.id=t.category_id WHERE t.deleted_at IS NULL
      UNION ALL SELECT 'p',p.id,p.version::text FROM catalog.products p JOIN siblings s ON s.id=p.category_id WHERE p.deleted_at IS NULL
      UNION ALL SELECT 'parent',id,version::text FROM catalog.live_categories WHERE id=${parentId}::uuid)
      SELECT coalesce(string_agg(kind||':'||id::text||':'||v,',' ORDER BY kind,id),'') state FROM state`;
    return fingerprint('l', parentId ?? 'roots', row?.state ?? '');
  }
  async ancestors(id: Uuid, language: Locale, afterDepth: string, limit: number) {
    const [row] = await this.database.$queryRaw<
      { ids: string[]; depths: string[]; state: string }[]
    >`WITH RECURSIVE chain AS (
      SELECT id,parent_id,version,0::bigint hops FROM catalog.categories WHERE id=${id}::uuid AND deleted_at IS NULL
      UNION ALL SELECT c.id,c.parent_id,c.version,p.hops+1 FROM catalog.categories c JOIN chain p ON c.id=p.parent_id WHERE c.deleted_at IS NULL),
      depths AS (SELECT *,max(hops) OVER ()-hops depth FROM chain), page AS (SELECT * FROM depths WHERE depth>${afterDepth}::bigint ORDER BY depth LIMIT ${limit})
      SELECT coalesce((SELECT array_agg(id::text ORDER BY depth) FROM page),ARRAY[]::text[]) ids,
      coalesce((SELECT array_agg(depth::text ORDER BY depth) FROM page),ARRAY[]::text[]) depths,
      coalesce((SELECT string_agg(id::text||':'||version::text,',' ORDER BY depth) FROM depths),'') state`;
    if (!row) throw new ApplicationError('INTERNAL_ERROR', 'Category path could not be read.');
    const data = await this.database.categories.findMany({
      where: { id: { in: row.ids } },
      include: {
        category_translations: { where: { deleted_at: null, locale: { in: ['ar', language] } } },
      },
    });
    const byId = new Map(data.map((row) => [row.id, row]));
    const items: CategoryDto[] = row.ids.map((id) => {
      const item = byId.get(id);
      if (!item) throw new ApplicationError('INTERNAL_ERROR', 'Category path changed.');
      return categoryDto(item, language);
    });
    return { items, depths: row.depths, revision: fingerprint('p', id, row.state) };
  }
  async isDescendant(id: Uuid, ancestorId: Uuid): Promise<boolean> {
    const [row] = await this.database.$queryRaw<{ found: boolean }[]>`WITH RECURSIVE chain AS (
      SELECT id,parent_id FROM catalog.categories WHERE id=${id}::uuid AND deleted_at IS NULL
      UNION SELECT c.id,c.parent_id FROM catalog.categories c JOIN chain p ON c.id=p.parent_id WHERE c.deleted_at IS NULL)
      SELECT EXISTS(SELECT 1 FROM chain WHERE id=${ancestorId}::uuid) found`;
    return row?.found === true;
  }
  async siblings(parentId: Uuid | null, limit: number): Promise<readonly Sibling[]> {
    return (
      await this.database.categories.findMany({
        where: { parent_id: parentId, deleted_at: null },
        select: { id: true, version: true, sort_order: true },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        take: limit,
      })
    ).map(sibling);
  }
  async placement(parentId: Uuid | null, movingId: Uuid, beforeId: Uuid | null) {
    const select = { id: true, version: true, sort_order: true } as const;
    const next = beforeId
      ? await this.database.categories.findFirst({
          where: { id: beforeId, parent_id: parentId, deleted_at: null },
          select,
        })
      : null;
    if (beforeId && !next)
      throw new ApplicationError(
        'INVALID_STATE',
        'Position anchor is not an active sibling at the destination.',
      );
    const previous = await this.database.categories.findFirst({
      where: {
        parent_id: parentId,
        deleted_at: null,
        id: { not: movingId },
        ...(next
          ? {
              OR: [
                { sort_order: { lt: next.sort_order } },
                { sort_order: next.sort_order, id: { lt: next.id } },
              ],
            }
          : {}),
      },
      select,
      orderBy: [{ sort_order: 'desc' }, { id: 'desc' }],
    });
    const source = await this.database.categories.findFirst({
      where: { id: movingId, deleted_at: null },
      select: { ...select, parent_id: true },
    });
    const currentNext = source
      ? await this.database.categories.findFirst({
          where: {
            parent_id: source.parent_id,
            deleted_at: null,
            OR: [
              { sort_order: { gt: source.sort_order } },
              { sort_order: source.sort_order, id: { gt: source.id } },
            ],
          },
          select: { id: true },
          orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        })
      : null;
    return {
      previous: previous ? sibling(previous) : null,
      next: next ? sibling(next) : null,
      currentNextId: currentNext ? uuid(currentNext.id) : null,
    };
  }
  async deletionState(
    id: Uuid,
  ): Promise<{ readonly impact: BranchDeletionImpact; readonly precondition: string }> {
    const [row] = await this.database.$queryRaw<
      { counts: Record<string, string>; state: string; covers: string }[]
    >`WITH RECURSIVE c AS (
      SELECT id,version,cover_asset_id FROM catalog.categories WHERE id=${id}::uuid AND deleted_at IS NULL
      UNION ALL SELECT x.id,x.version,x.cover_asset_id FROM catalog.categories x JOIN c ON x.parent_id=c.id WHERE x.deleted_at IS NULL),
      p AS (SELECT p.* FROM catalog.products p JOIN c ON c.id=p.category_id WHERE p.deleted_at IS NULL),
      m AS (SELECT m.* FROM catalog.product_media m JOIN p ON p.id=m.product_id WHERE m.deleted_at IS NULL),
      v AS (SELECT v.* FROM catalog.product_specification_values v JOIN p ON p.id=v.product_id WHERE v.deleted_at IS NULL),
      ct AS (SELECT t.* FROM catalog.category_technical_sheets t JOIN c ON c.id=t.category_id WHERE t.deleted_at IS NULL),
      pt AS (SELECT t.* FROM catalog.product_technical_sheets t JOIN p ON p.id=t.product_id WHERE t.deleted_at IS NULL),
      state AS (
      SELECT 'totalCategoryCount' kind,id,version FROM c
      UNION ALL SELECT 'productCount',id,version FROM p
      UNION ALL SELECT 'categoryTranslationCount',t.id,t.version FROM catalog.category_translations t JOIN c ON c.id=t.category_id WHERE t.deleted_at IS NULL
      UNION ALL SELECT 'categorySpecificationCount',s.id,s.version FROM catalog.category_specifications s JOIN c ON c.id=s.category_id WHERE s.deleted_at IS NULL
      UNION ALL SELECT 'categoryTechnicalLinkCount',id,version FROM ct
      UNION ALL SELECT 'productTranslationCount',t.id,t.version FROM catalog.product_translations t JOIN p ON p.id=t.product_id WHERE t.deleted_at IS NULL
      UNION ALL SELECT 'productCodeReservationCount',r.id,r.version FROM catalog.product_code_reservations r JOIN p ON p.id=r.product_id WHERE r.deleted_at IS NULL
      UNION ALL SELECT 'productMediaCount',id,version FROM m
      UNION ALL SELECT 'productMediaTranslationCount',t.id,t.version FROM catalog.product_media_translations t JOIN m ON m.id=t.product_media_id WHERE t.deleted_at IS NULL
      UNION ALL SELECT 'productSpecificationValueCount',id,version FROM v
      UNION ALL SELECT 'productSpecificationTextCount',t.id,t.version FROM catalog.product_specification_texts t JOIN v ON v.id=t.value_id WHERE t.deleted_at IS NULL
      UNION ALL SELECT 'productSpecificationChoiceCount',t.id,t.version FROM catalog.product_specification_choices t JOIN v ON v.id=t.value_id WHERE t.deleted_at IS NULL
      UNION ALL SELECT 'productTechnicalLinkCount',id,version FROM pt
      UNION ALL SELECT 'productTechnicalConfigurationCount',t.id,t.version FROM catalog.product_technical_configurations t JOIN pt ON pt.id=t.product_sheet_id WHERE t.deleted_at IS NULL
      UNION ALL SELECT 'retainedSheet',s.id,s.version FROM catalog.technical_sheets s WHERE s.id IN (SELECT sheet_id FROM ct UNION SELECT sheet_id FROM pt)
      UNION ALL SELECT 'retainedAsset',a.id,a.version FROM catalog.media_asset_refs a WHERE a.id IN (SELECT cover_asset_id FROM c UNION SELECT asset_id FROM m)),
      counts AS (SELECT kind,count(*)::text n FROM state GROUP BY kind)
      SELECT coalesce((SELECT jsonb_object_agg(kind,n) FROM counts),'{}'::jsonb) counts,
      coalesce((SELECT string_agg(kind||':'||id::text||':'||version::text,',' ORDER BY kind,id) FROM state),'') state,
      (SELECT count(*)::text FROM c WHERE cover_asset_id IS NOT NULL) covers`;
    if (!row) throw new ApplicationError('INTERNAL_ERROR', 'Deletion impact could not be read.');
    const count = (key: string) => row.counts[key] ?? '0';
    const total = count('totalCategoryCount');
    const impact: BranchDeletionImpact = {
      totalCategoryCount: total,
      descendantCategoryCount: (BigInt(total) - 1n).toString(),
      productCount: count('productCount'),
      categoryTranslationCount: count('categoryTranslationCount'),
      categorySpecificationCount: count('categorySpecificationCount'),
      categoryCoverCount: row.covers,
      categoryTechnicalLinkCount: count('categoryTechnicalLinkCount'),
      productTranslationCount: count('productTranslationCount'),
      productCodeReservationCount: count('productCodeReservationCount'),
      productMediaCount: count('productMediaCount'),
      productMediaTranslationCount: count('productMediaTranslationCount'),
      productSpecificationValueCount: count('productSpecificationValueCount'),
      productSpecificationTextCount: count('productSpecificationTextCount'),
      productSpecificationChoiceCount: count('productSpecificationChoiceCount'),
      productTechnicalLinkCount: count('productTechnicalLinkCount'),
      productTechnicalConfigurationCount: count('productTechnicalConfigurationCount'),
    };
    const [stage] = await this.database.$queryRaw<
      { expanded: boolean; categoryAuthority: boolean }[]
    >`SELECT to_regprocedure('catalog.assert_valid_category_catalog()') IS NOT NULL AS "categoryAuthority"`;
    let schemaState = '';
    if (stage?.categoryAuthority) {
      const [dependencies] = await this.database.$queryRaw<{ state: string }[]>`
        WITH RECURSIVE branch AS(SELECT id,schema_revision FROM catalog.categories WHERE id=${id}::uuid AND deleted_at IS NULL UNION ALL SELECT c.id,c.schema_revision FROM catalog.categories c JOIN branch b ON c.parent_id=b.id WHERE c.deleted_at IS NULL)
        SELECT coalesce(string_agg(id::text||':'||schema_revision::text,',' ORDER BY id),'') state FROM branch`;
      schemaState = '\n' + (dependencies?.state ?? '');
    }
    return { impact, precondition: fingerprint('b', id, row.state + schemaState) };
  }
}
