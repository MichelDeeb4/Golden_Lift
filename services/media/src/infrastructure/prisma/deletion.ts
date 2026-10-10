import { randomUUID } from 'node:crypto';
import { ApplicationError, uuid } from '@business-platform/contracts';
import type {
  DeleteCommand,
  DeletionEvent,
  DeletionOperation,
  DirectMediaDeletionRequest,
  Uuid,
} from '@business-platform/contracts';
import { retryTransaction } from '@business-platform/platform';
import type { MediaDeletionStore } from '../../application/ports/deletion.js';
import type { DirectMediaDeletionStore } from '../../application/use-cases/delete-media.js';
import type { PrismaClient, Database } from './client.js';
export class PrismaMediaDeletionStore implements MediaDeletionStore, DirectMediaDeletionStore {
  constructor(private readonly db: PrismaClient) {}
  private transaction<T>(work: (tx: Database) => Promise<T>) {
    return retryTransaction(
      () => this.db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 }),
      3,
    );
  }
  async reserve(id: Uuid, command: DeleteCommand, event: DirectMediaDeletionRequest) {
    return this.transaction(async (tx) => {
      const changed = await tx.assets.updateMany({
        where: {
          id,
          version: BigInt(command.expectedVersion),
          deleted_at: null,
          deletion_pending: false,
        },
        data: { deletion_pending: true },
      });
      if (changed.count !== 1)
        throw new ApplicationError('VERSION_CONFLICT', 'Media changed; refresh deletion impact.');
      await tx.deletionOperations.create({
        data: {
          id: event.operationId,
          entity_type: 'MEDIA',
          entity_id: id,
          requested_by: event.actorId,
          status: 'MEDIA_CLEANUP',
          asset_ids: [id],
        },
      });
      await tx.outboxEvents.create({
        data: {
          id: event.id,
          aggregate_type: 'DeletionOperation',
          aggregate_id: event.operationId,
          event_type: event.type,
          payload: { ...event, command: { ...event.command } },
        },
      });
      return this.operationDto(
        await tx.deletionOperations.findUniqueOrThrow({ where: { id: event.operationId } }),
      );
    });
  }
  private operationDto(row: {
    id: string;
    entity_id: string;
    status: string;
    failure_code: string | null;
    retry_count: number;
    completed_at: Date | null;
  }): DeletionOperation {
    if (!['MEDIA_CLEANUP', 'COMPLETED', 'RETRYABLE'].includes(row.status))
      throw new ApplicationError('INTERNAL_ERROR', 'Invalid Media operation state.');
    return {
      id: uuid(row.id),
      entityType: 'MEDIA',
      entityId: row.entity_id,
      status: row.status as DeletionOperation['status'],
      failureCode: row.failure_code,
      retryCount: row.retry_count,
      completedAt: row.completed_at?.toISOString() ?? null,
    };
  }
  async operation(id: Uuid) {
    const row = await this.db.deletionOperations.findUnique({ where: { id } });
    if (!row) throw new ApplicationError('NOT_FOUND', 'Media deletion operation not found.');
    return this.operationDto(row);
  }
  async reject(event: DeletionEvent) {
    return this.transaction(async (tx) => {
      const seen = await tx.inboxMessages.findUnique({
        where: {
          consumer_name_message_id: {
            consumer_name: 'media-deletion-rejection-v1',
            message_id: event.id,
          },
        },
      });
      if (seen) return;
      const op = await tx.deletionOperations.findUniqueOrThrow({
        where: { id: event.operationId },
      });
      if (op.status === 'COMPLETED')
        throw new ApplicationError('INVALID_STATE', 'Cannot reject completed deletion.');
      await tx.assets.updateMany({
        where: { id: { in: op.asset_ids }, deleted_at: null },
        data: { deletion_pending: false },
      });
      await tx.deletionOperations.update({
        where: { id: event.operationId },
        data: {
          status: 'RETRYABLE',
          failure_code: 'DELETE_IMPACT_CHANGED',
          completed_at: new Date(),
        },
      });
      await tx.inboxMessages.create({
        data: { consumer_name: 'media-deletion-rejection-v1', message_id: event.id },
      });
    });
  }
  prepare(event: DeletionEvent) {
    return this.transaction(async (tx) => {
      const seen = await tx.inboxMessages.findUnique({
        where: {
          consumer_name_message_id: { consumer_name: 'media-deletion-v1', message_id: event.id },
        },
      });
      if (seen) return null;
      const existing = await tx.deletionOperations.findUnique({ where: { id: event.operationId } });
      if (
        existing &&
        [...existing.asset_ids].sort().join(',') !== [...event.assetIds].sort().join(',')
      )
        throw new ApplicationError('INVALID_STATE', 'Deletion operation identity was reused.');
      if (existing?.status === 'COMPLETED') return null;
      if (!existing)
        await tx.deletionOperations.create({
          data: {
            id: event.operationId,
            entity_type: 'MEDIA',
            entity_id: event.operationId,
            requested_by: event.operationId,
            status: 'MEDIA_CLEANUP',
            asset_ids: [...event.assetIds],
          },
        });
      else
        await tx.deletionOperations.update({
          where: { id: event.operationId },
          data: { status: 'MEDIA_CLEANUP' },
        });
      await tx.assets.updateMany({
        where: { id: { in: [...event.assetIds] }, deleted_at: null, deletion_pending: false },
        data: { deletion_pending: true },
      });
      const rows = await tx.uploadSessions.findMany({
        where: { asset_id: { in: [...event.assetIds] } },
        select: { id: true, asset_id: true },
      });
      return event.assetIds.map((assetId) => ({
        assetId,
        sessionIds: rows.filter((s) => s.asset_id === assetId).map((s) => uuid(s.id)),
      }));
    });
  }
  removeMetadata(assetId: Uuid) {
    return this.transaction(async (tx) => {
      await tx.assetVariants.deleteMany({ where: { asset_id: assetId } });
      await tx.processingJobs.deleteMany({ where: { asset_id: assetId } });
      await tx.uploadSessions.deleteMany({ where: { asset_id: assetId } });
      await tx.assets.deleteMany({ where: { id: assetId } });
    });
  }
  completed(event: DeletionEvent) {
    return this.transaction(async (tx) => {
      const op = await tx.deletionOperations.findUniqueOrThrow({
        where: { id: event.operationId },
      });
      if (op.status === 'COMPLETED') return;
      if (await tx.assets.count({ where: { id: { in: [...event.assetIds] } } }))
        throw new ApplicationError('INVALID_STATE', 'Media cleanup remains incomplete.');
      const result: DeletionEvent = {
        ...event,
        id: uuid(randomUUID()),
        producer: 'media',
        type: 'media.delete.completed.v1',
      };
      await tx.outboxEvents.create({
        data: {
          id: result.id,
          aggregate_type: 'DeletionOperation',
          aggregate_id: result.operationId,
          event_type: result.type,
          payload: { ...result, assetIds: [...result.assetIds] },
        },
      });
      await tx.deletionOperations.update({
        where: { id: event.operationId },
        data: { status: 'COMPLETED', failure_code: null, completed_at: new Date() },
      });
      await tx.inboxMessages.create({
        data: { consumer_name: 'media-deletion-v1', message_id: event.id },
      });
    });
  }
  async failed(event: DeletionEvent) {
    await this.transaction(async (tx) => {
      const changed = await tx.deletionOperations.updateMany({
        where: { id: event.operationId, status: { not: 'COMPLETED' } },
        data: {
          status: 'RETRYABLE',
          failure_code: 'MEDIA_DELETE_FAILED',
          retry_count: { increment: 1 },
        },
      });
      if (changed.count) {
        const result: DeletionEvent = {
          ...event,
          id: uuid(randomUUID()),
          producer: 'media',
          type: 'media.delete.failed.v1',
        };
        await tx.outboxEvents.create({
          data: {
            id: result.id,
            aggregate_type: 'DeletionOperation',
            aggregate_id: result.operationId,
            event_type: result.type,
            payload: { ...result, assetIds: [...result.assetIds] },
          },
        });
      }
    });
  }
}
