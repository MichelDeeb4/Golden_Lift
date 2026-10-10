import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { deletionEvent, directMediaDeletionRequest } from '../src/deletion.js';
test('deletion events enforce producer pairing, unique owners and a 1,000-asset envelope below both transport limits', () => {
  const request = {
    schemaVersion: 1,
    id: randomUUID(),
    operationId: randomUUID(),
    producer: 'catalog',
    type: 'catalog.media.delete.requested.v1',
    assetIds: Array.from({ length: 1000 }, () => randomUUID()),
  };
  assert.equal(deletionEvent(request).assetIds.length, 1000);
  assert.ok(
    Buffer.byteLength(JSON.stringify({ payload: request, signature: 'a'.repeat(64) })) < 65536,
  );
  for (const input of [
    { ...request, producer: 'media' },
    { ...request, type: 'media.delete.completed.v1' },
    { ...request, assetIds: [request.assetIds[0], request.assetIds[0]] },
    { ...request, assetIds: [...request.assetIds, randomUUID()] },
    { ...request, unreviewed: true },
  ])
    assert.throws(() => deletionEvent(input));
});
test('direct Media intent preserves exact versions and requires a strict confirmed Catalog fingerprint', () => {
  const event = {
    schemaVersion: 1,
    id: randomUUID(),
    operationId: randomUUID(),
    producer: 'media',
    type: 'media.deletion.requested.v1',
    assetId: randomUUID(),
    actorId: randomUUID(),
    command: {
      expectedVersion: '9007199254740993',
      impactRevision: 'd1-' + 'a'.repeat(64),
      confirmed: true,
    },
  };
  assert.equal(directMediaDeletionRequest(event).command.expectedVersion, '9007199254740993');
  for (const command of [
    { ...event.command, confirmed: false },
    { ...event.command, expectedVersion: 9007199254740993 },
    { ...event.command, impactRevision: 'other' },
    { ...event.command, force: true },
  ])
    assert.throws(() => directMediaDeletionRequest({ ...event, command }));
  assert.throws(() => directMediaDeletionRequest({ ...event, producer: 'catalog' }));
});
