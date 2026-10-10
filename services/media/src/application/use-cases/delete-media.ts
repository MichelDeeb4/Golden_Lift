import { ApplicationError } from '@business-platform/contracts';
import type {
  AuthenticatedActor,
  DeleteCommand,
  DeletionImpact,
  DeletionOperation,
  DirectMediaDeletionRequest,
  Uuid,
} from '@business-platform/contracts';
import type { MediaIds, MediaUnitOfWork } from '../ports/media.js';
import { requireAdmin } from '../../domain/staff-access.js';

export interface CatalogDeletionImpact {
  impact(id: Uuid): Promise<DeletionImpact>;
}
export interface DirectMediaDeletionStore {
  reserve(
    id: Uuid,
    command: DeleteCommand,
    event: DirectMediaDeletionRequest,
  ): Promise<DeletionOperation>;
  operation(id: Uuid): Promise<DeletionOperation>;
}
export class GetMediaDeletionImpact {
  constructor(
    private readonly media: MediaUnitOfWork,
    private readonly catalog: CatalogDeletionImpact,
    private readonly ids: MediaIds,
  ) {}
  async execute(id: Uuid, actor: AuthenticatedActor) {
    requireAdmin(actor);
    const asset = await this.media.execute((r) => r.asset(id));
    if (asset.deleted || asset.deletionPending)
      throw new ApplicationError(
        'DELETE_ALREADY_IN_PROGRESS',
        'Media is deleted or deletion is already in progress.',
      );
    const impact = await this.catalog.impact(id);
    return {
      ...impact,
      entity: { ...impact.entity, displayName: asset.originalName },
      expectedVersion: asset.version,
      impactRevision: 'd1-' + this.ids.hash(impact.impactRevision + ':' + asset.version),
    };
  }
}
export class DeleteMedia {
  constructor(
    private readonly media: MediaUnitOfWork,
    private readonly catalog: CatalogDeletionImpact,
    private readonly store: DirectMediaDeletionStore,
    private readonly ids: MediaIds,
  ) {}
  async execute(id: Uuid, command: DeleteCommand, actor: AuthenticatedActor) {
    requireAdmin(actor);
    const asset = await this.media.execute((r) => r.asset(id));
    if (asset.deleted || asset.deletionPending)
      throw new ApplicationError(
        'DELETE_ALREADY_IN_PROGRESS',
        'Media deletion is already in progress.',
      );
    if (command.confirmed !== true)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Explicit permanent deletion confirmation required.',
      );
    if (asset.version !== command.expectedVersion)
      throw new ApplicationError('VERSION_CONFLICT', 'Media changed; refresh deletion impact.');
    const impact = await this.catalog.impact(id);
    if (!impact.allowed)
      throw new ApplicationError('INVALID_STATE', 'Media has unresolved ownership dependencies.');
    if (
      'd1-' + this.ids.hash(impact.impactRevision + ':' + asset.version) !==
      command.impactRevision
    )
      throw new ApplicationError(
        'DELETE_IMPACT_CHANGED',
        'Media dependencies changed; refresh impact.',
      );
    const event: DirectMediaDeletionRequest = {
      schemaVersion: 1,
      id: this.ids.uuid(),
      operationId: this.ids.uuid(),
      producer: 'media',
      type: 'media.deletion.requested.v1',
      assetId: id,
      actorId: actor.id,
      command: {
        expectedVersion: impact.expectedVersion,
        impactRevision: impact.impactRevision,
        confirmed: true,
      },
    };
    return this.store.reserve(id, command, event);
  }
}
export class GetMediaDeletionOperation {
  constructor(private readonly store: DirectMediaDeletionStore) {}
  execute(id: Uuid, actor: AuthenticatedActor) {
    requireAdmin(actor);
    return this.store.operation(id);
  }
}
