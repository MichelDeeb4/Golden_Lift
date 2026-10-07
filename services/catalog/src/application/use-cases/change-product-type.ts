import { ApplicationError } from '@golden-lift/contracts';
import type {
  AttributeValueMutation,
  AuthenticatedActor,
  Uuid,
  Version,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
export interface ProductTypeChange {
  readonly productTypeId: Uuid;
  readonly expectedVersion: Version;
  readonly expectedSchemaRevision: Version;
  readonly expectedDestinationSchemaRevision: Version;
  readonly values: readonly AttributeValueMutation[];
}
export class ChangeProductType {
  constructor(_uow: CatalogUnitOfWork, _ids: IdGenerator, _clock: Clock) {}
  async preview(_id: Uuid, _input: ProductTypeChange, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    throw new ApplicationError(
      'INVALID_STATE',
      'Product Type is retired; edit the category schema instead.',
    );
  }

  async commit(
    _id: Uuid,
    _input: ProductTypeChange,
    _precondition: string,
    _confirm: true,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    throw new ApplicationError(
      'INVALID_STATE',
      'Product Type is retired; edit the category schema instead.',
    );
  }
}
