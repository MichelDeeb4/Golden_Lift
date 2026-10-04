import assert from 'node:assert/strict';
import test from 'node:test';
import { decimal, eventEnvelope, locale, uuid, version } from '../src/index.js';
test('bigint and decimal contracts preserve precision and reject numeric coercion', () => {
  assert.equal(version('9007199254740993'), '9007199254740993');
  assert.equal(decimal('99999999999999.123456'), '99999999999999.123456');
  for (const value of [1, '0', '-1', '9223372036854775808', '1.0'])
    assert.throws(() => version(value));
  for (const value of [0.1, '1e3', 'NaN', 'Infinity']) assert.throws(() => decimal(value));
});
test('locales and IDs accept supported inputs and reject malformed values', () => {
  assert.equal(locale(), 'ar');
  assert.equal(locale('ckb'), 'ckb');
  assert.throws(() => locale('ku'));
  assert.equal(
    uuid('AB000000-0000-4000-8000-000000000001'),
    'ab000000-0000-4000-8000-000000000001',
  );
  assert.throws(() => uuid('not-an-id'));
});
test('event identity supports singleton keys without losing aggregate versions', () => {
  const event = {
    id: uuid('ab000000-0000-4000-8000-000000000001'),
    type: 'catalog.settings.changed.v1',
    schemaVersion: 1,
    producer: 'catalog',
    occurredAt: '2026-10-03T00:00:00.000Z',
    correlationId: uuid('ab000000-0000-4000-8000-000000000002'),
    aggregate: { type: 'SiteSettings', key: '1', version: '9007199254740993' },
    data: { enabled: true },
  };
  assert.equal(eventEnvelope(JSON.parse(JSON.stringify(event)) as unknown).aggregate.key, '1');
  assert.throws(() => eventEnvelope({ ...event, data: { invalid: NaN } }));
  assert.throws(() => eventEnvelope({ ...event, schemaVersion: 2 }));
});
