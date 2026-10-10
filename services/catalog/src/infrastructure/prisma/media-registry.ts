import { ApplicationError, uuid, version, mediaEvent } from '@golden-lift/contracts';
import type {
  MediaEvent,
  MediaContext,
  MediaAction,
  Uuid,
  MediaKind,
  Version,
} from '@golden-lift/contracts';
import { retryTransaction, sqlState } from '@golden-lift/platform';
import type { CatalogMediaRegistry } from '../../application/ports/media.js';
import type { PrismaClient, Database } from './client.js';

export class PrismaMediaRegistry implements CatalogMediaRegistry {
  constructor(
    private readonly database: PrismaClient,
    private readonly grantSeconds: number,
  ) {}
  private async transaction<T>(work: (tx: Database) => Promise<T>) {
    try {
      return await retryTransaction(() =>
        this.database.$transaction(work, { isolationLevel: 'Serializable', timeout: 10000 }),
      );
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      if (sqlState(error) === '23514')
        throw new ApplicationError(
          'INVALID_STATE',
          'Active Catalog references prevent this operation.',
        );
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Catalog media coordination is unavailable.',
      );
    }
  }
  apply(event: MediaEvent) {
    if (event.producer !== 'media')
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid event producer.');
    return this.transaction(async (tx) => {
      const seen = await tx.inboxMessages.findUnique({
        where: {
          consumer_name_message_id: { consumer_name: 'catalog-media-v1', message_id: event.id },
        },
      });
      if (seen) return;
      const deleted = await tx.deletionOperations.findFirst({
        where: { asset_ids: { has: event.assetId } },
      });
      if (deleted) {
        await tx.inboxMessages.create({
          data: { consumer_name: 'catalog-media-v1', message_id: event.id },
        });
        return;
      }
      const previous = await tx.mediaAssetRefs.findUnique({ where: { id: event.assetId } });
      if (!previous) {
        await tx.mediaAssetRefs.create({
          data: {
            id: event.assetId,
            media_kind: event.kind,
            source_version: BigInt(event.sourceVersion),
            ready_at: event.type === 'media.asset.ready.v1' ? new Date() : null,
            security_blocked: event.blocked,
          },
        });
      } else if (!previous.deleted_at) {
        if (previous.media_kind !== event.kind)
          throw new ApplicationError('INVALID_STATE', 'Media kind changed.');
        const newer = BigInt(event.sourceVersion) > previous.source_version;
        // Readiness evidence may arrive after a newer security block. Preserve that block and the version watermark.
        if (newer || (event.type === 'media.asset.ready.v1' && !previous.ready_at))
          await tx.mediaAssetRefs.update({
            where: { id: event.assetId },
            data: {
              ...(newer
                ? { source_version: BigInt(event.sourceVersion), security_blocked: event.blocked }
                : {}),
              ...(event.type === 'media.asset.ready.v1'
                ? { ready_at: previous.ready_at ?? new Date() }
                : {}),
            },
          });
      }
      await tx.inboxMessages.create({
        data: { consumer_name: 'catalog-media-v1', message_id: event.id },
      });
    });
  }
  async registration(id: Uuid) {
    const row = await this.database.mediaAssetRefs.findUnique({ where: { id } });
    return {
      registered: !!row?.ready_at,
      retired: !!row?.deleted_at,
      blocked: !!row?.security_blocked,
    };
  }
  usage(id: Uuid, after: number, limit: number) {
    if (
      !Number.isInteger(after) ||
      after < 0 ||
      after > 100000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid usage pagination.');
    return this.transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { owner_type: string; owner_id: string | null }[]
      >`SELECT owner_type,owner_id FROM catalog.active_asset_usage
        WHERE asset_id=${id}::uuid ORDER BY owner_type,owner_id NULLS FIRST OFFSET ${after} LIMIT ${limit}`;
      return rows.map((r) => ({
        ownerType: r.owner_type,
        ownerId: r.owner_id ? uuid(r.owner_id) : null,
      }));
    });
  }
  authorize(id: Uuid, context: MediaContext, action: MediaAction) {
    return this.transaction(async (tx) => {
      const start = new Date();
      if (context.ownerType === 'TECHNICAL_SOURCE' && action !== 'DOWNLOAD')
        throw new ApplicationError('FORBIDDEN', 'Public PDF preview is not authorized.');
      const rows = await tx.$queryRaw<
        { eligible: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM catalog.public_asset_usage u
        JOIN catalog.media_asset_refs a ON a.id=u.asset_id WHERE u.asset_id=${id}::uuid AND u.owner_type=${context.ownerType}
          AND u.owner_id IS NOT DISTINCT FROM ${context.ownerId}::uuid AND NOT a.security_blocked AND a.deleted_at IS NULL AND NOT a.deletion_pending
          AND (u.owner_type <> 'PRODUCT' OR EXISTS(SELECT 1 FROM catalog.products p WHERE p.id=u.owner_id AND p.is_active AND p.deleted_at IS NULL))) eligible`;
      if (!rows[0]?.eligible)
        throw new ApplicationError('FORBIDDEN', 'Media is not public in this context.');
      return { expiresAt: new Date(start.getTime() + this.grantSeconds * 1000).toISOString() };
    });
  }
  retire(id: Uuid, kind: MediaKind, sourceVersion: Version) {
    return this.transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { event_id: string }[]
      >`SELECT catalog.retire_media_asset(${id}::uuid,${kind},${BigInt(sourceVersion)}) event_id`;
      const eventId = uuid(rows[0]?.event_id);
      const existingEvent = await tx.outboxEvents.findUniqueOrThrow({ where: { id: eventId } });
      if (existingEvent.event_type === 'catalog.asset.retired.v1')
        return mediaEvent(existingEvent.payload);
      const event: MediaEvent = {
        schemaVersion: 1,
        id: eventId,
        producer: 'catalog',
        type: 'catalog.asset.retired.v1',
        assetId: id,
        kind,
        sourceVersion: version(sourceVersion),
        blocked: false,
      };
      // Extend the legacy retirement event payload in this same transaction; unrelated events are untouched.
      await tx.outboxEvents.update({
        where: { id: eventId },
        data: { event_type: event.type, payload: { ...event } },
      });
      return event;
    });
  }
}
