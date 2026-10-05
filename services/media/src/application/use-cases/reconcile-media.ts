import type { Uuid } from '@golden-lift/contracts';
import type { MediaUnitOfWork } from '../ports/media.js';
import type { PrivateStorage } from '../ports/storage.js';
export class ReconcileMedia {
  constructor(
    private readonly transactions: MediaUnitOfWork,
    private readonly storage: PrivateStorage,
    private readonly attempts: number,
  ) {}
  async execute(after: Uuid | null, limit: number) {
    const changed = await this.transactions.execute((r) => r.reconcile(limit, this.attempts));
    const assets = await this.transactions.execute((r) => r.list(after, limit));
    let blocked = 0;
    for (const asset of assets) {
      if (asset.status !== 'READY' || asset.security !== 'VERIFIED') continue;
      let available = await this.storage.available(asset.key, asset.bytes!);
      for (const variant of asset.variants)
        if (!(await this.storage.available(variant.key, variant.bytes))) available = false;
      if (!available) {
        await this.transactions.execute((r) => r.block(asset.id, asset.version));
        blocked++;
      }
    }
    return {
      expiredOrExhausted: changed,
      blockedMissingObjects: blocked,
      next: assets.length === limit ? assets.at(-1)!.id : null,
    };
  }
}
