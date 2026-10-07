import type {
  AuthenticatedActor,
  Locale,
  Uuid,
  EffectiveTypeSchema,
  ProductFormSchema,
} from '@golden-lift/contracts';
import { ApplicationError } from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { categoryFormSchema } from '../../domain/effective-schema.js';
import type { CatalogUnitOfWork } from '../ports/catalog.js';
import type { ConfigurationTarget } from '../ports/product-schema.js';
export class ReadCatalogConfiguration {
  constructor(private readonly uow: CatalogUnitOfWork) {}
  async detail(target: ConfigurationTarget, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    if (target.resource === 'types')
      throw new ApplicationError(
        'INVALID_STATE',
        'Product Type is retired; use categories and groups.',
      );
    return this.uow.execute(async (r) => {
      const value =
        target.resource === 'definitions'
          ? await r.definitions.find(target.id)
          : target.resource === 'groups'
            ? await r.groups.find(target.id)
            : target.resource === 'options'
              ? await r.definitions.option(target.id)
              : await r.units.find(target.id);
      if (!value) throw new ApplicationError('NOT_FOUND', 'Catalog configuration not found.');
      return value;
    });
  }
  async list(
    resource: 'types' | 'definitions' | 'groups' | 'units',
    after: string | null,
    limit: number,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    if (resource === 'types')
      throw new ApplicationError(
        'INVALID_STATE',
        'Product Type is retired; use categories and groups.',
      );
    return this.uow.execute(async (r) =>
      resource === 'definitions'
        ? r.definitions.list(after as Uuid | null, limit)
        : resource === 'groups'
          ? r.groups.list(after as Uuid | null, limit)
          : r.units.list(after, limit),
    );
  }
  /** Retired transport signature: stale clients receive an explicit safe error. */
  async schema(
    _id: Uuid,
    _language: Locale,
    actor: AuthenticatedActor,
  ): Promise<{ configuration: EffectiveTypeSchema; form: ProductFormSchema }> {
    requireContentAdmin(actor);
    throw new ApplicationError('INVALID_STATE', 'Product Type is retired; use category schemas.');
  }
  async productSchema(id: Uuid, language: Locale, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => {
      const product = await r.products.find(id);
      if (!product) throw new ApplicationError('NOT_FOUND', 'Product not found.');
      const effective = await r.categorySchemas.schema(product.categoryId);
      return { product, configuration: effective, form: categoryFormSchema(effective, language) };
    });
  }
}
