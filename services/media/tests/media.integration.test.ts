import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { MediaEvent } from '@golden-lift/contracts';
import { databaseFixture } from '../../../packages/platform/tests/support/database-fixture.js';
import { orm } from '../src/infrastructure/prisma/client.js';
import { orm as catalogOrm } from '../../catalog/src/infrastructure/prisma/client.js';
import { PrismaMediaUnitOfWork } from '../src/infrastructure/prisma/media-repository.js';
import { PrismaMediaRegistry } from '../../catalog/src/infrastructure/prisma/media-registry.js';
import { FilesystemStorage } from '../src/infrastructure/storage/filesystem.js';
import { Uploads } from '../src/application/use-cases/uploads.js';
import { MediaLibrary } from '../src/application/use-cases/library.js';
import { AuthorizeDelivery } from '../src/application/use-cases/delivery.js';
import { mediaConfig } from '../src/infrastructure/config.js';
import { mediaClock, mediaIds } from '../src/composition/dependencies.js';
import { mediaApplication } from '../src/composition/application.js';
import { httpConfig } from '@golden-lift/platform';
let fixture: Awaited<ReturnType<typeof databaseFixture>>,
  catalogFixture: Awaited<ReturnType<typeof databaseFixture>>,
  db: ReturnType<typeof orm>,
  catalogDb: ReturnType<typeof catalogOrm>,
  uow: PrismaMediaUnitOfWork,
  registry: PrismaMediaRegistry,
  directory: string,
  storage: FilesystemStorage,
  uploads: Uploads;
const actor = { id: uuid(randomUUID()), role: 'ADMIN' as const, authVersion: version('1') };
const isCode = (code: string) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;
before(async () => {
  fixture = await databaseFixture('media');
  db = orm(fixture.pool);
  uow = new PrismaMediaUnitOfWork(db);
  catalogFixture = await databaseFixture('catalog');
  catalogDb = catalogOrm(catalogFixture.pool);
  registry = new PrismaMediaRegistry(catalogDb, 300);
  directory = await mkdtemp(path.resolve('.local/b5-media-integration-'));
  storage = await FilesystemStorage.create(path.join(directory, 'objects'));
  uploads = new Uploads(uow, storage, mediaIds, mediaClock, {
    ...mediaConfig({}).policy,
    partBytes: 4,
    adminSessions: 100,
    globalSessions: 100,
  });
});
after(async () => {
  await db?.$disconnect();
  await catalogDb?.$disconnect();
  await fixture?.dispose();
  await catalogFixture?.dispose();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const input = () => ({
  kind: 'IMAGE' as const,
  name: 'synthetic.png',
  bytes: '8',
  purpose: 'CATALOG' as const,
  sha256: null,
  idempotencyKey: randomBytes(24).toString('base64url'),
});
async function completed() {
  let row = await uploads.initiate(input(), actor);
  row = await uploads.part(row.id, 1, Buffer.from('abcd'), actor);
  row = await uploads.part(row.id, 2, Buffer.from('efgh'), actor);
  return uploads.complete(row.id, row.version, actor);
}
test('idempotency, ownership, immutable part replay and repeated completion retain exactly one logical job', async () => {
  const draft = input();
  let row = await uploads.initiate(draft, actor);
  assert.equal((await uploads.initiate(draft, actor)).id, row.id);
  await assert.rejects(
    uploads.initiate({ ...draft, name: 'different.png' }, actor),
    isCode('CONFLICT'),
  );
  await assert.rejects(
    uploads.status(row.id, { ...actor, id: uuid(randomUUID()) }),
    isCode('FORBIDDEN'),
  );
  await assert.rejects(uploads.complete(row.id, row.version, actor), isCode('INVALID_STATE'));
  row = await uploads.part(row.id, 1, Buffer.from('abcd'), actor);
  await assert.rejects(uploads.part(row.id, 1, Buffer.from('zzzz'), actor), isCode('CONFLICT'));
  assert.equal((await uploads.part(row.id, 1, Buffer.from('abcd'), actor)).version, row.version);
  row = await uploads.part(row.id, 2, Buffer.from('efgh'), actor);
  const done = await uploads.complete(row.id, row.version, actor);
  assert.equal((await uploads.complete(row.id, done.version, actor)).assetId, row.assetId);
  assert.equal(await db.processingJobs.count({ where: { asset_id: row.assetId } }), 1);
  await assert.rejects(
    storage.put(
      'originals/' + row.assetId,
      (async function* () {
        yield Buffer.from('overwrite');
      })(),
      9,
    ),
  );
});
test('cancelled uploads cannot complete; quota reservations remain charged', async () => {
  const row = await uploads.initiate(input(), actor);
  const cancelled = await uploads.cancel(row.id, row.version, actor);
  await assert.rejects(uploads.complete(row.id, cancelled.version, actor), isCode('INVALID_STATE'));
  assert.equal(
    (await db.uploadSessions.findUniqueOrThrow({ where: { id: row.id } })).expected_byte_size,
    8n,
  );
  await assert.rejects(
    uploads.initiate(input(), { ...actor, role: 'SUPER_ADMIN' }),
    isCode('FORBIDDEN'),
  );
});
test('sealed checksum mismatch cannot enqueue processing', async () => {
  let row = await uploads.initiate({ ...input(), sha256: '0'.repeat(64) }, actor);
  row = await uploads.part(row.id, 1, Buffer.from('abcd'), actor);
  row = await uploads.part(row.id, 2, Buffer.from('efgh'), actor);
  await assert.rejects(uploads.complete(row.id, row.version, actor), isCode('VALIDATION_FAILED'));
  assert.equal(await db.processingJobs.count({ where: { asset_id: row.assetId } }), 0);
});
test('two fixed snapshots cannot exceed a distributed one-session quota', async () => {
  const owner = uuid(randomUUID()),
    policy = { ...mediaConfig({}).policy, adminSessions: 1 };
  let arrived = 0;
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  const operation = () => {
    const a = mediaIds.uuid(),
      s = mediaIds.uuid(),
      draft = input();
    return uow.execute(async (r) => {
      await r.list(null, 100);
      if (++arrived === 2) resolve();
      await promise;
      return r.allocate(
        draft,
        owner,
        a,
        s,
        mediaIds.hash(JSON.stringify(draft)),
        storage.bucket,
        policy,
      );
    });
  };
  const outcomes = await Promise.allSettled([operation(), operation()]);
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((x) => x.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(isCode('RATE_LIMITED')(rejected.reason));
  assert.equal(await db.uploadSessions.count({ where: { uploader_staff_id: owner } }), 1);
});
test('fenced readiness commits mandatory outputs and event atomically; stale completions cannot publish', async () => {
  const row = await completed();
  // Claim only this test's queued input by fencing other queued test jobs through private disposable fixtures.
  await db.processingJobs.updateMany({
    where: { asset_id: { not: row.assetId }, status: 'QUEUED' },
    data: { next_attempt_at: new Date('2099-01-01') },
  });
  const first = await uow.execute((r) => r.claim('IMAGE', mediaIds.uuid(), 5));
  assert.ok(first);
  await db.$executeRaw`UPDATE media.processing_jobs SET locked_until=clock_timestamp()-interval '1 second' WHERE id=${first.jobId}::uuid`;
  const second = await uow.execute((r) => r.claim('IMAGE', mediaIds.uuid(), 5));
  assert.ok(second);
  assert.notEqual(first.token, second.token);
  // Explicit test-scoped verification result tests SQL lifecycle/fencing, not actual processing/scanning.
  const variant = {
    key: `outputs/${row.assetId}/${second.token}/thumbnail`,
    bytes: '4',
    sha256: 'a'.repeat(64),
    version: null,
    mime: 'image/webp',
    width: 1,
    height: 1,
    duration: null,
  };
  const result = {
    mime: 'image/png',
    width: 1,
    height: 1,
    duration: null,
    evidence: { scanner: 'TEST ONLY' },
    variants: ['thumbnail', 'card', 'detail', 'large'].map((profile) => ({ ...variant, profile })),
  };
  assert.equal(await uow.execute((r) => r.ready(first, result)), false);
  await assert.rejects(
    uow.execute((r) => r.ready(second, { ...result, variants: result.variants.slice(0, 1) })),
    isCode('INVALID_STATE'),
  );
  assert.equal(await db.assetVariants.count({ where: { asset_id: row.assetId } }), 0);
  assert.equal(await uow.execute((r) => r.ready(second, result)), true);
  const beforeGeneration = await uow.execute((r) => r.asset(row.assetId));
  const regeneration = await uow.execute((r) => r.reprocess(row.assetId, beforeGeneration.version));
  const regenerationClaim = await uow.execute((r) => r.claim('IMAGE', mediaIds.uuid(), 5));
  assert.ok(regenerationClaim);
  await uow.execute((r) => r.fail(regenerationClaim, 'TEST_OPTIONAL_FAILURE', true, 5));
  const retained = await uow.execute((r) => r.asset(regeneration.id));
  assert.equal(retained.status, 'READY');
  assert.equal(retained.security, 'VERIFIED');
  assert.equal(retained.variants.length, 4);
  const event = await db.outboxEvents.findFirstOrThrow({
    where: { aggregate_id: row.assetId, event_type: 'media.asset.ready.v1' },
  });
  const readyEvent = event.payload as unknown as MediaEvent;
  await registry.apply(readyEvent);
  await registry.apply(readyEvent);
  const category = uuid(randomUUID());
  await catalogDb.$transaction(
    async (tx) => {
      await tx.categories.create({ data: { id: category, cover_asset_id: row.assetId } });
      await tx.categoryTranslations.create({
        data: { category_id: category, locale: 'ar', name: 'Synthetic Media cover' },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  const context = { ownerType: 'CATEGORY' as const, ownerId: category };
  const catalog = {
    authorize: (id: typeof row.assetId, c: typeof context) => registry.authorize(id, c, 'PREVIEW'),
    usage: (id: typeof row.assetId, a: number, l: number) => registry.usage(id, a, l),
    registration: (id: typeof row.assetId) => registry.registration(id),
    retirement: (a: Awaited<ReturnType<PrismaMediaUnitOfWork['execute']>>) => {
      void a;
      throw new Error('Not used.');
    },
  };
  const delivery = new AuthorizeDelivery(
    uow,
    { ...catalog, retirement: async (a) => registry.retire(a.id, a.kind, a.version) },
    mediaClock,
    300,
  );
  assert.equal(
    (await delivery.execute(row.assetId, 'thumbnail', 'PREVIEW', context, null)).assetId,
    row.assetId,
  );
  const library = new MediaLibrary(uow, {
    ...catalog,
    retirement: async (a) => registry.retire(a.id, a.kind, a.version),
  });
  const readyAsset = await uow.execute((r) => r.asset(row.assetId));
  await assert.rejects(
    library.retire(row.assetId, readyAsset.version, true, actor),
    isCode('INVALID_STATE'),
  );
  const blocked = await library.block(row.assetId, readyAsset.version, actor);
  await assert.rejects(
    delivery.execute(row.assetId, 'thumbnail', 'PREVIEW', context, null),
    isCode('FORBIDDEN'),
  );
  const security = await db.outboxEvents.findFirstOrThrow({
    where: { aggregate_id: row.assetId, event_type: 'media.asset.security.v1' },
  });
  await registry.apply(security.payload as unknown as MediaEvent);
  await registry.apply(readyEvent);
  assert.equal((await registry.registration(row.assetId)).blocked, true);
  await catalogDb.$transaction(
    (tx) => tx.categories.update({ where: { id: category }, data: { cover_asset_id: null } }),
    { isolationLevel: 'Serializable' },
  );
  assert.equal((await library.retire(row.assetId, blocked.version, true, actor)).status, 'RETIRED');
  await registry.apply({ ...readyEvent, id: uuid(randomUUID()) });
  assert.equal((await registry.registration(row.assetId)).retired, true);
  assert.equal((await uow.execute((r) => r.asset(row.assetId))).deleted, true);
  assert.ok((await storage.inspect('originals/' + row.assetId, 8)).sha256);
});
test('real HTTP transport authenticates staff, denies Super Admin and rejects uploads when scanning is unavailable', async () => {
  const row = await completed(),
    claim = await uow.execute((r) => r.claim('IMAGE', mediaIds.uuid(), 5));
  assert.ok(claim);
  assert.equal(claim.asset.id, row.assetId);
  sharp.cache(false);
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 40, g: 80, b: 120 } },
  })
    .webp()
    .toBuffer();
  const output = await storage.put(
    `outputs/${row.assetId}/${claim.token}/thumbnail`,
    (async function* () {
      yield bytes;
    })(),
    bytes.length,
  );
  await uow.execute((r) =>
    r.ready(claim, {
      mime: 'image/png',
      width: 2,
      height: 2,
      duration: null,
      evidence: { scanner: 'TEST ONLY: transport fixture, no real scanning' },
      variants: ['thumbnail', 'card', 'detail', 'large'].map((profile) => ({
        ...output,
        profile,
        mime: 'image/webp',
        width: 2,
        height: 2,
        duration: null,
      })),
    }),
  );
  const pool = await import('pg').then(
    ({ default: pg }) =>
      new pg.Pool({ connectionString: fixture.pool.options.connectionString, max: 2 }),
  );
  const settings = mediaConfig({
    MEDIA_STORAGE_ROOT: path.join(directory, 'http-objects'),
    MEDIA_SCRATCH_ROOT: path.join(directory, 'http-scratch'),
  });
  const app = await mediaApplication(
    httpConfig('media', {}),
    pool,
    storage,
    settings,
    {
      authenticate: async (request) => {
        if (request.sessionToken === 'admin') return actor;
        if (request.sessionToken === 'super') return { ...actor, role: 'SUPER_ADMIN' };
        throw new ApplicationError('UNAUTHENTICATED', 'Test session missing.');
      },
    },
    { ready: async () => false },
  );
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    settings.origin = base;
    assert.equal((await fetch(base + '/api/v1/admin/media/assets')).status, 401);
    assert.equal(
      (await fetch(base + '/api/v1/admin/media/assets', { headers: { cookie: 'gl_staff=super' } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(base + '/api/v1/admin/media/capabilities', {
          headers: { cookie: 'gl_staff=admin' },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + '/api/v1/admin/media/uploads', {
          method: 'POST',
          headers: {
            cookie: 'gl_staff=admin',
            'content-type': 'application/json',
            origin: 'http://127.0.0.1:8082',
          },
          body: JSON.stringify(input()),
        })
      ).status,
      503,
    );
    const content = base + `/api/v1/admin/media/assets/${row.assetId}/variants/thumbnail/content`,
      headers = { cookie: 'gl_staff=admin' };
    assert.equal((await fetch(content)).status, 401);
    const ranged = await fetch(content, { headers: { ...headers, range: 'bytes=0-3' } });
    assert.equal(ranged.status, 206);
    assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), bytes.subarray(0, 4));
    const head = await fetch(content, { method: 'HEAD', headers });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(bytes.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(
      (await fetch(content, { headers: { ...headers, range: 'bytes=0-1,3-4' } })).status,
      416,
    );
    assert.equal(
      (
        await fetch(content, {
          headers: { ...headers, 'if-none-match': head.headers.get('etag')! },
        })
      ).status,
      304,
    );
    const asset = await uow.execute((r) => r.asset(row.assetId));
    await uow.execute((r) => r.block(asset.id, asset.version));
    assert.equal(
      (
        await fetch(content, {
          headers: { ...headers, 'if-none-match': head.headers.get('etag')! },
        })
      ).status,
      403,
    );
  } finally {
    await app.close();
  }
});
