import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
sharp.cache(false);
import { ApplicationError, mediaEvent, uuid } from '@business-platform/contracts';
import { validateUpload, singleRange } from '../src/domain/media-policy.js';
import { mediaConfig } from '../src/infrastructure/config.js';
import { FilesystemStorage } from '../src/infrastructure/storage/filesystem.js';
import { run } from '../src/infrastructure/processes/run.js';
import { ClamAvScanner } from '../src/infrastructure/scanning/clamav.js';
const policy = mediaConfig({}).policy;
const errorCode = (code: string) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;
async function* body(value: string) {
  yield Buffer.from(value);
}
test('upload policy rejects unsafe filenames, unknown purposes, size/checksum/idempotency claims', () => {
  const input = {
    kind: 'IMAGE' as const,
    name: 'lift.png',
    bytes: '100',
    purpose: 'CATALOG' as const,
    sha256: null,
    idempotencyKey: 'synthetic_key_12345',
  };
  validateUpload(input, policy);
  for (const name of ['../lift.png', 'a\\lift.png', 'line\r\n.png', 'lift.svg'])
    assert.throws(() => validateUpload({ ...input, name }, policy), errorCode('VALIDATION_FAILED'));
  assert.throws(() =>
    validateUpload({ ...input, bytes: String(policy.maxBytes.IMAGE + 1) }, policy),
  );
  assert.throws(() => validateUpload({ ...input, sha256: 'fake' }, policy));
});
test('byte ranges include suffixes and reject multipart, zero suffixes and unsatisfiable requests', () => {
  assert.deepEqual(singleRange('bytes=2-4', 10), { start: 2, end: 4 });
  assert.deepEqual(singleRange('bytes=-4', 10), { start: 6, end: 9 });
  assert.deepEqual(singleRange('bytes=5-', 10), { start: 5, end: 9 });
  for (const value of ['bytes=10-', 'bytes=0-1,3-4', 'bytes=-0', 'bytes=-', 'bytes=3-2'])
    assert.throws(() => singleRange(value, 10));
});
test('events enforce producer/type pairing, supported versions and exact bigint strings', () => {
  const event = {
    schemaVersion: 1,
    id: randomUUID(),
    producer: 'media',
    type: 'media.asset.ready.v1',
    assetId: randomUUID(),
    kind: 'IMAGE',
    sourceVersion: '9007199254740993',
    blocked: false,
  };
  assert.equal(mediaEvent(event).sourceVersion, '9007199254740993');
  for (const mutation of [
    { schemaVersion: 2 },
    { producer: 'catalog' },
    { sourceVersion: 1 },
    { storageKey: 'evil' },
  ])
    assert.throws(() => mediaEvent({ ...event, ...mutation }));
});
test('private filesystem atomically publishes once, bounds bytes and denies traversal and symlinks', async () => {
  await mkdir('.local', { recursive: true });
  const directory = await mkdtemp(path.resolve('.local/b5-storage-unit-'));
  try {
    const storage = await FilesystemStorage.create(path.join(directory, 'objects')),
      key = 'originals/' + uuid(randomUUID());
    const object = await storage.put(key, body('sealed'), 6);
    assert.equal(object.sha256, (await storage.inspect(key, 6)).sha256);
    await assert.rejects(storage.put(key, body('replay'), 6));
    assert.equal((await storage.inspect(key, 6)).sha256, object.sha256);
    await assert.rejects(storage.put('originals/../../secret', body('x'), 1));
    await assert.rejects(storage.put('originals/' + randomUUID(), body('too big'), 1));
    const external = path.join(directory, 'external');
    await mkdir(external);
    await writeFile(path.join(external, 'secret'), 'unrelated');
    const escape = path.join(directory, 'objects', 'staging');
    await symlink(external, escape, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(storage.put('staging/' + randomUUID() + '/part_1', body('bad'), 3));
    const collected: Buffer[] = [];
    for await (const bytes of await storage.read(key, { start: 1, end: 3 }))
      collected.push(Buffer.from(bytes));
    assert.equal(Buffer.concat(collected).toString(), 'eal');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('real isolated Sharp processing preserves portrait ratio, transparency, profile reuse and strips metadata', async () => {
  const directory = await mkdtemp(path.resolve('.local/b5-image-unit-'));
  try {
    const input = path.join(directory, 'input.png');
    await sharp({
      create: {
        width: 100,
        height: 600,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 0.5 },
      },
    })
      .png()
      .withMetadata({ orientation: 1 })
      .toFile(input);
    const result = JSON.parse(
      await run(
        process.execPath,
        [
          path.resolve('services/media/dist/infrastructure/processes/image-entry.js'),
          input,
          directory,
          '40000000',
        ],
        { cwd: directory, timeoutMs: 90000 },
      ),
    ) as { outputs: { file: string; width: number; height: number }[] };
    assert.equal(result.outputs.length, 4);
    assert.equal(new Set(result.outputs.map((o) => o.file)).size, 2);
    for (const output of result.outputs) {
      assert.ok(output.width < output.height);
      assert.ok(output.height <= 600);
      const metadata = await sharp(output.file).metadata();
      assert.equal(metadata.hasAlpha, true);
      assert.equal(metadata.exif, undefined);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('mandatory scanner unavailability fails closed', async () => {
  assert.equal(await new ClamAvScanner('127.0.0.1', 1, 100).ready(), false);
  await assert.rejects(
    new ClamAvScanner('127.0.0.1', 1, 100).scan(body('safe'), new AbortController().signal),
    errorCode('DEPENDENCY_UNAVAILABLE'),
  );
});
test('subprocess runner bounds output and kills timed-out work without shell interpretation', async () => {
  const directory = path.resolve('.local');
  const literal = '$(untrusted); & echo secret';
  assert.equal(
    await run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal], {
      cwd: directory,
      timeoutMs: 5000,
    }),
    literal,
  );
  await assert.rejects(
    run(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], {
      cwd: directory,
      timeoutMs: 5000,
      maxOutput: 100,
    }),
    errorCode('VALIDATION_FAILED'),
  );
  await assert.rejects(
    run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: directory, timeoutMs: 100 }),
    errorCode('VALIDATION_FAILED'),
  );
});
