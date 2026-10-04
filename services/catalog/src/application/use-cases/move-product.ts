import { ApplicationError } from '@golden-lift/contracts';
import type { AuthenticatedActor, Uuid, Version } from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
import { configurationEvent } from '../models/configuration-event.js';
export class MoveProduct {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(
    id: Uuid,
    input: {
      readonly categoryId: Uuid;
      readonly expectedVersion: Version;
      readonly expectedSchemaRevision: Version;
      readonly expectedCategoryVersion: Version;
    },
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Product',
      id,
      input.expectedVersion,
      'catalog.product.placement.changed.v1',
    );
    return this.uow.execute(async (r) => {
      const p = await r.products.find(id);
      if (!p) throw new ApplicationError('NOT_FOUND', 'Product not found.');
      if (p.version !== input.expectedVersion || p.schemaRevision !== input.expectedSchemaRevision)
        throw new ApplicationError('VERSION_CONFLICT', 'Product or schema has changed.');
      await r.products.validateLocalReferences({
        categoryId: input.categoryId,
        coverAssetId: p.coverAssetId,
      });
      const source = await r.categories.find(p.categoryId, 'ar');
      if (!source) throw new ApplicationError('INVALID_STATE', 'Source category is unavailable.');
      if (input.categoryId === p.categoryId) return p;
      await r.categories.touch(source.id, source.version);
      await r.categories.touch(input.categoryId, input.expectedCategoryVersion);
      await r.products.move(id, input.categoryId, input.expectedVersion);
      const product = await r.products.find(id);
      if (!product) throw new ApplicationError('INTERNAL_ERROR', 'Product could not be read.');
      await r.outbox.append({
        ...event,
        aggregate: { ...event.aggregate, version: product.version },
      });
      return product;
    });
  }
}
