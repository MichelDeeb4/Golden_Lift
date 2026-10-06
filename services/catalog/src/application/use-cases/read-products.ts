import { ApplicationError } from '@golden-lift/contracts';
import type { AuthenticatedActor, Locale, PublicProductDto, Uuid } from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { publicAttribute, publicValue, translated } from '../../domain/effective-schema.js';
import type { CatalogUnitOfWork } from '../ports/catalog.js';
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
    return this.uow.execute(async (r) => {
      const p = await r.products.find(id);
      if (!p || !p.active) throw new ApplicationError('NOT_FOUND', 'Product not found.');
      const schema = await r.productTypes.schema(p.productTypeId),
        text = translated(p.translations, language);
      return {
        id: p.id,
        categoryId: p.categoryId,
        productTypeId: p.productTypeId,
        name: text.name,
        description: text.description,
        resolvedNameLocale: text.resolvedLocale,
        coverAssetId: p.coverAssetId,
        modelCode: p.modelCode,
        attributes: p.values.flatMap((v) => {
          const field = schema.attributes.find((a) => a.definition.id === v.definitionId);
          if (!field || !publicAttribute(field)) return [];
          return [
            {
              definitionId: v.definitionId,
              label: translated(field.definition.translations, language).name,
              unitSymbol: field.definition.unit?.symbol ?? null,
              value: publicValue(v.value, field.definition, language),
            },
          ];
        }),
      };
    });
  }
}
