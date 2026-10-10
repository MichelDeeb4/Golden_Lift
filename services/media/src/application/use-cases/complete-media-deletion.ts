import { ApplicationError } from '@golden-lift/contracts';
import type { DeletionEvent } from '@golden-lift/contracts';
import type { MediaDeletionStore, MediaDeletionFiles } from '../ports/deletion.js';
export class CompleteMediaDeletion {
  constructor(
    private readonly store: MediaDeletionStore,
    private readonly files: MediaDeletionFiles,
  ) {}
  async execute(event: DeletionEvent) {
    if (event.producer !== 'catalog' || event.type !== 'catalog.media.delete.requested.v1')
      throw new ApplicationError('VALIDATION_FAILED', 'Unexpected Media deletion request.');
    const assets = await this.store.prepare(event);
    if (assets === null) return;
    try {
      for (const asset of assets)
        await this.files.remove(asset.assetId, asset.sessionIds, () =>
          this.store.removeMetadata(asset.assetId),
        );
      await this.store.completed(event);
    } catch {
      await this.store.failed(event);
      throw new ApplicationError(
        'MEDIA_DELETE_FAILED',
        'Media cleanup is retryable; no owner finalization has been confirmed.',
      );
    }
  }
}
