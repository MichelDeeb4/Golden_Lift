import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type {
  AttributeValue,
  CatalogTranslation,
  ProductAttributeValue,
  ProductDto,
  Uuid,
  Version,
} from '@golden-lift/contracts';
import type {
  ProductCreate,
  ProductRepository,
  ProductWrite,
} from '../../application/ports/products.js';
import type { Database } from './client.js';
import type { Prisma } from './generated/client.js';
import { missing, names } from './configuration-mapping.js';
import { PrismaProductTypeRepository } from './product-type-repository.js';
const include = {
  product_translations: { where: { deleted_at: null } },
  product_types: true,
  product_media_products_id_cover_media_idToproduct_media: true,
  product_code_reservations_products_id_current_model_code_idToproduct_code_reservations: true,
  product_specification_values: {
    where: { deleted_at: null },
    include: {
      product_specification_texts: { where: { deleted_at: null } },
      product_specification_choices: { where: { deleted_at: null } },
    },
  },
} as const;
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly db: Database) {}
  async find(id: Uuid): Promise<ProductDto | null> {
    const live = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM catalog.live_products WHERE id=${id}::uuid`;
    if (!live.length) return null;
    const row = await this.db.products.findUnique({ where: { id }, include });
    if (!row?.product_type_id || !row.product_types) return null;
    return this.dto(row);
  }
  private dto(row: Prisma.ProductsGetPayload<{ include: typeof include }>): ProductDto {
    if (!row.product_type_id || !row.product_types)
      throw new ApplicationError(
        'INVALID_STATE',
        'Catalog cutover is required before using product workflows.',
      );
    const translations = names(
        row.product_translations.map((t) => ({
          locale: t.locale,
          name: t.name,
          description: t.description,
        })),
      ),
      values: ProductAttributeValue[] = [...row.product_specification_values]
        .sort((a, b) => a.definition_id.localeCompare(b.definition_id))
        .map((v) => {
          let value: AttributeValue;
          switch (v.value_type) {
            case 'NUMBER':
              value = { kind: 'NUMBER', number: v.number_value!.toString() };
              break;
            case 'BOOLEAN':
              value = { kind: 'BOOLEAN', boolean: v.boolean_value! };
              break;
            case 'TEXT':
              value = {
                kind: 'TEXT',
                translations: [...v.product_specification_texts]
                  .sort((a, b) => a.locale.localeCompare(b.locale))
                  .map((t) => ({
                    locale: t.locale as CatalogTranslation['locale'],
                    text: t.text_value,
                  })),
              };
              break;
            case 'CHOICE':
              value = {
                kind: 'CHOICE',
                optionIds: v.product_specification_choices.map((c) => uuid(c.option_id)).sort(),
              };
              break;
            default:
              throw new ApplicationError('INTERNAL_ERROR', 'Stored attribute type is unsupported.');
          }
          return { definitionId: uuid(v.definition_id), value };
        });
    return {
      id: uuid(row.id),
      categoryId: uuid(row.category_id),
      productTypeId: uuid(row.product_type_id),
      coverAssetId: uuid(row.product_media_products_id_cover_media_idToproduct_media.asset_id),
      modelCode:
        row.product_code_reservations_products_id_current_model_code_idToproduct_code_reservations
          ?.code ?? null,
      version: version(row.version.toString()),
      schemaRevision: version(row.product_types.schema_revision.toString()),
      translations,
      missingTranslationLocales: missing(translations),
      values,
    };
  }
  async validateLocalReferences(input: Pick<ProductCreate, 'categoryId' | 'coverAssetId'>) {
    const [category] = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM catalog.live_categories WHERE id=${input.categoryId}::uuid AND NOT EXISTS(SELECT 1 FROM catalog.categories WHERE parent_id=${input.categoryId}::uuid AND deleted_at IS NULL)`;
    if (!category)
      throw new ApplicationError(
        'INVALID_STATE',
        'Product placement requires an active leaf category.',
      );
    const asset = await this.db.mediaAssetRefs.findFirst({
      where: {
        id: input.coverAssetId,
        media_kind: 'IMAGE',
        deleted_at: null,
        ready_at: { not: null },
      },
    });
    if (!asset)
      throw new ApplicationError(
        'INVALID_STATE',
        'An existing verified IMAGE cover is required; Media readiness must be established before saving.',
      );
  }
  async create(id: Uuid, mediaId: Uuid, codeId: Uuid, input: ProductCreate) {
    await this.db.products.create({
      data: {
        id,
        category_id: input.categoryId,
        product_type_id: input.productTypeId,
        cover_media_id: mediaId,
      },
    });
    await this.db.productMedia.create({
      data: { id: mediaId, product_id: id, asset_id: input.coverAssetId },
    });
    await this.translations(id, input.translations);
    await this.modelCode(id, codeId, input.modelCode);
    await this.values(id, input.values);
  }
  async save(id: Uuid, expectedVersion: Version, input: ProductWrite) {
    const changed = await this.db.products.updateMany({
      where: { id, version: BigInt(expectedVersion), deleted_at: null },
      data: { updated_at: new Date() },
    });
    if (changed.count !== 1) throw new ApplicationError('VERSION_CONFLICT', 'Product has changed.');
    if (input.translations) await this.translations(id, input.translations);
    if (input.coverAssetId) {
      const old = await this.db.productMedia.findFirst({
          where: { product_id: id, asset_id: input.coverAssetId, deleted_at: null },
        }),
        cover =
          old ??
          (await this.db.productMedia.create({
            data: { product_id: id, asset_id: input.coverAssetId },
          }));
      await this.db.products.update({ where: { id }, data: { cover_media_id: cover.id } });
    }
    if (input.modelCode !== undefined) await this.modelCode(id, undefined, input.modelCode);
    await this.values(id, input.values);
  }
  private async translations(id: Uuid, input: readonly CatalogTranslation[]) {
    const rows = await this.db.productTranslations.findMany({
      where: { product_id: id, deleted_at: null },
    });
    for (const t of input) {
      const row = rows.find((x) => x.locale === t.locale),
        data = { name: t.name, description: t.description };
      if (row) await this.db.productTranslations.update({ where: { id: row.id }, data });
      else
        await this.db.productTranslations.create({
          data: { product_id: id, locale: t.locale, ...data },
        });
    }
  }
  private async modelCode(id: Uuid, codeId: Uuid | undefined, code: string | null) {
    if (code === null) {
      await this.db.products.update({ where: { id }, data: { current_model_code_id: null } });
      return;
    }
    const existing = await this.db.productCodeReservations.findFirst({
        where: { product_id: id, code_key: code.trim().toUpperCase(), deleted_at: null },
      }),
      reservation =
        existing ??
        (await this.db.productCodeReservations.create({
          data: { ...(codeId ? { id: codeId } : {}), product_id: id, code },
        }));
    await this.db.products.update({
      where: { id },
      data: { current_model_code_id: reservation.id },
    });
  }
  private async values(productId: Uuid, items: readonly ProductAttributeValue[]) {
    const existing = await this.db.productSpecificationValues.findMany({
        where: { product_id: productId, deleted_at: null },
        include: {
          product_specification_texts: { where: { deleted_at: null } },
          product_specification_choices: { where: { deleted_at: null } },
        },
      }),
      stamp = new Date();
    for (const row of existing.filter(
      (r) => !items.some((v) => v.definitionId === r.definition_id),
    )) {
      await this.db.productSpecificationTexts.updateMany({
        where: { value_id: row.id, deleted_at: null },
        data: { deleted_at: stamp },
      });
      await this.db.productSpecificationChoices.updateMany({
        where: { value_id: row.id, deleted_at: null },
        data: { deleted_at: stamp },
      });
      await this.db.productSpecificationValues.update({
        where: { id: row.id },
        data: { deleted_at: stamp },
      });
    }
    for (const item of items) {
      const old = existing.find((v) => v.definition_id === item.definitionId),
        value = item.value,
        data = {
          value_type: value.kind,
          number_value: value.kind === 'NUMBER' ? value.number : null,
          boolean_value: value.kind === 'BOOLEAN' ? value.boolean : null,
        };
      const row =
        old ??
        (await this.db.productSpecificationValues.create({
          data: { product_id: productId, definition_id: item.definitionId, ...data },
        }));
      if (
        old &&
        ((value.kind === 'NUMBER' && old.number_value?.equals(value.number) !== true) ||
          (value.kind === 'BOOLEAN' && old.boolean_value !== value.boolean))
      )
        await this.db.productSpecificationValues.update({ where: { id: row.id }, data });
      if (value.kind === 'TEXT') {
        const rows = old?.product_specification_texts ?? [];
        for (const removed of rows.filter(
          (t) => !value.translations.some((x) => x.locale === t.locale),
        ))
          await this.db.productSpecificationTexts.update({
            where: { id: removed.id },
            data: { deleted_at: stamp },
          });
        for (const t of value.translations) {
          const previous = rows.find((x) => x.locale === t.locale);
          if (!previous)
            await this.db.productSpecificationTexts.create({
              data: { value_id: row.id, locale: t.locale, text_value: t.text },
            });
          else if (previous.text_value !== t.text)
            await this.db.productSpecificationTexts.update({
              where: { id: previous.id },
              data: { text_value: t.text },
            });
        }
      }
      if (value.kind === 'CHOICE') {
        const rows = old?.product_specification_choices ?? [];
        for (const removed of rows.filter((c) => !value.optionIds.some((id) => id === c.option_id)))
          await this.db.productSpecificationChoices.update({
            where: { id: removed.id },
            data: { deleted_at: stamp },
          });
        for (const optionId of value.optionIds)
          if (!rows.some((c) => c.option_id === optionId))
            await this.db.productSpecificationChoices.create({
              data: { value_id: row.id, definition_id: item.definitionId, option_id: optionId },
            });
      }
    }
  }
  async productsByType(typeId: Uuid, limit: number) {
    return (
      await this.db.products.findMany({
        where: { product_type_id: typeId, deleted_at: null },
        include,
        orderBy: { id: 'asc' },
        take: limit,
      })
    ).map((row) => this.dto(row));
  }
  async impactState(typeIds: readonly Uuid[]) {
    const [row] = await this.db.$queryRaw<
      { state: string }[]
    >`WITH p AS(SELECT * FROM catalog.products WHERE product_type_id=ANY(${[...typeIds]}::uuid[]) AND deleted_at IS NULL),v AS(SELECT v.* FROM catalog.product_specification_values v JOIN p ON p.id=v.product_id WHERE v.deleted_at IS NULL),s AS(SELECT 'p' k,id,version FROM p UNION ALL SELECT 'v',id,version FROM v UNION ALL SELECT 'x',x.id,x.version FROM catalog.product_specification_texts x JOIN v ON v.id=x.value_id WHERE x.deleted_at IS NULL UNION ALL SELECT 'c',c.id,c.version FROM catalog.product_specification_choices c JOIN v ON v.id=c.value_id WHERE c.deleted_at IS NULL UNION ALL SELECT 'l',l.id,l.version FROM catalog.product_technical_sheets l JOIN p ON p.id=l.product_id WHERE l.deleted_at IS NULL) SELECT coalesce(string_agg(k||':'||id::text||':'||version::text,',' ORDER BY k,id),'') state FROM s`;
    return row?.state ?? '';
  }
  async retainedDefinitionUsage(id: Uuid) {
    const [row] = await this.db.$queryRaw<
      { used: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM catalog.product_specification_values WHERE definition_id=${id}::uuid) OR EXISTS(SELECT 1 FROM catalog.technical_measurements WHERE definition_id=${id}::uuid) used`;
    return row?.used === true;
  }
  async technicalTypeChangeBlocked(productId: Uuid) {
    return (
      (await this.db.productTechnicalSheets.count({
        where: { product_id: productId, relation_kind: 'PRODUCT_SPECIFICATION', deleted_at: null },
      })) > 0
    );
  }
  async changeType(
    id: Uuid,
    typeId: Uuid,
    expectedVersion: Version,
    values: readonly ProductAttributeValue[],
  ) {
    const result = await this.db.products.updateMany({
      where: { id, version: BigInt(expectedVersion), deleted_at: null },
      data: { product_type_id: typeId },
    });
    if (result.count !== 1) throw new ApplicationError('VERSION_CONFLICT', 'Product has changed.');
    await this.values(id, values);
  }
  async move(id: Uuid, categoryId: Uuid, expectedVersion: Version) {
    const result = await this.db.products.updateMany({
      where: { id, version: BigInt(expectedVersion), deleted_at: null },
      data: { category_id: categoryId },
    });
    if (result.count !== 1) throw new ApplicationError('VERSION_CONFLICT', 'Product has changed.');
  }
  async schemaFor(id: Uuid) {
    const row = await this.find(id);
    if (!row) throw new ApplicationError('NOT_FOUND', 'Product not found.');
    return new PrismaProductTypeRepository(this.db).schema(row.productTypeId);
  }
}
