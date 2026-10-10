import type { Uuid } from '@business-platform/contracts';
import type { MediaDeletionFiles } from '../../application/ports/deletion.js';
import type { FencedStorage } from './fenced.js';
export class OwnedMediaDeletionFiles implements MediaDeletionFiles {
  constructor(private readonly storage: FencedStorage) {}
  remove(assetId: Uuid, sessionIds: readonly Uuid[], finalize: () => Promise<void>) {
    return this.storage.withOwner(assetId, true, async () => {
      for (const prefix of [
        'originals/' + assetId,
        'outputs/' + assetId,
        'quarantine/' + assetId,
        ...sessionIds.map((id) => 'staging/' + id),
      ])
        await this.storage.removeNamespace(prefix);
      await finalize();
    });
  }
}
