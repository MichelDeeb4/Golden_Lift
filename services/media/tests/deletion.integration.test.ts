import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { after, before, test } from 'node:test';
import { ApplicationError, uuid } from '@golden-lift/contracts';
import type { DeletionEvent, MediaKind, Uuid } from '@golden-lift/contracts';
import { databaseFixture } from '../../../packages/platform/tests/support/database-fixture.js';
import { orm } from '../src/infrastructure/prisma/client.js';
import type { PrismaClient } from '../src/infrastructure/prisma/client.js';
import { FilesystemStorage } from '../src/infrastructure/storage/filesystem.js';
import { FencedStorage } from '../src/infrastructure/storage/fenced.js';
import { OwnedMediaDeletionFiles } from '../src/infrastructure/storage/deletion.js';
import { MediaOwnerCopies } from '../src/infrastructure/storage/owner-copies.js';
import { PrismaMediaDeletionStore } from '../src/infrastructure/prisma/deletion.js';
import { CompleteMediaDeletion } from '../src/application/use-cases/complete-media-deletion.js';
let fixture: Awaited<ReturnType<typeof databaseFixture>>,
  db: PrismaClient,
  directory: string,
  storage: FilesystemStorage,
  fence: FencedStorage;
const newId = () => uuid(randomUUID()),
  body = async function* () {
    yield Buffer.from('deletion-owned-bytes');
  },
  sha = createHash('sha256').update('deletion-owned-bytes').digest(),
  bytes = Buffer.byteLength('deletion-owned-bytes');
before(async () => {
  fixture = await databaseFixture('media');
  db = orm(fixture.pool);
  directory = await mkdtemp(path.resolve('.local/deletion-files-'));
  storage = await FilesystemStorage.create(directory);
  fence = new FencedStorage(storage, fixture.pool);
});
after(async () => {
  await fence?.close();
  await db?.$disconnect();
  await fixture?.dispose();
  if (directory) {
    const absolute = path.resolve(directory);
    assert.ok(absolute.startsWith(path.resolve('.local') + path.sep));
    await rm(absolute, { recursive: true, force: true });
  }
});
async function asset(kind: MediaKind = 'IMAGE') {
  const id = newId(),
    generation = newId(),
    session = newId();
  await storage.put('originals/' + id, body(), bytes);
  const profiles =
    kind === 'IMAGE'
      ? ['thumbnail', 'card', 'detail', 'large']
      : kind === 'VIDEO'
        ? ['playback', 'poster']
        : ['preview'];
  for (const profile of profiles)
    await storage.put(`outputs/${id}/${generation}/${profile}`, body(), bytes);
  await storage.put(`outputs/${id}/${newId()}/unselected`, body(), bytes);
  await storage.put(`staging/${session}/part_1`, body(), bytes);
  await db.$transaction(async (tx) => {
    await tx.assets.create({
      data: {
        id,
        media_kind: kind,
        status: 'READY',
        security_state: 'VERIFIED',
        original_name: 'synthetic-deletion-' + kind,
        storage_bucket: storage.bucket,
        storage_key: 'originals/' + id,
        detected_mime_type: 'application/octet-stream',
        byte_size: BigInt(bytes),
        sha256: sha,
        verification: { scanner: 'test-only evidence' },
        pipeline_version: 'test-only deletion fixture',
      },
    });
    for (const profile of profiles)
      await tx.assetVariants.create({
        data: {
          asset_id: id,
          variant_key: profile,
          mime_type: 'application/octet-stream',
          storage_bucket: storage.bucket,
          storage_key: `outputs/${id}/${generation}/${profile}`,
          byte_size: BigInt(bytes),
          sha256: sha,
          generation,
        },
      });
    await tx.uploadSessions.create({
      data: {
        id: session,
        asset_id: id,
        uploader_staff_id: newId(),
        status: 'COMPLETED',
        expires_at: new Date(Date.now() + 10000),
        parts: {
          '1': {
            key: `staging/${session}/part_1`,
            bytes: String(bytes),
            sha256: sha.toString('hex'),
            version: null,
          },
        },
      },
    });
    await tx.processingJobs.create({
      data: { asset_id: id, job_type: 'VALIDATE', status: 'SUCCEEDED' },
    });
  });
  return { id, session };
}
function event(ids: Uuid[]): DeletionEvent {
  return {
    schemaVersion: 1,
    id: newId(),
    operationId: newId(),
    producer: 'catalog',
    type: 'catalog.media.delete.requested.v1',
    assetIds: ids,
  };
}
test('physical image/video/PDF cleanup removes originals, selected/unselected generations, staging and all metadata; duplicate delivery is idempotent', async () => {
  const assets = await Promise.all([asset('IMAGE'), asset('VIDEO'), asset('PDF')]);
  const request = event(assets.map((a) => a.id)),
    store = new PrismaMediaDeletionStore(db),
    cleanup = new CompleteMediaDeletion(store, new OwnedMediaDeletionFiles(fence));
  await cleanup.execute(request);
  await cleanup.execute(request);
  await cleanup.execute({ ...request, id: newId() });
  for (const a of assets) {
    assert.equal(await db.assets.findUnique({ where: { id: a.id } }), null);
    assert.deepEqual(await storage.inventory('outputs/' + a.id), []);
    assert.deepEqual(await storage.inventory('originals/' + a.id), []);
    assert.deepEqual(await storage.inventory('staging/' + a.session), []);
    assert.equal(await db.uploadSessions.count({ where: { asset_id: a.id } }), 0);
    assert.equal(await db.processingJobs.count({ where: { asset_id: a.id } }), 0);
  }
  assert.equal(
    await db.outboxEvents.count({
      where: { aggregate_id: request.operationId, event_type: 'media.delete.completed.v1' },
    }),
    1,
  );
});
test('storage failure retains retryable operation and metadata, then converges after retry without orphan files', async () => {
  const a = await asset(),
    request = event([a.id]),
    store = new PrismaMediaDeletionStore(db);
  let fail = true;
  const normal = new OwnedMediaDeletionFiles(fence),
    cleanup = new CompleteMediaDeletion(store, {
      remove: async (...args) => {
        if (fail) throw Error('synthetic storage outage');
        return normal.remove(...args);
      },
    });
  await assert.rejects(
    cleanup.execute(request),
    (e: unknown) => e instanceof ApplicationError && e.code === 'MEDIA_DELETE_FAILED',
  );
  assert.ok(await db.assets.findUnique({ where: { id: a.id } }));
  assert.equal((await store.operation(request.operationId)).status, 'RETRYABLE');
  assert.equal(
    await db.outboxEvents.count({
      where: { aggregate_id: request.operationId, event_type: 'media.delete.completed.v1' },
    }),
    0,
  );
  fail = false;
  await cleanup.execute(request);
  assert.equal((await store.operation(request.operationId)).status, 'COMPLETED');
  assert.equal(await db.assets.findUnique({ where: { id: a.id } }), null);
});
test('pending deletion fences previously authorized and fresh storage writes', async () => {
  const a = await asset(),
    request = event([a.id]),
    store = new PrismaMediaDeletionStore(db);
  await store.prepare(request);
  await assert.rejects(
    fence.put(`outputs/${a.id}/${newId()}/late`, body(), bytes),
    (e: unknown) => e instanceof ApplicationError && e.code === 'DELETE_ALREADY_IN_PROGRESS',
  );
  await new CompleteMediaDeletion(store, new OwnedMediaDeletionFiles(fence)).execute(request);
});
test('owner-copy migration verifies independent original/all generations and resumes with stable target identity', async () => {
  const source = await asset(),
    target = newId(),
    copies = new MediaOwnerCopies(db, storage, fence),
    result = await copies.copy(source.id, target);
  assert.equal(result.kind, 'IMAGE');
  await copies.copy(source.id, target);
  assert.equal((await storage.inspect('originals/' + target, bytes)).sha256, sha.toString('hex'));
  assert.equal(
    (await storage.inventory('outputs/' + target)).length,
    (await storage.inventory('outputs/' + source.id)).length,
  );
  assert.equal(await db.assetVariants.count({ where: { asset_id: target } }), 4);
  await new CompleteMediaDeletion(
    new PrismaMediaDeletionStore(db),
    new OwnedMediaDeletionFiles(fence),
  ).execute(event([target]));
  assert.ok(await db.assets.findUnique({ where: { id: source.id } }));
  assert.equal(await storage.available('originals/' + source.id, String(bytes)), true);
});

test('concurrent storage lock holders can finalize through a one-connection transaction pool', async () => {
  const transactions = new pg.Pool({
    host: '127.0.0.1',
    port: fixture.configuration.port,
    database: fixture.configuration.services.media.database,
    user: fixture.configuration.services.media.user,
    password: fixture.configuration.services.media.password,
    max: 1,
    connectionTimeoutMillis: 1000,
  });
  assert.equal(Object.keys(transactions.options).includes('password'), false);
  const independent = new FencedStorage(storage, transactions);
  try {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        independent.withOwner(newId(), true, async () => {
          const result = await transactions.query<{ answer: number }>('SELECT 1 answer');
          return result.rows[0]!.answer;
        }),
      ),
    );
    assert.deepEqual(results, [1, 1, 1, 1]);
  } finally {
    await independent.close();
    await transactions.end();
  }
});
