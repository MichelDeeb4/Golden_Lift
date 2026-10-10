import { ApplicationError, version } from '@golden-lift/contracts';
import type { DirectMediaDeletionRequest } from '@golden-lift/contracts';
import type { CatalogDeletionUnitOfWork } from '../ports/deletion.js';
export class AcceptMediaDeletion {
  constructor(private readonly uow: CatalogDeletionUnitOfWork) {}
  async execute(event: DirectMediaDeletionRequest) {
    return this.uow.execute(async (r) => {
      try {
        return await r.operation(event.operationId);
      } catch (error) {
        if (!(error instanceof ApplicationError && error.code === 'NOT_FOUND')) throw error;
      }
      let impact;
      try {
        impact = await r.mediaImpact(event.assetId);
      } catch (error) {
        if (!(
          error instanceof ApplicationError &&
          ['NOT_FOUND', 'DELETE_ALREADY_IN_PROGRESS'].includes(error.code)
        ))
          throw error;
        await r.rejectMedia(event);
        return;
      }
      if (
        !impact.allowed ||
        impact.expectedVersion !== event.command.expectedVersion ||
        impact.impactRevision !== event.command.impactRevision
      ) {
        await r.rejectMedia(event);
        return;
      }
      return r.deleteMedia(event.assetId, event.operationId, {
        id: event.actorId,
        role: 'ADMIN',
        authVersion: version('1'),
      });
    });
  }
}
