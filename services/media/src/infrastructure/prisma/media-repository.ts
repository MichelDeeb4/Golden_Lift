import { randomUUID } from 'node:crypto';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { MediaKind, MediaEvent, Uuid, Version } from '@golden-lift/contracts';
import { retryTransaction, sqlState } from '@golden-lift/platform';
import type {
  MediaStatistics,
  MediaRepository,
  MediaUnitOfWork,
  MediaAsset,
  UploadSession,
  ProcessingClaim,
  ProcessingResult,
} from '../../application/ports/media.js';
import type { StoredObject } from '../../application/ports/storage.js';
import type { MediaPolicy, UploadInput } from '../../domain/media-policy.js';
import type { Database, PrismaClient } from './client.js';
import type {
  Prisma,
  Assets,
  UploadSessions,
  AssetVariants,
  ProcessingJobs,
} from './generated/client.js';

const conflict = () =>
  new ApplicationError('VERSION_CONFLICT', 'The Media operation changed; refresh and retry.');
function session(row: UploadSessions): UploadSession {
  return {
    id: uuid(row.id),
    assetId: uuid(row.asset_id),
    uploader: uuid(row.uploader_staff_id),
    status: row.status,
    expires: row.expires_at.toISOString(),
    version: version(String(row.version)),
    bytes: String(row.expected_byte_size),
    declaredSha256: row.declared_sha256,
    parts: row.parts as unknown as Record<string, StoredObject>,
    sealingToken: row.sealing_token ? uuid(row.sealing_token) : null,
  };
}
function asset(
  row: Assets & { asset_variants: AssetVariants[]; processing_jobs: ProcessingJobs[] },
): MediaAsset {
  return {
    jobs: row.processing_jobs.map((j) => ({
      id: uuid(j.id),
      status: j.status,
      attempts: j.attempts,
      nextAttemptAt: j.next_attempt_at.toISOString(),
      failureCode:
        j.last_error && /^[A-Z_]{1,64}$/.test(j.last_error)
          ? j.last_error
          : j.last_error
            ? 'PROCESSOR_FAILED'
            : null,
    })),
    originalName: row.original_name,
    inputVersion: row.input_version,
    id: uuid(row.id),
    kind: row.media_kind as MediaKind,
    status: row.status as MediaAsset['status'],
    security: row.security_state as MediaAsset['security'],
    version: version(String(row.version)),
    deleted: row.deleted_at !== null,
    key: row.storage_key,
    bytes: row.byte_size?.toString() ?? null,
    sha256: row.sha256 ? Buffer.from(row.sha256).toString('hex') : null,
    mime: row.detected_mime_type,
    failure: row.failure_code,
    variants: row.asset_variants
      .filter((v) => v.deleted_at === null)
      .map((v) => ({
        key: v.storage_key,
        profile: v.variant_key,
        bytes: String(v.byte_size),
        sha256: v.sha256 ? Buffer.from(v.sha256).toString('hex') : '',
        version: v.object_version,
        mime: v.mime_type,
        width: v.width_px,
        height: v.height_px,
        duration: v.duration_ms?.toString() ?? null,
      })),
  };
}
export class PrismaMediaUnitOfWork implements MediaUnitOfWork {
  constructor(private readonly database: PrismaClient) {}
  async execute<T>(work: (repository: MediaRepository) => Promise<T>): Promise<T> {
    try {
      return await retryTransaction(() =>
        this.database.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET LOCAL lock_timeout='3s'`;
            await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
            return work(new PrismaMediaRepository(tx));
          },
          { isolationLevel: 'Serializable', timeout: 10000, maxWait: 3000 },
        ),
      );
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      const state = sqlState(error);
      if (state === '23505')
        throw new ApplicationError('CONFLICT', 'A conflicting Media operation exists.');
      if (state === '23514' || state === '23503')
        throw new ApplicationError(
          'INVALID_STATE',
          'Media integrity rules rejected the operation.',
        );
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Media persistence is temporarily unavailable.',
      );
    }
  }
}
class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly db: Database) {}
  async statistics(): Promise<MediaStatistics> {
    const rows = await this.db.$queryRaw<MediaStatistics[]>`SELECT
      (SELECT coalesce(sum(reserved_byte_size),0)::text FROM media.upload_sessions) "retainedReservationBytes",
      (SELECT coalesce(sum(byte_size),0)::text FROM media.assets) "knownOriginalBytes",
      (SELECT coalesce(sum(byte_size),0)::text FROM (SELECT DISTINCT storage_bucket,storage_key,byte_size FROM media.asset_variants) v) "knownOutputBytes",
      (SELECT count(*)::text FROM media.processing_jobs WHERE status IN ('QUEUED','RUNNING') AND deleted_at IS NULL) "pendingJobs",
      (SELECT min(created_at)::text FROM media.processing_jobs WHERE status IN ('QUEUED','RUNNING') AND deleted_at IS NULL) "oldestJobAt",
      (SELECT count(*)::text FROM ops.outbox_events WHERE published_at IS NULL AND deleted_at IS NULL AND event_type IN ('media.asset.ready.v1','media.asset.security.v1')) "pendingEvents",
      (SELECT count(*)::text FROM ops.outbox_events WHERE published_at IS NULL AND attempts>=20 AND deleted_at IS NULL AND event_type IN ('media.asset.ready.v1','media.asset.security.v1')) "exhaustedEvents",
      (SELECT coalesce(sum(GREATEST(0,jsonb_array_length(attempt_history)-CASE WHEN status='SUCCEEDED' THEN 1 ELSE 0 END)),0)::text FROM media.processing_jobs) "unselectedAttempts"`;
    return rows[0]!;
  }
  async allocate(
    input: UploadInput,
    actor: Uuid,
    assetId: Uuid,
    sessionId: Uuid,
    hash: string,
    bucket: string,
    policy: MediaPolicy,
  ) {
    // SERIALIZABLE predicate reads protect distributed quotas; concurrent inserts retry the entire transaction.
    const existing = await this.db.uploadSessions.findFirst({
      where: { uploader_staff_id: actor, idempotency_key: input.idempotencyKey },
    });
    if (existing) {
      if (existing.request_hash !== hash)
        throw new ApplicationError('CONFLICT', 'Idempotency key has a different request.');
      return session(existing);
    }
    const now = new Date();
    const [mine, global, reserved, jobs] = await Promise.all([
      this.db.uploadSessions.count({
        where: {
          uploader_staff_id: actor,
          status: { in: ['OPEN', 'SEALING'] },
          expires_at: { gt: now },
          deleted_at: null,
        },
      }),
      this.db.uploadSessions.count({
        where: { status: { in: ['OPEN', 'SEALING'] }, expires_at: { gt: now }, deleted_at: null },
      }),
      this.db.$queryRaw<
        { reserved: string }[]
      >`SELECT coalesce(sum(CASE WHEN reserved_byte_size>0 THEN reserved_byte_size ELSE coalesce(expected_byte_size,0)*2 END),0)::text reserved FROM media.upload_sessions`,
      this.db.processingJobs.count({
        where: { status: { in: ['QUEUED', 'RUNNING'] }, deleted_at: null },
      }),
    ]);
    // Reservation remains charged after cancellation/expiry because retained bytes may still exist.
    if (
      mine >= policy.adminSessions ||
      global >= policy.globalSessions ||
      jobs >= policy.pendingJobs ||
      BigInt(reserved[0]?.reserved ?? '0') +
        BigInt(input.bytes) * 2n +
        BigInt(policy.outputBytes[input.kind]) >
        BigInt(policy.reservedBytes)
    )
      throw new ApplicationError(
        'RATE_LIMITED',
        'Media capacity is reserved; contact the operator.',
      );
    await this.db.assets.create({
      data: {
        id: assetId,
        media_kind: input.kind,
        original_name: input.name,
        storage_bucket: bucket,
        storage_key: 'originals/' + assetId,
        metadata: { purpose: input.purpose },
      },
    });
    return session(
      await this.db.uploadSessions.create({
        data: {
          id: sessionId,
          asset_id: assetId,
          uploader_staff_id: actor,
          expected_byte_size: BigInt(input.bytes),
          reserved_byte_size: BigInt(input.bytes) * 2n + BigInt(policy.outputBytes[input.kind]),
          expires_at: new Date(now.getTime() + policy.sessionSeconds * 1000),
          idempotency_key: input.idempotencyKey,
          request_hash: hash,
          declared_sha256: input.sha256,
          purpose: input.purpose,
        },
      }),
    );
  }
  async session(id: Uuid) {
    const row = await this.db.uploadSessions.findUnique({ where: { id } });
    if (!row) throw new ApplicationError('NOT_FOUND', 'Upload not found.');
    return session(row);
  }
  private async lockSession(id: Uuid, actor?: Uuid) {
    await this.db.$queryRaw`SELECT id FROM media.upload_sessions WHERE id=${id}::uuid FOR UPDATE`;
    const row = await this.session(id);
    if (actor && row.uploader !== actor)
      throw new ApplicationError('FORBIDDEN', 'Upload belongs to another Admin.');
    return row;
  }
  private open(row: UploadSession) {
    if (row.status !== 'OPEN' || new Date(row.expires) <= new Date())
      throw new ApplicationError('INVALID_STATE', 'Upload is closed or expired.');
  }
  async part(id: Uuid, actor: Uuid, index: number, object: StoredObject) {
    const row = await this.lockSession(id, actor);
    this.open(row);
    const previous = row.parts[String(index)];
    if (previous) {
      if (previous.sha256 !== object.sha256 || previous.bytes !== object.bytes)
        throw new ApplicationError('CONFLICT', 'Part is already immutable.');
      return row;
    }
    return session(
      await this.db.uploadSessions.update({
        where: { id },
        data: { parts: { ...row.parts, [index]: object } as unknown as Prisma.InputJsonValue },
      }),
    );
  }
  async beginSeal(id: Uuid, actor: Uuid, expected: Version, token: Uuid) {
    const row = await this.lockSession(id, actor);
    if (row.status === 'COMPLETED') return row;
    if (row.status === 'SEALING' && new Date(row.expires) > new Date()) return row;
    this.open(row);
    if (row.version !== expected) throw conflict();
    return session(
      await this.db.uploadSessions.update({
        where: { id },
        data: { status: 'SEALING', sealing_token: token },
      }),
    );
  }
  async complete(id: Uuid, token: Uuid, object: StoredObject) {
    const row = await this.lockSession(id);
    if (row.status === 'COMPLETED') return row;
    if (
      row.status !== 'SEALING' ||
      row.sealingToken !== token ||
      new Date(row.expires) <= new Date()
    )
      throw conflict();
    if (object.bytes !== row.bytes || (row.declaredSha256 && row.declaredSha256 !== object.sha256))
      throw new ApplicationError('VALIDATION_FAILED', 'Sealed size or checksum mismatch.');
    const a = await this.asset(row.assetId);
    if (a.deleted || a.status !== 'UPLOADING' || object.key !== a.key) throw conflict();
    await this.db.assets.update({
      where: { id: row.assetId },
      data: {
        status: 'PROCESSING',
        byte_size: BigInt(object.bytes),
        sha256: Buffer.from(object.sha256, 'hex'),
        input_version: object.version,
      },
    });
    await this.db.processingJobs.create({ data: { asset_id: row.assetId, job_type: 'VALIDATE' } });
    return session(
      await this.db.uploadSessions.update({
        where: { id },
        data: { status: 'COMPLETED', completed_at: new Date() },
      }),
    );
  }
  async cancel(id: Uuid, actor: Uuid, expected: Version) {
    const row = await this.lockSession(id, actor);
    if (row.status === 'CANCELLED') return row;
    if (!['OPEN', 'SEALING'].includes(row.status) || row.version !== expected) throw conflict();
    await this.db.assets.update({
      where: { id: row.assetId },
      data: { status: 'FAILED', failure_code: 'UPLOAD_CANCELLED' },
    });
    return session(
      await this.db.uploadSessions.update({ where: { id }, data: { status: 'CANCELLED' } }),
    );
  }
  async asset(id: Uuid) {
    const row = await this.db.assets.findUnique({
      where: { id },
      include: {
        asset_variants: { where: { deleted_at: null }, take: 10 },
        processing_jobs: { where: { deleted_at: null }, orderBy: { created_at: 'desc' }, take: 10 },
      },
    });
    if (!row) throw new ApplicationError('NOT_FOUND', 'Asset not found.');
    return asset(row);
  }
  async list(after: Uuid | null, limit: number) {
    return (
      await this.db.assets.findMany({
        where: { deleted_at: null, ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: 'asc' },
        take: limit,
        include: {
          asset_variants: { where: { deleted_at: null }, take: 10 },
          processing_jobs: {
            where: { deleted_at: null },
            orderBy: { created_at: 'desc' },
            take: 10,
          },
        },
      })
    ).map(asset);
  }
  async claim(kind: MediaKind, token: Uuid, maxAttempts: number): Promise<ProcessingClaim | null> {
    const rows = await this.db.$queryRaw<{ id: string; asset_id: string; attempts: number }[]>`
      WITH picked AS (SELECT j.id FROM media.processing_jobs j JOIN media.assets a ON a.id=j.asset_id
        WHERE j.deleted_at IS NULL AND a.deleted_at IS NULL AND
          ((a.status='PROCESSING' AND a.security_state='UNVERIFIED') OR
           (a.status='READY' AND a.security_state='VERIFIED' AND j.job_type<>'VALIDATE'))
          AND a.media_kind=${kind} AND j.attempts<${maxAttempts}
          AND ((j.status='QUEUED' AND j.next_attempt_at<=clock_timestamp()) OR (j.status='RUNNING' AND j.locked_until<clock_timestamp()))
        ORDER BY j.next_attempt_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED)
      UPDATE media.processing_jobs j SET status='RUNNING',attempts=j.attempts+1,lease_token=${token}::uuid,
        attempt_history=j.attempt_history||jsonb_build_array(jsonb_build_object('token',${token}::text,'claimedAt',clock_timestamp())),
        locked_until=clock_timestamp()+interval '120 seconds' FROM picked p WHERE j.id=p.id RETURNING j.id,j.asset_id,j.attempts`;
    const row = rows[0];
    return row
      ? {
          jobId: uuid(row.id),
          token,
          asset: await this.asset(uuid(row.asset_id)),
          attempt: row.attempts,
        }
      : null;
  }
  async renew(job: Uuid, token: Uuid) {
    return (
      (await this.db
        .$executeRaw`UPDATE media.processing_jobs j SET locked_until=clock_timestamp()+interval '120 seconds'
      FROM media.assets a WHERE j.id=${job}::uuid AND j.lease_token=${token}::uuid AND j.status='RUNNING'
        AND j.locked_until>clock_timestamp() AND j.deleted_at IS NULL AND a.id=j.asset_id AND a.deleted_at IS NULL
        AND ((a.security_state='UNVERIFIED' AND a.status='PROCESSING') OR
          (a.security_state='VERIFIED' AND a.status='READY' AND j.job_type<>'VALIDATE'))`) === 1
    );
  }
  private async fence(claim: ProcessingClaim) {
    const rows = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT j.id FROM media.processing_jobs j JOIN media.assets a ON a.id=j.asset_id
      WHERE j.id=${claim.jobId}::uuid AND j.lease_token=${claim.token}::uuid AND j.status='RUNNING' AND j.locked_until>clock_timestamp()
        AND j.deleted_at IS NULL AND a.deleted_at IS NULL AND
          ((a.status='PROCESSING' AND a.security_state='UNVERIFIED') OR
           (a.status='READY' AND a.security_state='VERIFIED' AND j.job_type<>'VALIDATE'))
      FOR UPDATE OF j,a`;
    return rows.length === 1;
  }
  async ready(claim: ProcessingClaim, result: ProcessingResult) {
    if (!(await this.fence(claim))) return false;
    const id = claim.asset.id;
    if (claim.asset.status === 'READY')
      await this.db.assetVariants.updateMany({
        where: { asset_id: id, deleted_at: null },
        data: { deleted_at: new Date() },
      });
    for (const v of result.variants)
      await this.db.assetVariants.create({
        data: {
          asset_id: id,
          variant_key: v.profile,
          storage_bucket: (await this.db.assets.findUniqueOrThrow({ where: { id } }))
            .storage_bucket,
          storage_key: v.key,
          mime_type: v.mime,
          byte_size: BigInt(v.bytes),
          width_px: v.width,
          height_px: v.height,
          duration_ms: v.duration ? BigInt(v.duration) : null,
          sha256: Buffer.from(v.sha256, 'hex'),
          generation: claim.token,
          object_version: v.version,
        },
      });
    const row = await this.db.assets.update({
      where: { id },
      data: {
        status: 'READY',
        security_state: 'VERIFIED',
        detected_mime_type: result.mime,
        width_px: result.width,
        height_px: result.height,
        duration_ms: result.duration ? BigInt(result.duration) : null,
        pipeline_version: 'b5-v1',
        verification: { ...result.evidence },
        failure_code: null,
      },
    });
    await this.db.processingJobs.update({
      where: { id: claim.jobId },
      data: { status: 'SUCCEEDED', locked_until: null },
    });
    await this.event({
      schemaVersion: 1,
      id: uuid(randomUUID()),
      producer: 'media',
      type: 'media.asset.ready.v1',
      assetId: id,
      kind: claim.asset.kind,
      sourceVersion: version(String(row.version)),
      blocked: false,
    });
    return true;
  }
  private async event(event: MediaEvent) {
    await this.db.outboxEvents.create({
      data: {
        id: event.id,
        aggregate_type: 'MediaAsset',
        aggregate_id: event.assetId,
        aggregate_version: BigInt(event.sourceVersion),
        event_type: event.type,
        payload: { ...event },
      },
    });
  }
  async fail(claim: ProcessingClaim, code: string, permanent: boolean, maxAttempts: number) {
    if (!(await this.fence(claim))) return;
    const exhausted = permanent || claim.attempt >= maxAttempts;
    await this.db.processingJobs.update({
      where: { id: claim.jobId },
      data: {
        status: exhausted ? 'FAILED' : 'QUEUED',
        next_attempt_at: new Date(
          Date.now() +
            Math.min(300000, 1000 * 2 ** claim.attempt) +
            Math.floor(Math.random() * 1000),
        ),
        locked_until: null,
        last_error: code,
      },
    });
    await this.db.assets.update({
      where: { id: claim.asset.id },
      data: {
        failure_code: code,
        ...(exhausted && claim.asset.status !== 'READY'
          ? { status: 'FAILED', security_state: permanent ? 'REJECTED' : 'UNVERIFIED' }
          : {}),
      },
    });
  }
  async retry(id: Uuid, expected: Version) {
    const a = await this.asset(id);
    if (a.version !== expected) throw conflict();
    if (a.deleted || a.status !== 'FAILED' || a.security !== 'UNVERIFIED' || !a.sha256)
      throw new ApplicationError(
        'INVALID_STATE',
        'Only exhausted infrastructure failures can be retried.',
      );
    await this.db.assets.update({
      where: { id },
      data: { status: 'PROCESSING', failure_code: null },
    });
    await this.db.processingJobs.create({ data: { asset_id: id, job_type: 'VALIDATE' } });
    return this.asset(id);
  }
  async block(id: Uuid, expected: Version) {
    const a = await this.asset(id);
    if (a.deleted || a.version !== expected) throw conflict();
    const row = await this.db.assets.update({ where: { id }, data: { security_state: 'BLOCKED' } });
    await this.event({
      schemaVersion: 1,
      id: uuid(randomUUID()),
      producer: 'media',
      type: 'media.asset.security.v1',
      assetId: id,
      kind: a.kind,
      sourceVersion: version(String(row.version)),
      blocked: true,
    });
    return this.asset(id);
  }
  async reprocess(id: Uuid, expected: Version) {
    const a = await this.asset(id);
    if (a.version !== expected) throw conflict();
    if (a.deleted || a.status !== 'READY' || a.security !== 'VERIFIED' || !a.sha256)
      throw new ApplicationError('INVALID_STATE', 'Only verified ready assets can be regenerated.');
    const types = { IMAGE: 'IMAGE_VARIANTS', VIDEO: 'VIDEO_TRANSCODE', PDF: 'PDF_PREVIEW' };
    await this.db.assets.update({ where: { id }, data: { failure_code: null } });
    await this.db.processingJobs.create({ data: { asset_id: id, job_type: types[a.kind] } });
    return this.asset(id);
  }
  async retire(event: MediaEvent) {
    const duplicate = await this.db.inboxMessages.findUnique({
      where: {
        consumer_name_message_id: { consumer_name: 'media-retirement-v1', message_id: event.id },
      },
    });
    if (duplicate) return;
    const a = await this.asset(event.assetId);
    if (!a.deleted) {
      const stamp = new Date();
      await this.db.assets.update({
        where: { id: event.assetId },
        data: { deleted_at: stamp, retirement_event_id: event.id },
      });
      await this.db.assetVariants.updateMany({
        where: { asset_id: event.assetId, deleted_at: null },
        data: { deleted_at: stamp },
      });
      await this.db.processingJobs.updateMany({
        where: { asset_id: event.assetId, deleted_at: null },
        data: { deleted_at: stamp },
      });
      await this.db.uploadSessions.updateMany({
        where: { asset_id: event.assetId, deleted_at: null },
        data: { deleted_at: stamp },
      });
    }
    await this.db.inboxMessages.create({
      data: { consumer_name: 'media-retirement-v1', message_id: event.id },
    });
  }
  async reconcile(limit: number, maxAttempts = 5) {
    const exhausted = await this.db.processingJobs.findMany({
      where: {
        status: 'RUNNING',
        deleted_at: null,
        attempts: { gte: maxAttempts },
        locked_until: { lte: new Date() },
      },
      take: limit,
    });
    for (const job of exhausted) {
      await this.db.processingJobs.update({
        where: { id: job.id },
        data: { status: 'FAILED', last_error: 'LEASE_EXHAUSTED', locked_until: null },
      });
      const a = await this.asset(uuid(job.asset_id));
      if (!a.deleted)
        await this.db.assets.update({
          where: { id: a.id },
          data: {
            failure_code: 'LEASE_EXHAUSTED',
            ...(a.status === 'READY' ? {} : { status: 'FAILED' }),
          },
        });
    }
    const rows = await this.db.uploadSessions.findMany({
      where: {
        deleted_at: null,
        status: { in: ['OPEN', 'SEALING'] },
        expires_at: { lte: new Date() },
      },
      take: limit,
    });
    for (const row of rows) {
      await this.db.uploadSessions.update({ where: { id: row.id }, data: { status: 'EXPIRED' } });
      await this.db.assets.update({
        where: { id: row.asset_id },
        data: { status: 'FAILED', failure_code: 'UPLOAD_EXPIRED' },
      });
    }
    return rows.length + exhausted.length;
  }
}
