import type {
  AuthenticatedActor,
  DeleteCommand,
  DeletionEvent,
  DeletionImpact,
  DeletionOperation,
  DirectMediaDeletionRequest,
  EventEnvelope,
  Uuid,
} from '@business-platform/contracts';

export interface CatalogDeletionRepository {
  append(event: EventEnvelope): Promise<void>;
  productImpact(id: Uuid): Promise<DeletionImpact>;
  mediaImpact(id: Uuid): Promise<DeletionImpact>;
  attributeImpact(id: Uuid): Promise<DeletionImpact>;
  groupImpact(id: Uuid): Promise<DeletionImpact>;
  unitImpact(code: string): Promise<DeletionImpact>;
  categoryImpact(id: Uuid): Promise<DeletionImpact>;
  deleteProduct(id: Uuid, operationId: Uuid, actor: AuthenticatedActor): Promise<DeletionOperation>;
  deleteMedia(id: Uuid, operationId: Uuid, actor: AuthenticatedActor): Promise<DeletionOperation>;
  deleteAttribute(id: Uuid): Promise<void>;
  deleteGroup(id: Uuid): Promise<void>;
  deleteUnit(code: string): Promise<void>;
  deleteCategoryTree(
    id: Uuid,
    operationId: Uuid,
    actor: AuthenticatedActor,
  ): Promise<DeletionOperation>;
  operation(id: Uuid): Promise<DeletionOperation>;
  complete(event: DeletionEvent): Promise<void>;
  rejectMedia(event: DirectMediaDeletionRequest): Promise<void>;
}
export interface CatalogDeletionUnitOfWork {
  execute<T>(work: (repository: CatalogDeletionRepository) => Promise<T>): Promise<T>;
}
export type DeletionInput = DeleteCommand;
