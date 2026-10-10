import type { DeletionEvent, Uuid } from '@golden-lift/contracts';
export interface MediaDeletionStore {
  prepare(
    event: DeletionEvent,
  ): Promise<readonly { assetId: Uuid; sessionIds: readonly Uuid[] }[] | null>;
  removeMetadata(assetId: Uuid): Promise<void>;
  completed(event: DeletionEvent): Promise<void>;
  failed(event: DeletionEvent): Promise<void>;
}
export interface MediaDeletionFiles {
  remove(assetId: Uuid, sessionIds: readonly Uuid[], finalize: () => Promise<void>): Promise<void>;
}
