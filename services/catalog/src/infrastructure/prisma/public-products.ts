import { ApplicationError, uuid } from '@golden-lift/contracts';
import type { Locale, PublicProductMedia, PublicProductQuery, Uuid } from '@golden-lift/contracts';
import { Prisma } from './generated/client.js';
import type { Database } from './client.js';

// Catalog-local visibility. Delivery still makes a fresh Media/Catalog authorization decision.
const eligible = Prisma.sql`p.is_active AND EXISTS (
  SELECT 1 FROM catalog.product_media cover JOIN catalog.media_asset_refs a ON a.id=cover.asset_id
  WHERE cover.id=p.cover_media_id AND cover.product_id=p.id AND cover.deleted_at IS NULL
    AND a.media_kind='IMAGE' AND a.ready_at IS NOT NULL AND a.deleted_at IS NULL AND NOT a.security_blocked)`;
const publicField = Prisma.sql`d.deleted_at IS NULL AND d.is_public  AND a.is_public`;
function scope(input: PublicProductQuery) {
  return Prisma.sql`${eligible}
    ${input.categoryId ? Prisma.sql`AND p.category_id=${input.categoryId}::uuid` : Prisma.empty}
`;
}
const literalPattern = (value: string) => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';

export class PrismaPublicProducts {
  constructor(private readonly tx: Database) {}
  async navigation(id: Uuid, language: Locale) {
    const breadcrumbs = await this.tx.$queryRaw<
      { id: string; name: string }[]
    >`WITH RECURSIVE path AS(SELECT c.id,c.parent_id,0 depth FROM catalog.live_categories c JOIN catalog.live_products p ON p.category_id=c.id WHERE p.id=${id}::uuid UNION ALL SELECT c.id,c.parent_id,path.depth+1 FROM catalog.live_categories c JOIN path ON path.parent_id=c.id) SELECT path.id::text,coalesce(t.name,ar.name,'') name FROM path LEFT JOIN catalog.category_translations t ON t.category_id=path.id AND t.locale=${language} AND t.deleted_at IS NULL LEFT JOIN catalog.category_translations ar ON ar.category_id=path.id AND ar.locale='ar' AND ar.deleted_at IS NULL ORDER BY depth DESC LIMIT 501`;
    if (breadcrumbs.length > 500)
      throw new ApplicationError('INVALID_STATE', 'Public category path exceeds response bounds.');
    const neighbors = await this.tx.$queryRaw<{ previous: string | null; next: string | null }[]>(
      Prisma.sql`WITH ordered AS(SELECT p.id,lag(p.id) OVER(ORDER BY p.sort_order,p.id)::text previous,lead(p.id) OVER(ORDER BY p.sort_order,p.id)::text next FROM catalog.live_products p WHERE p.category_id=(SELECT category_id FROM catalog.live_products WHERE id=${id}::uuid) AND ${eligible}) SELECT previous,next FROM ordered WHERE id=${id}::uuid`,
    );
    const name = async (key: string | null) => {
      if (!key) return null;
      const [row] = await this.tx.$queryRaw<
        { name: string }[]
      >`SELECT coalesce(t.name,ar.name,'') name FROM catalog.live_products p LEFT JOIN catalog.product_translations t ON t.product_id=p.id AND t.locale=${language} AND t.deleted_at IS NULL LEFT JOIN catalog.product_translations ar ON ar.product_id=p.id AND ar.locale='ar' AND ar.deleted_at IS NULL WHERE p.id=${key}::uuid`;
      return row ? { id: uuid(key), name: row.name } : null;
    };
    return {
      breadcrumbs: breadcrumbs.map((x) => ({ id: uuid(x.id), name: x.name })),
      previous: await name(neighbors[0]?.previous ?? null),
      next: await name(neighbors[0]?.next ?? null),
    };
  }
  async page(input: PublicProductQuery) {
    const conditions: Prisma.Sql[] = [scope(input)];
    if (input.search) {
      const pattern = literalPattern(input.search);
      conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM catalog.product_translations t
        WHERE t.product_id=p.id AND t.deleted_at IS NULL AND t.locale IN (${input.locale},'ar')
          AND (t.name ILIKE ${pattern} OR t.description ILIKE ${pattern}))
        OR EXISTS(SELECT 1 FROM catalog.product_code_reservations c WHERE c.id=p.current_model_code_id AND c.code ILIKE ${pattern})
        OR EXISTS(SELECT 1 FROM catalog.product_specification_values v
          JOIN catalog.category_effective_attributes a ON a.category_id=p.category_id AND a.definition_id=v.definition_id
          JOIN catalog.specification_definitions d ON d.id=v.definition_id
          JOIN catalog.product_specification_texts t ON t.value_id=v.id
          WHERE v.product_id=p.id AND v.deleted_at IS NULL AND ${publicField} AND a.is_searchable
            AND t.deleted_at IS NULL AND t.locale IN (${input.locale},'ar') AND t.text_value ILIKE ${pattern}))`);
    }
    for (const filter of input.filters) {
      const policy = await this.tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT d.id FROM catalog.specification_definitions d JOIN catalog.category_effective_attributes a ON a.definition_id=d.id
        JOIN catalog.categories c ON c.id=a.category_id AND c.deleted_at IS NULL
        WHERE d.id=${filter.definitionId}::uuid AND d.value_type=${filter.kind} AND ${publicField}
          AND d.is_filterable AND a.is_filterable
          ${input.categoryId ? Prisma.sql`AND a.category_id=${input.categoryId}::uuid` : Prisma.empty} LIMIT 1`);
      if (!policy.length)
        throw new ApplicationError(
          'VALIDATION_FAILED',
          'Filter is not public and filterable in this scope.',
        );
      let value: Prisma.Sql;
      switch (filter.kind) {
        case 'NUMBER':
          value = Prisma.sql`TRUE
          ${filter.minimum !== undefined ? Prisma.sql`AND v.number_value >= ${filter.minimum}::numeric` : Prisma.empty}
          ${filter.maximum !== undefined ? Prisma.sql`AND v.number_value <= ${filter.maximum}::numeric` : Prisma.empty}`;
          break;
        case 'BOOLEAN':
          value = Prisma.sql`v.boolean_value=${filter.value}`;
          break;
        case 'TEXT':
          value = Prisma.sql`EXISTS(SELECT 1 FROM catalog.product_specification_texts t
          WHERE t.value_id=v.id AND t.deleted_at IS NULL AND t.locale IN (${input.locale},'ar') AND t.text_value ILIKE ${literalPattern(filter.value)})`;
          break;
        case 'CHOICE':
          value = Prisma.sql`EXISTS(SELECT 1 FROM catalog.product_specification_choices c
          WHERE c.value_id=v.id AND c.deleted_at IS NULL AND c.option_id=${filter.optionId}::uuid)`;
          break;
      }
      conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM catalog.product_specification_values v
        JOIN catalog.category_effective_attributes a ON a.category_id=p.category_id AND a.definition_id=v.definition_id
        JOIN catalog.specification_definitions d ON d.id=v.definition_id
        WHERE v.product_id=p.id AND v.definition_id=${filter.definitionId}::uuid AND v.deleted_at IS NULL
          AND ${publicField} AND d.is_filterable AND a.is_filterable AND (${value}))`);
    }
    const order =
      input.sort === 'name'
        ? Prisma.sql`COALESCE((SELECT t.name FROM catalog.product_translations t WHERE t.product_id=p.id AND t.deleted_at IS NULL AND t.locale=${input.locale}),
          (SELECT t.name FROM catalog.product_translations t WHERE t.product_id=p.id AND t.deleted_at IS NULL AND t.locale='ar')), p.id`
        : Prisma.sql`p.is_featured DESC, CASE WHEN p.is_featured THEN p.featured_order ELSE p.sort_order END, p.id`;
    const rows = await this.tx.$queryRaw<
      { id: string }[]
    >(Prisma.sql`SELECT p.id FROM catalog.live_products p
      WHERE ${Prisma.join(conditions, ' AND ')} ORDER BY ${order}
      OFFSET ${(input.page - 1) * input.pageSize} LIMIT ${input.pageSize + 1}`);
    // Facets are scoped to eligible owners, independent of current search/value filters.
    const filters = await this.tx.$queryRaw<
      { id: string }[]
    >(Prisma.sql`SELECT DISTINCT d.id FROM catalog.live_products p
      JOIN catalog.category_effective_attributes a ON a.category_id=p.category_id
      JOIN catalog.specification_definitions d ON d.id=a.definition_id
      WHERE ${scope(input)} AND ${publicField} AND a.is_filterable AND d.is_filterable
        AND d.deprecated_at IS NULL ORDER BY d.id LIMIT 100`);
    return {
      ids: rows.slice(0, input.pageSize).map((r) => uuid(r.id)),
      hasNextPage: rows.length > input.pageSize,
      filterIds: filters.map((r) => uuid(r.id)),
    };
  }
  async context(id: Uuid, language: Locale) {
    const rows = await this.tx.$queryRaw<{ category_name: string; type_name: string }[]>(Prisma.sql`
      SELECT COALESCE((SELECT t.name FROM catalog.category_translations t WHERE t.category_id=p.category_id AND t.locale=${language} AND t.deleted_at IS NULL),
        (SELECT t.name FROM catalog.category_translations t WHERE t.category_id=p.category_id AND t.locale='ar' AND t.deleted_at IS NULL)) category_name
      FROM catalog.live_products p WHERE p.id=${id}::uuid AND ${eligible}`);
    if (!rows[0]) return null;
    const mediaIds = await this.tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT m.id FROM catalog.product_media m JOIN catalog.media_asset_refs a ON a.id=m.asset_id
      JOIN catalog.products p ON p.id=m.product_id
      WHERE m.product_id=${id}::uuid AND m.deleted_at IS NULL AND a.deleted_at IS NULL
        AND a.ready_at IS NOT NULL AND NOT a.security_blocked AND a.media_kind IN ('IMAGE','VIDEO')
      ORDER BY (m.id=p.cover_media_id) DESC,m.sort_order,m.id LIMIT 100`);
    const media = await this.tx.productMedia.findMany({
      where: {
        id: { in: mediaIds.map((m) => m.id) },
        product_id: id,
        deleted_at: null,
        media_asset_refs: {
          deleted_at: null,
          ready_at: { not: null },
          security_blocked: false,
          media_kind: { in: ['IMAGE', 'VIDEO'] },
        },
      },
      include: {
        media_asset_refs: true,
        product_media_translations: {
          where: { deleted_at: null, locale: { in: [language, 'ar'] } },
        },
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    const documents = await this.tx.$queryRaw<
      { asset_id: string; sheet_id: string; title: string }[]
    >(Prisma.sql`
      SELECT DISTINCT u.asset_id,l.sheet_id,COALESCE(
        (SELECT t.title FROM catalog.technical_sheet_translations t WHERE t.sheet_id=l.sheet_id AND t.locale=${language} AND t.deleted_at IS NULL),
        (SELECT t.title FROM catalog.technical_sheet_translations t WHERE t.sheet_id=l.sheet_id AND t.locale='ar' AND t.deleted_at IS NULL),'PDF') title FROM catalog.public_asset_usage u
      JOIN catalog.live_product_technical_sheets l ON l.sheet_id=u.owner_id
      JOIN catalog.technical_sheets s ON s.id=l.sheet_id
      JOIN catalog.media_asset_refs a ON a.id=u.asset_id
      WHERE l.product_id=${id}::uuid AND u.owner_type='TECHNICAL_SOURCE' AND NOT a.security_blocked
      ORDER BY l.sheet_id,u.asset_id LIMIT 100`);
    return {
      categoryName: rows[0].category_name,
      documents: documents.map((d) => ({
        assetId: uuid(d.asset_id),
        sheetId: uuid(d.sheet_id),
        title: d.title,
      })),
      media: media.map((m): PublicProductMedia => {
        const text =
          m.product_media_translations.find((t) => t.locale === language) ??
          m.product_media_translations.find((t) => t.locale === 'ar');
        return {
          assetId: uuid(m.asset_id),
          kind: m.media_asset_refs.media_kind as PublicProductMedia['kind'],
          title: text?.title ?? '',
          altText: text?.alt_text ?? text?.caption ?? '',
        };
      }),
    };
  }
}
