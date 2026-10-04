import type { AuthenticatedActor, Locale, Uuid } from '@golden-lift/contracts';
import { ApplicationError } from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { formSchema } from '../../domain/effective-schema.js';
import type { CatalogUnitOfWork } from '../ports/catalog.js';
import type { ConfigurationTarget } from '../ports/product-schema.js';
export class ReadCatalogConfiguration {
  constructor(private readonly uow: CatalogUnitOfWork) {}
  async detail(target: ConfigurationTarget, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => {
      const value =
        target.resource === 'types'
          ? await r.productTypes.find(target.id)
          : target.resource === 'definitions'
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
    return this.uow.execute(async (r) =>
      resource === 'types'
        ? r.productTypes.list(after as Uuid | null, limit)
        : resource === 'definitions'
          ? r.definitions.list(after as Uuid | null, limit)
          : resource === 'groups'
            ? r.groups.list(after as Uuid | null, limit)
            : r.units.list(after, limit),
    );
  }
  async schema(id: Uuid, language: Locale, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => {
      const effective = await r.productTypes.schema(id);
      return { configuration: effective, form: formSchema(effective, language) };
    });
  }
  async productSchema(id: Uuid, language: Locale, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => {
      const product = await r.products.find(id);
      if (!product) throw new ApplicationError('NOT_FOUND', 'Product not found.');
      const effective = await r.productTypes.schema(product.productTypeId);
      return { product, configuration: effective, form: formSchema(effective, language) };
    });
  }
}
