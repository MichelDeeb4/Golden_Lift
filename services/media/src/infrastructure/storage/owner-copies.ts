import { randomUUID } from 'node:crypto';
import { ApplicationError } from '@golden-lift/contracts';
import { retryTransaction } from '@golden-lift/platform';
import type { Uuid } from '@golden-lift/contracts';
import type { DeletionStorage, StoredObject } from '../../application/ports/storage.js';
import type { PrismaClient } from '../prisma/client.js';
import type { Prisma } from '../prisma/generated/client.js';
import type { FencedStorage } from './fenced.js';

/** Reviewed migration adapter. Copies and verifies bytes before committing any new READY metadata.
 * The manifest supplies stable target IDs; retries verify existing target objects rather than overwrite.
 */
export class MediaOwnerCopies {
  constructor(
    private readonly db: PrismaClient,
    private readonly files: DeletionStorage,
    private readonly fence: FencedStorage,
  ) {}
  async copy(sourceId: Uuid, targetId: Uuid) {
    if (sourceId === targetId)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Owner copies need distinct asset identities.',
      );
    return this.fence.withOwner(sourceId, true, async () => {
      const source = await this.db.assets.findUniqueOrThrow({
        where: { id: sourceId },
        include: { asset_variants: true, processing_jobs: true, upload_sessions: true },
      });
      if (
        source.deletion_pending ||
        source.deleted_at ||
        source.status !== 'READY' ||
        source.security_state !== 'VERIFIED' ||
        source.storage_bucket !== this.files.bucket ||
        source.asset_variants.some((v) => v.storage_bucket !== this.files.bucket) ||
        source.processing_jobs.some((j) => ['QUEUED', 'RUNNING'].includes(j.status)) ||
        source.upload_sessions.some((s) => ['OPEN', 'SEALING'].includes(s.status))
      )
        throw new ApplicationError(
          'INVALID_STATE',
          'Owner-copy migration requires a verified, quiescent source.',
        );
      const prior = await this.db.assets.findUnique({ where: { id: targetId } });
      if (prior) {
        const meta = prior.metadata as Record<string, unknown>;
        if (meta['copiedFrom'] !== sourceId)
          throw new ApplicationError('CONFLICT', 'Owner-copy identity is already used.');
        if (
          prior.deleted_at ||
          prior.deletion_pending ||
          prior.status !== 'READY' ||
          prior.security_state !== 'VERIFIED'
        )
          throw new ApplicationError(
            'INVALID_STATE',
            'An owner copy is no longer available for migration replay.',
          );
      }
      const copied = new Map<string, StoredObject>();
      const keyFor = (key: string) => key.replace('/' + sourceId, '/' + targetId);
      for (const prefix of ['originals/', 'outputs/', 'quarantine/'])
        for (const object of await this.files.inventory(prefix + sourceId)) {
          const bytes = Number(object.bytes);
          if (!Number.isSafeInteger(bytes) || bytes < 0)
            throw new ApplicationError(
              'INVALID_STATE',
              'Owner-copy object exceeds supported size.',
            );
          const original = await this.files.inspect(object.key, bytes),
            newKey = keyFor(object.key);
          let copy: StoredObject;
          if (await this.files.available(newKey, object.bytes))
            copy = await this.files.inspect(newKey, bytes);
          else copy = await this.files.put(newKey, await this.files.read(object.key), bytes);
          const verified = await this.files.inspect(newKey, bytes);
          if (original.sha256 !== verified.sha256 || original.bytes !== verified.bytes)
            throw new ApplicationError('INVALID_STATE', 'Owner-copy verification failed.');
          copied.set(object.key, { ...copy, sha256: verified.sha256, bytes: verified.bytes });
        }
      const original = copied.get(source.storage_key);
      if (
        !original ||
        !source.sha256 ||
        original.sha256 !== Buffer.from(source.sha256).toString('hex')
      )
        throw new ApplicationError('INVALID_STATE', 'Verified original is missing or changed.');
      for (const variant of source.asset_variants) {
        const copy = copied.get(variant.storage_key);
        if (
          !copy ||
          String(variant.byte_size) !== copy.bytes ||
          (variant.sha256 && Buffer.from(variant.sha256).toString('hex') !== copy.sha256)
        )
          throw new ApplicationError('INVALID_STATE', 'Retained derivative is missing or changed.');
      }
      if (prior) return { kind: prior.media_kind, sourceVersion: String(prior.version) };
      await retryTransaction(
        () =>
          this.db.$transaction(
            async (tx) => {
              const current = await tx.assets.findUniqueOrThrow({ where: { id: sourceId } });
              if (current.version !== source.version)
                throw new ApplicationError('VERSION_CONFLICT', 'Owner-copy source changed.');
              const { asset_variants, processing_jobs, upload_sessions, ...asset } = source;
              await tx.assets.create({
                data: {
                  ...asset,
                  id: targetId,
                  storage_key: original.key,
                  input_version: original.version,
                  retirement_event_id: null,
                  metadata: { ...(source.metadata as Prisma.JsonObject), copiedFrom: sourceId },
                  verification: source.verification as Prisma.InputJsonObject,
                },
              });
              for (const v of asset_variants) {
                const copy = copied.get(v.storage_key)!;
                await tx.assetVariants.create({
                  data: {
                    ...v,
                    id: randomUUID(),
                    asset_id: targetId,
                    storage_key: copy.key,
                    object_version: copy.version,
                  },
                });
              }
              // Upload staging belongs to the original upload session, not the delivered owner copy.
              // Source sessions/jobs and their evidence remain untouched; all retained output generations were copied.
              void processing_jobs;
              void upload_sessions;
            },
            { isolationLevel: 'Serializable', timeout: 15000 },
          ),
        3,
      );
      return { kind: source.media_kind, sourceVersion: String(source.version) };
    });
  }
}
