import { ApplicationError, uuid, version } from './core.js';
import type { Uuid, Version } from './core.js';

export type MediaKind = 'IMAGE' | 'VIDEO' | 'PDF';
export type MediaAction = 'PREVIEW' | 'DOWNLOAD';
export interface MediaContext {
  readonly ownerType: 'CATEGORY' | 'PRODUCT' | 'PAGE' | 'SITE_LOGO' | 'TECHNICAL_SOURCE';
  readonly ownerId: Uuid | null;
}
export interface MediaEvent {
  readonly schemaVersion: 1;
  readonly id: Uuid;
  readonly producer: 'media' | 'catalog';
  readonly type: 'media.asset.ready.v1' | 'media.asset.security.v1' | 'catalog.asset.retired.v1';
  readonly assetId: Uuid;
  readonly kind: MediaKind;
  readonly sourceVersion: Version;
  readonly blocked: boolean;
}
export function mediaEvent(input: unknown): MediaEvent {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid Media event.');
  const x = input as Record<string, unknown>;
  if (
    Object.keys(x).sort().join(',') !==
      'assetId,blocked,id,kind,producer,schemaVersion,sourceVersion,type' ||
    x['schemaVersion'] !== 1 ||
    !['IMAGE', 'VIDEO', 'PDF'].includes(String(x['kind'])) ||
    typeof x['blocked'] !== 'boolean' ||
    !(
      (x['producer'] === 'media' &&
        ['media.asset.ready.v1', 'media.asset.security.v1'].includes(String(x['type']))) ||
      (x['producer'] === 'catalog' && x['type'] === 'catalog.asset.retired.v1')
    )
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Unsupported Media event.');
  return {
    schemaVersion: 1,
    id: uuid(x['id']),
    producer: x['producer'] as MediaEvent['producer'],
    type: x['type'] as MediaEvent['type'],
    assetId: uuid(x['assetId']),
    kind: x['kind'] as MediaKind,
    sourceVersion: version(x['sourceVersion']),
    blocked: x['blocked'],
  };
}
