import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { CategoryDto, Locale, Uuid, Version } from '@golden-lift/contracts';
import type { CategoryList, CategoryRepository } from '../../application/ports/catalog.js';
import type { Translation } from '../../domain/category.js';
import type { Database } from './client.js';
import type { Prisma } from './generated/client.js';
type CategoryRow = Prisma.CategoriesGetPayload<{ include: { category_translations: true } }>;
function localized(value: string | null | undefined, fallback: string | null): string | null {
  const trimmed = value?.replace(/^ +| +$/g, '');
  return trimmed ? trimmed : fallback;
}
export function categoryDto(row: CategoryRow, locale: Locale): CategoryDto {
  const arabic = row.category_translations.find((t) => t.locale === 'ar');
  const requested = row.category_translations.find((t) => t.locale === locale);
  if (!arabic) throw new ApplicationError('INTERNAL_ERROR', 'Category translation is unavailable.');
  return {
    id: uuid(row.id),
    parentId: row.parent_id ? uuid(row.parent_id) : null,
    name: localized(requested?.name, arabic.name) ?? arabic.name,
    description: localized(requested?.description, arabic.description),
    slug: localized(requested?.slug, arabic.slug),
    locale,
    resolvedNameLocale: requested?.name.replace(/^ +| +$/g, '') ? locale : 'ar',
    sortOrder: row.sort_order.toString(),
    version: version(row.version.toString()),
  };
}
const live = {
  deleted_at: null,
  category_translations: { some: { locale: 'ar', deleted_at: null } },
} satisfies Prisma.CategoriesWhereInput;
const translations = (locale: Locale) => ({
  category_translations: { where: { deleted_at: null, locale: { in: ['ar', locale] } } },
});
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly database: Database) {}
  async find(id: Uuid, locale: Locale): Promise<CategoryDto | null> {
    const visible = await this.database.$queryRaw<
      { id: string }[]
    >`SELECT id FROM catalog.live_categories WHERE id=${id}::uuid`;
    if (!visible.length) return null;
    const row = await this.database.categories.findFirst({
      where: { ...live, id },
      include: translations(locale),
    });
    return row ? categoryDto(row, locale) : null;
  }
  async list(input: CategoryList): Promise<readonly CategoryDto[]> {
    const visible = await this.database.$queryRaw<
      { id: string }[]
    >`SELECT id FROM catalog.live_categories
      WHERE parent_id IS NOT DISTINCT FROM ${input.parentId}::uuid
      AND (${input.after?.id ?? null}::uuid IS NULL OR (sort_order,id)>(${input.after?.sortOrder ?? '0'}::bigint,${input.after?.id ?? null}::uuid))
      ORDER BY sort_order,id LIMIT ${input.limit}`;
    const rows = await this.database.categories.findMany({
      where: {
        ...live,
        id: { in: visible.map((row) => row.id) },
        parent_id: input.parentId,
        ...(input.after
          ? {
              OR: [
                { sort_order: { gt: BigInt(input.after.sortOrder) } },
                { sort_order: BigInt(input.after.sortOrder), id: { gt: input.after.id } },
              ],
            }
          : {}),
      },
      include: translations(input.locale),
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      take: input.limit,
    });
    return rows.map((row) => categoryDto(row, input.locale));
  }
  async hasProducts(id: Uuid): Promise<boolean> {
    return !!(await this.database.products.findFirst({
      where: { category_id: id, deleted_at: null },
      select: { id: true },
    }));
  }
  async touch(id: Uuid, expectedVersion: Version, coverAssetId?: Uuid | null): Promise<Version> {
    const [row] = await this.database.categories.updateManyAndReturn({
      where: { id, version: BigInt(expectedVersion), deleted_at: null },
      data: {
        version: BigInt(expectedVersion),
        ...(coverAssetId === undefined ? {} : { cover_asset_id: coverAssetId }),
      },
      select: { version: true },
    });
    if (!row)
      throw new ApplicationError('VERSION_CONFLICT', 'Category changed; reload it before editing.');
    return version(row.version.toString());
  }
  async insert(id: Uuid, parentId: Uuid | null, coverAssetId: Uuid | null = null): Promise<void> {
    await this.database.categories.create({
      data: { id, parent_id: parentId, cover_asset_id: coverAssetId },
      select: { id: true },
    });
  }
  async putTranslations(id: Uuid, items: readonly Translation[]): Promise<void> {
    // The unit of work has already inserted/touched the root, holding Catalog's private
    // write gate. Preserve partial live uniqueness without a preview Prisma feature.
    for (const item of items) {
      const existing = await this.database.categoryTranslations.findFirst({
        where: { category_id: id, locale: item.locale, deleted_at: null },
        select: { id: true },
      });
      const data = { name: item.name, description: item.description, slug: item.slug };
      if (existing)
        await this.database.categoryTranslations.update({
          where: { id: existing.id },
          data,
          select: { id: true },
        });
      else
        await this.database.categoryTranslations.create({
          data: { category_id: id, locale: item.locale, ...data },
          select: { id: true },
        });
    }
  }
}
