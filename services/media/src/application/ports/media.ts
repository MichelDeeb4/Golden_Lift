import type {
  Uuid,
  Version,
  MediaKind,
  MediaEvent,
  MediaContext,
  MediaAction,
} from '@golden-lift/contracts';
import type { UploadInput, MediaPolicy } from '../../domain/media-policy.js';
export type { MediaPolicy } from '../../domain/media-policy.js';
import type { StoredObject } from './storage.js';

export interface MediaAsset {
  readonly jobs: readonly {
    id: Uuid;
    status: string;
    attempts: number;
    nextAttemptAt: string;
    failureCode: string | null;
  }[];
  readonly originalName: string;
  readonly purpose: 'CATALOG' | 'TECHNICAL_SOURCE' | null;
  readonly updatedAt: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly duration: string | null;
  readonly inputVersion: string | null;
  readonly id: Uuid;
  readonly kind: MediaKind;
  readonly status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
  readonly security: 'UNVERIFIED' | 'VERIFIED' | 'BLOCKED' | 'REJECTED';
  readonly version: Version;
  readonly deleted: boolean;
  readonly deletionPending: boolean;
  readonly key: string;
  readonly bytes: string | null;
  readonly sha256: string | null;
  readonly mime: string | null;
  readonly failure: string | null;
  readonly variants: readonly MediaVariant[];
}
export interface MediaVariant extends StoredObject {
  readonly profile: string;
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly duration: string | null;
}
export interface UploadSession {
  readonly id: Uuid;
  readonly assetId: Uuid;
  readonly uploader: Uuid;
  readonly status: string;
  readonly expires: string;
  readonly version: Version;
  readonly bytes: string;
  readonly declaredSha256: string | null;
  readonly parts: Readonly<Record<string, StoredObject>>;
  readonly sealingToken: Uuid | null;
}
export interface ProcessingClaim {
  readonly jobId: Uuid;
  readonly token: Uuid;
  readonly asset: MediaAsset;
  readonly attempt: number;
}
export interface ProcessingResult {
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly duration: string | null;
  readonly evidence: Readonly<Record<string, string>>;
  readonly variants: readonly MediaVariant[];
}
export interface MediaRepository {
  statistics(): Promise<MediaStatistics>;
  allocate(
    input: UploadInput,
    actor: Uuid,
    assetId: Uuid,
    sessionId: Uuid,
    hash: string,
    bucket: string,
    policy: MediaPolicy,
  ): Promise<UploadSession>;
  session(id: Uuid): Promise<UploadSession>;
  part(id: Uuid, actor: Uuid, index: number, object: StoredObject): Promise<UploadSession>;
  beginSeal(id: Uuid, actor: Uuid, expected: Version, token: Uuid): Promise<UploadSession>;
  complete(id: Uuid, token: Uuid, object: StoredObject): Promise<UploadSession>;
  cancel(id: Uuid, actor: Uuid, expected: Version): Promise<UploadSession>;
  asset(id: Uuid): Promise<MediaAsset>;
  list(
    after: Uuid | null,
    limit: number,
    filters?: {
      readonly kind?: MediaKind;
      readonly status?: MediaAsset['status'];
      readonly search?: string;
    },
  ): Promise<readonly MediaAsset[]>;
  count(filters?: {
    readonly kind?: MediaKind;
    readonly status?: MediaAsset['status'];
    readonly search?: string;
  }): Promise<number>;
  claim(kind: MediaKind, token: Uuid, maxAttempts: number): Promise<ProcessingClaim | null>;
  renew(job: Uuid, token: Uuid): Promise<boolean>;
  ready(claim: ProcessingClaim, result: ProcessingResult): Promise<boolean>;
  fail(
    claim: ProcessingClaim,
    code: string,
    permanent: boolean,
    maxAttempts: number,
  ): Promise<void>;
  retry(id: Uuid, expected: Version): Promise<MediaAsset>;
  reprocess(id: Uuid, expected: Version): Promise<MediaAsset>;
  block(id: Uuid, expected: Version): Promise<MediaAsset>;
  retire(event: MediaEvent): Promise<void>;
  reconcile(limit: number, maxAttempts?: number): Promise<number>;
}
export interface MediaStatistics {
  readonly retainedReservationBytes: string;
  readonly knownOriginalBytes: string;
  readonly knownOutputBytes: string;
  readonly pendingJobs: string;
  readonly oldestJobAt: string | null;
  readonly pendingEvents: string;
  readonly exhaustedEvents: string;
  readonly unselectedAttempts: string;
}
export interface MediaUnitOfWork {
  execute<T>(work: (repository: MediaRepository) => Promise<T>): Promise<T>;
}
export interface CatalogMedia {
  authorize(
    assetId: Uuid,
    context: MediaContext,
    action: MediaAction,
  ): Promise<{ expiresAt: string }>;
  usage(assetId: Uuid, after: number, limit: number): Promise<unknown>;
  retirement(asset: MediaAsset): Promise<MediaEvent>;
  registration(assetId: Uuid): Promise<{ registered: boolean; retired: boolean; blocked: boolean }>;
}
export interface MediaClock {
  now(): string;
}
export interface MediaIds {
  uuid(): Uuid;
  hash(value: string): string;
  digest(value: Uint8Array): string;
}
