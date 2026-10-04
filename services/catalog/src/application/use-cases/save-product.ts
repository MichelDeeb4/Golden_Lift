import { ApplicationError, version } from '@golden-lift/contracts';
import type {
  AttributeValueMutation,
  AuthenticatedActor,
  CatalogTranslation,
  Uuid,
  Version,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { applyValueMutations, validateValues } from '../../domain/attribute-values.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
import type { ProductCreate } from '../ports/products.js';
import { configurationEvent } from '../models/configuration-event.js';
import { validateNamed } from './create-catalog-configuration.js';
export interface ProductEdit {
  readonly expectedVersion: Version;
  readonly expectedSchemaRevision: Version;
  readonly translations?: readonly CatalogTranslation[];
  readonly coverAssetId?: Uuid;
  readonly modelCode?: string | null;
  readonly values: readonly AttributeValueMutation[];
}
export class CreateProduct {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: ProductCreate, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    validateNamed({ code: 'product', translations: input.translations });
    if (input.values.length > 100)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'At most 100 values may be created in one request.',
      );
    const id = this.ids.newUuid(),
      mediaId = this.ids.newUuid(),
      codeId = this.ids.newUuid(),
      event = configurationEvent(
        this.ids,
        this.clock,
        'Product',
        id,
        version('1'),
        'catalog.product.created.v1',
      );
    return this.uow.execute(async (r) => {
      const schema = await r.productTypes.schema(input.productTypeId);
      if (schema.type.deprecated)
        throw new ApplicationError(
          'INVALID_STATE',
          'Deprecated product type cannot receive new products.',
        );
      if (schema.type.schemaRevision !== input.expectedSchemaRevision)
        throw new ApplicationError('VERSION_CONFLICT', 'Product type schema has changed.');
      const values = applyValueMutations(schema, [], input.values);
      validateValues(schema, values);
      await r.products.validateLocalReferences(input);
      await r.categories.touch(input.categoryId, input.expectedCategoryVersion);
      await r.products.create(id, mediaId, codeId, { ...input, values });
      const result = await r.products.find(id);
      if (!result)
        throw new ApplicationError('INTERNAL_ERROR', 'Created product could not be read.');
      await r.outbox.append({
        ...event,
        aggregate: { ...event.aggregate, version: result.version },
      });
      return result;
    });
  }
}
export class EditProduct {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(id: Uuid, input: ProductEdit, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    if (input.translations) validateNamed({ code: 'product', translations: input.translations });
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Product',
      id,
      input.expectedVersion,
      'catalog.product.updated.v1',
    );
    return this.uow.execute(async (r) => {
      const product = await r.products.find(id);
      if (!product) throw new ApplicationError('NOT_FOUND', 'Product not found.');
      const schema = await r.productTypes.schema(product.productTypeId);
      if (
        product.version !== input.expectedVersion ||
        schema.type.schemaRevision !== input.expectedSchemaRevision
      )
        throw new ApplicationError('VERSION_CONFLICT', 'Product or effective schema has changed.');
      const values = applyValueMutations(schema, product.values, input.values);
      await r.products.validateLocalReferences({
        categoryId: product.categoryId,
        coverAssetId: input.coverAssetId ?? product.coverAssetId,
      });
      await r.products.save(id, input.expectedVersion, {
        values,
        ...(input.translations ? { translations: input.translations } : {}),
        ...(input.coverAssetId ? { coverAssetId: input.coverAssetId } : {}),
        ...(input.modelCode !== undefined ? { modelCode: input.modelCode } : {}),
      });
      const result = await r.products.find(id);
      if (!result)
        throw new ApplicationError('INTERNAL_ERROR', 'Updated product could not be read.');
      await r.outbox.append({
        ...event,
        aggregate: { ...event.aggregate, version: result.version },
      });
      return result;
    });
  }
}
