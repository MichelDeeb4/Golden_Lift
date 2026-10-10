import { ApplicationError, record, uuid, version } from './core.js';
import type { Uuid, Version } from './core.js';

export type DeletionEntity =
  'PRODUCT' | 'MEDIA' | 'ATTRIBUTE' | 'ATTRIBUTE_GROUP' | 'UNIT' | 'CATEGORY';
export interface DeletionImpact {
  readonly allowed: boolean;
  readonly permanent: true;
  readonly entity: {
    readonly id: string;
    readonly type: DeletionEntity;
    readonly displayName: string;
  };
  readonly blockingDependencies: readonly {
    type: string;
    count: string;
    examples?: readonly { id: string; displayName: string }[];
  }[];
  readonly cascadingDeletes: readonly { type: string; count: string }[];
  readonly detachedReferences: readonly { type: string; count: string }[];
  readonly unaffectedEntities: readonly { type: string; count?: string }[];
  readonly warnings: readonly string[];
  readonly expectedVersion: Version;
  readonly impactRevision: string;
}
export interface DeleteCommand {
  readonly expectedVersion: Version;
  readonly impactRevision: string;
  readonly confirmed: true;
}
export interface DeletionOperation {
  readonly id: Uuid;
  readonly entityType: DeletionEntity;
  readonly entityId: string;
  readonly status: 'MEDIA_CLEANUP' | 'COMPLETED' | 'RETRYABLE';
  readonly failureCode: string | null;
  readonly retryCount: number;
  readonly completedAt: string | null;
}
export interface DeletionEvent {
  readonly schemaVersion: 1;
  readonly id: Uuid;
  readonly operationId: Uuid;
  readonly producer: 'catalog' | 'media';
  readonly type:
    | 'catalog.media.delete.requested.v1'
    | 'media.delete.completed.v1'
    | 'media.delete.failed.v1'
    | 'catalog.media.delete.rejected.v1';
  readonly assetIds: readonly Uuid[];
}
export function deletionEvent(input: unknown): DeletionEvent {
  const x = record(input);
  if (
    Object.keys(x).sort().join(',') !== 'assetIds,id,operationId,producer,schemaVersion,type' ||
    x['schemaVersion'] !== 1 ||
    !Array.isArray(x['assetIds']) ||
    x['assetIds'].length > 1000 ||
    !(
      (x['producer'] === 'catalog' &&
        ['catalog.media.delete.requested.v1', 'catalog.media.delete.rejected.v1'].includes(
          String(x['type']),
        )) ||
      (x['producer'] === 'media' &&
        ['media.delete.completed.v1', 'media.delete.failed.v1'].includes(String(x['type'])))
    )
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid deletion event.');
  const assetIds = x['assetIds'].map(uuid);
  if (new Set(assetIds).size !== assetIds.length)
    throw new ApplicationError('VALIDATION_FAILED', 'Duplicate deletion asset.');
  return {
    schemaVersion: 1,
    id: uuid(x['id']),
    operationId: uuid(x['operationId']),
    producer: x['producer'] as DeletionEvent['producer'],
    type: x['type'] as DeletionEvent['type'],
    assetIds,
  };
}
export interface DirectMediaDeletionRequest {
  readonly schemaVersion: 1;
  readonly id: Uuid;
  readonly operationId: Uuid;
  readonly producer: 'media';
  readonly type: 'media.deletion.requested.v1';
  readonly assetId: Uuid;
  readonly actorId: Uuid;
  readonly command: DeleteCommand;
}
export function directMediaDeletionRequest(input: unknown): DirectMediaDeletionRequest {
  const x = record(input),
    c = record(x['command']);
  if (
    Object.keys(x).sort().join(',') !==
      'actorId,assetId,command,id,operationId,producer,schemaVersion,type' ||
    x['schemaVersion'] !== 1 ||
    x['producer'] !== 'media' ||
    x['type'] !== 'media.deletion.requested.v1' ||
    Object.keys(c).sort().join(',') !== 'confirmed,expectedVersion,impactRevision' ||
    c['confirmed'] !== true ||
    typeof c['impactRevision'] !== 'string' ||
    !/^d1-[a-f0-9]{64}$/.test(c['impactRevision'])
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid direct Media deletion request.');
  return {
    schemaVersion: 1,
    id: uuid(x['id']),
    operationId: uuid(x['operationId']),
    producer: 'media',
    type: 'media.deletion.requested.v1',
    assetId: uuid(x['assetId']),
    actorId: uuid(x['actorId']),
    command: {
      expectedVersion: version(c['expectedVersion']),
      impactRevision: c['impactRevision'],
      confirmed: true,
    },
  };
}
