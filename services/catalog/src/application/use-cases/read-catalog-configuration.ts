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
import type { ConfigurationCollectionQuery } from '../ports/configuration-collection.js';
export class ReadCatalogConfiguration {
  constructor(private readonly uow: CatalogUnitOfWork) {}
  async page(input: ConfigurationCollectionQuery, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    if (
      !Number.isInteger(input.page) ||
      input.page < 1 ||
      input.page > 100000 ||
      !Number.isInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > 100 ||
      (input.search?.length ?? 0) > 120 ||
      (input.kind && !['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE'].includes(input.kind)) ||
      (input.resource !== 'definitions' && (input.kind || input.public !== undefined))
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid configuration collection query.');
    return this.uow.execute((r) => r.configurationCollection.page(input));
  }
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
