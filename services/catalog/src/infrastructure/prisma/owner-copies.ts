import { ApplicationError } from '@business-platform/contracts';
import type { Uuid } from '@business-platform/contracts';
import type { PrismaClient } from './client.js';
import { retryTransaction } from '@business-platform/platform';
export class CatalogOwnerCopies {
  constructor(private readonly db: PrismaClient) {}
  async holders() {
    return this.db.$queryRaw<
      { assetId: string; ownerType: 'PRODUCT' | 'CATEGORY'; ownerId: string }[]
    >`
    WITH owners AS(SELECT DISTINCT asset_id,'PRODUCT' owner_type,product_id owner_id FROM catalog.product_media WHERE deleted_at IS NULL
      UNION SELECT cover_asset_id,'CATEGORY',id FROM catalog.categories WHERE cover_asset_id IS NOT NULL AND deleted_at IS NULL
      UNION SELECT asset_id,owner_type,owner_id FROM catalog.active_asset_usage WHERE owner_type NOT IN ('PRODUCT','CATEGORY')),shared AS(SELECT asset_id FROM owners GROUP BY asset_id HAVING count(*)>1)
    SELECT o.asset_id::text "assetId",o.owner_type "ownerType",o.owner_id::text "ownerId" FROM owners o JOIN shared s ON s.asset_id=o.asset_id WHERE o.owner_type IN ('PRODUCT','CATEGORY') ORDER BY o.asset_id,o.owner_type,o.owner_id`;
  }
  switch(
    source: Uuid,
    target: Uuid,
    type: 'PRODUCT' | 'CATEGORY',
    owner: Uuid,
    kind: string,
    sourceVersion: string,
  ) {
    return retryTransaction(
      () =>
        this.db.$transaction(
          async (tx) => {
            const existing = await tx.mediaAssetRefs.findUnique({ where: { id: target } });
            if (
              existing &&
              (existing.media_kind !== kind ||
                existing.source_version !== BigInt(sourceVersion) ||
                !existing.ready_at ||
                existing.deleted_at ||
                existing.security_blocked ||
                existing.deletion_pending)
            )
              throw new ApplicationError(
                'INVALID_STATE',
                'Owner-copy target registration differs from verified Media evidence.',
              );
            if (!existing)
              await tx.mediaAssetRefs.create({
                data: {
                  id: target,
                  media_kind: kind,
                  source_version: BigInt(sourceVersion),
                  ready_at: new Date(),
                },
              });
            if (type === 'PRODUCT') {
              if (
                await tx.productMedia.count({
                  where: { product_id: owner, asset_id: target, deleted_at: null },
                })
              )
                return;
              const changed = await tx.productMedia.updateMany({
                where: { product_id: owner, asset_id: source, deleted_at: null },
                data: { asset_id: target },
              });
              if (!changed.count)
                throw new ApplicationError(
                  'VERSION_CONFLICT',
                  'Owner-copy holder changed before switch.',
                );
              await tx.products.update({ where: { id: owner }, data: { updated_at: new Date() } });
            } else {
              const current = await tx.categories.findUniqueOrThrow({ where: { id: owner } });
              if (current.cover_asset_id === target) return;
              if (current.cover_asset_id !== source)
                throw new ApplicationError(
                  'VERSION_CONFLICT',
                  'Category cover changed before owner-copy switch.',
                );
              await tx.categories.update({
                where: { id: owner },
                data: { cover_asset_id: target },
              });
            }
          },
          { isolationLevel: 'Serializable', timeout: 15000 },
        ),
      3,
    );
  }
}
