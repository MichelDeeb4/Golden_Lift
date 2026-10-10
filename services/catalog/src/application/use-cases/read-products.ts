import { ApplicationError } from '@business-platform/contracts';
import type {
  AuthenticatedActor,
  Locale,
  PublicProductDto,
  PublicProductQuery,
  PublicProductPage,
  Uuid,
} from '@business-platform/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { exactQuantity } from '../../domain/attribute-values.js';
import { publicAttribute, publicValue, translated } from '../../domain/effective-schema.js';
import type { CatalogUnitOfWork, CatalogRepositories } from '../ports/catalog.js';
export class ReadProducts {
  constructor(private readonly uow: CatalogUnitOfWork) {}
  async admin(id: Uuid, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => {
      const p = await r.products.find(id);
      if (!p) throw new ApplicationError('NOT_FOUND', 'Product not found.');
      return p;
    });
  }
  async public(id: Uuid, language: Locale): Promise<PublicProductDto> {
    return this.uow.execute(async (r) => ({
      ...(await this.project(r, id, language)),
      navigation: await r.products.publicNavigation(id, language),
    }));
  }
  async collection(input: PublicProductQuery): Promise<PublicProductPage> {
    const seen = new Set<string>();
    for (const filter of input.filters) {
      if (seen.has(filter.definitionId))
        throw new ApplicationError('VALIDATION_FAILED', 'Attribute filters must be unique.');
      seen.add(filter.definitionId);
      if (filter.kind === 'CHOICE') {
        const options = 'optionIds' in filter ? filter.optionIds : [filter.optionId];
        if (!options.length || options.length > 100 || new Set(options).size !== options.length)
          throw new ApplicationError('VALIDATION_FAILED', 'Invalid choice filter.');
      }

      if (filter.kind !== 'NUMBER') continue;
      const minimum = filter.minimum === undefined ? undefined : exactQuantity(filter.minimum);
      const maximum = filter.maximum === undefined ? undefined : exactQuantity(filter.maximum);
      if (
        (minimum === undefined && maximum === undefined) ||
        (minimum !== undefined && maximum !== undefined && minimum > maximum)
      )
        throw new ApplicationError('VALIDATION_FAILED', 'Invalid public numeric range.');
    }
    if (
      !Number.isInteger(input.page) ||
      input.page < 1 ||
      input.page > 1000 ||
      !Number.isInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > 100 ||
      input.filters.length > 10
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid bounded public collection request.');
    return this.uow.execute(async (r) => {
      const page = await r.products.publicPage(input);
      const items: PublicProductDto[] = [];
      for (const id of page.ids) items.push(await this.project(r, id, input.locale));
      const filters: PublicProductPage['filters'][number][] = [];
      for (const id of page.filterIds) {
        const d = await r.definitions.find(id);
        if (!d || !d.public || !d.filterable || d.deprecated) continue;
        filters.push({
          id,
          label: translated(d.translations, input.locale).name,
          kind: d.kind,
          unitSymbol: d.unit?.symbol ?? null,
          minimum: d.minimum,
          maximum: d.maximum,
          options: d.options
            .filter((o) => !o.deprecated)
            .slice(0, 100)
            .map((o) => ({ id: o.id, label: translated(o.translations, input.locale).name })),
        });
      }
      return {
        items,
        total: page.total,
        filters: filters.toSorted(
          (a, b) => a.label.localeCompare(b.label, input.locale) || a.id.localeCompare(b.id),
        ),
        page: input.page,
        pageSize: input.pageSize,
        hasNextPage: page.hasNextPage,
      };
    });
  }
  private async project(
    r: CatalogRepositories,
    id: Uuid,
    language: Locale,
  ): Promise<PublicProductDto> {
    const p = await r.products.find(id);
    if (!p || !p.active || !p.coverAssetId)
      throw new ApplicationError('NOT_FOUND', 'Product not found.');
    const context = await r.products.publicContext(id, language);
    if (!context) throw new ApplicationError('NOT_FOUND', 'Product not found.');
    const schema = await r.categorySchemas.schema(p.categoryId),
      text = translated(p.translations, language);
    return {
      id: p.id,
      categoryId: p.categoryId,
      name: text.name,
      description: text.description,
      resolvedNameLocale: text.resolvedLocale,
      coverAssetId: p.coverAssetId,
      modelCode: p.modelCode,
      ...context,
      attributes: schema.attributes.flatMap((field) => {
        const v = p.values.find((item) => item.definitionId === field.definition.id);
        if (!v || !publicAttribute(field)) return [];
        return [
          {
            definitionId: v.definitionId,
            label: translated(field.definition.translations, language).name,
            unitSymbol: field.definition.unit?.symbol ?? null,
            ...(schema.groups.find((g) => g.id === field.groupPlacementId)
              ? {
                  group: {
                    id: field.groupPlacementId!,
                    label: translated(
                      schema.groups.find((g) => g.id === field.groupPlacementId)!.group
                        .translations,
                      language,
                    ).name,
                  },
                }
              : {}),
            value: publicValue(v.value, field.definition, language),
          },
        ];
      }),
    };
  }
}
