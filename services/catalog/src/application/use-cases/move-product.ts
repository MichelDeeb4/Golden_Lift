import { ApplicationError } from '@golden-lift/contracts';
import type { AuthenticatedActor, Uuid, Version } from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
import { configurationEvent } from '../models/configuration-event.js';
import type { CatalogRepositories } from '../ports/catalog.js';
import { validateValues } from '../../domain/attribute-values.js';
export interface ProductPlacementInput {
  readonly categoryId: Uuid;
  readonly expectedVersion: Version;
  readonly expectedSchemaRevision: Version;
  readonly expectedCategoryVersion: Version;
}
export class MoveProduct {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  private async impact(r: CatalogRepositories, id: Uuid, input: ProductPlacementInput) {
    const product = await r.products.find(id);
    if (!product) throw new ApplicationError('NOT_FOUND', 'Product not found.');
    if (
      product.version !== input.expectedVersion ||
      product.schemaRevision !== input.expectedSchemaRevision
    )
      throw new ApplicationError('VERSION_CONFLICT', 'Product or schema has changed.');
    await r.products.validateLocalReferences({
      categoryId: input.categoryId,
      coverAssetId: product.coverAssetId,
    });
    const source = await r.categorySchemas.schema(product.categoryId);
    const target = await r.categorySchemas.schema(input.categoryId);
    if (target.categoryVersion !== input.expectedCategoryVersion)
      throw new ApplicationError('VERSION_CONFLICT', 'Target category has changed.');
    const before = new Set(source.attributes.map((a) => a.definition.id));
    const after = new Set(target.attributes.map((a) => a.definition.id));
    const blockers: string[] = [];
    if (product.active) {
      try {
        validateValues(target, product.values);
      } catch (error) {
        if (!(error instanceof ApplicationError)) throw error;
        blockers.push(
          'The published product would be invalid in this category. Unpublish it and review its values before moving.',
        );
      }
    }
    return {
      product,
      source,
      target,
      review: {
        precondition: r.schemaChanges.precondition(
          { id, input },
          JSON.stringify({ product, source, target }),
        ),
        sharedAttributeIds: [...before].filter((a) => after.has(a)),
        addedAttributeIds: [...after].filter((a) => !before.has(a)),
        removedAttributeIds: [...before].filter((a) => !after.has(a)),
        retainedValueCount: String(product.values.length),
        nonApplicableValueCount: String(
          product.values.filter((v) => !after.has(v.definitionId)).length,
        ),
        valuesRetained: true,
        blockers,
      },
    };
  }
  async preview(id: Uuid, input: ProductPlacementInput, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => (await this.impact(r, id, input)).review);
  }
  async execute(
    id: Uuid,
    input: ProductPlacementInput & { readonly precondition: string; readonly confirm: boolean },
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    if (!input.confirm)
      throw new ApplicationError('VALIDATION_FAILED', 'Review and confirm the category change.');
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Product',
      id,
      input.expectedVersion,
      'catalog.product.placement.changed.v1',
    );
    return this.uow.execute(async (r) => {
      const { product: p, review } = await this.impact(r, id, {
        categoryId: input.categoryId,
        expectedVersion: input.expectedVersion,
        expectedSchemaRevision: input.expectedSchemaRevision,
        expectedCategoryVersion: input.expectedCategoryVersion,
      });
      if (review.precondition !== input.precondition)
        throw new ApplicationError('VERSION_CONFLICT', 'Category impact changed; review again.');
      if (review.blockers.length) throw new ApplicationError('INVALID_STATE', review.blockers[0]!);
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
