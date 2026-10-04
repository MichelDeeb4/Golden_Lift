import { ApplicationError } from '@golden-lift/contracts';
import type {
  AttributeValueMutation,
  AuthenticatedActor,
  Uuid,
  Version,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { applyValueMutations } from '../../domain/attribute-values.js';
import type {
  CatalogRepositories,
  CatalogUnitOfWork,
  Clock,
  IdGenerator,
} from '../ports/catalog.js';
import { configurationEvent } from '../models/configuration-event.js';
export interface ProductTypeChange {
  readonly productTypeId: Uuid;
  readonly expectedVersion: Version;
  readonly expectedSchemaRevision: Version;
  readonly expectedDestinationSchemaRevision: Version;
  readonly values: readonly AttributeValueMutation[];
}
export class ChangeProductType {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  private async inspect(r: CatalogRepositories, id: Uuid, input: ProductTypeChange) {
    const p = await r.products.find(id);
    if (!p) throw new ApplicationError('NOT_FOUND', 'Product not found.');
    const schema = await r.productTypes.schema(input.productTypeId);
    if (
      p.version !== input.expectedVersion ||
      p.schemaRevision !== input.expectedSchemaRevision ||
      schema.type.schemaRevision !== input.expectedDestinationSchemaRevision
    )
      throw new ApplicationError(
        'VERSION_CONFLICT',
        'Product or source/destination schema has changed.',
      );
    if (schema.type.deprecated)
      throw new ApplicationError('INVALID_STATE', 'Destination product type is deprecated.');
    const blockers: string[] = [];
    let values = p.values;
    try {
      values = applyValueMutations(schema, p.values, input.values);
    } catch (e) {
      if (e instanceof ApplicationError) blockers.push(e.message);
      else throw e;
    }
    if (await r.products.technicalTypeChangeBlocked(id))
      blockers.push(
        'Explicit product-specific technical applicability must be reviewed before changing type.',
      );
    return {
      precondition: r.schemaChanges.precondition(
        { id, input },
        JSON.stringify(p) +
          '\n' +
          JSON.stringify(schema) +
          '\n' +
          (await r.products.impactState([p.productTypeId, input.productTypeId])),
      ),
      blockers,
      retainedDefinitionIds: p.values
        .filter((v) => schema.attributes.some((a) => a.definition.id === v.definitionId))
        .map((v) => v.definitionId),
      incompatibleDefinitionIds: p.values
        .filter((v) => !schema.attributes.some((a) => a.definition.id === v.definitionId))
        .map((v) => v.definitionId),
      requiredMissingDefinitionIds: schema.attributes
        .filter((a) => a.required && !values.some((v) => v.definitionId === a.definition.id))
        .map((a) => a.definition.id),
      values,
    };
  }
  async preview(id: Uuid, input: ProductTypeChange, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => {
      const { values: _values, ...preview } = await this.inspect(r, id, input);
      return preview;
    });
  }
  async commit(
    id: Uuid,
    input: ProductTypeChange,
    precondition: string,
    confirm: true,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    if (confirm !== true)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Explicit type-change confirmation is required.',
      );
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Product',
      id,
      input.expectedVersion,
      'catalog.product.type.changed.v1',
    );
    return this.uow.execute(async (r) => {
      const impact = await this.inspect(r, id, input);
      if (impact.precondition !== precondition)
        throw new ApplicationError('VERSION_CONFLICT', 'Type-change preview is stale.');
      if (impact.blockers.length)
        throw new ApplicationError('INVALID_STATE', 'Resolve product type-change blockers first.');
      await r.products.changeType(id, input.productTypeId, input.expectedVersion, impact.values);
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
