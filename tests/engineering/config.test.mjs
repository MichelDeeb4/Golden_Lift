import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfig } from '@business-platform/security';
import { tenantId, companyId } from '@business-platform/shared-kernel';
test('Environment rejects malformed ports, hosts and secret-bearing telemetry URLs', () => {
  for (const env of [
    { PORT: '-1' },
    { PORT: 'NaN' },
    { PORT: '65536' },
    { PORT: '0' },
    { NODE_ENV: 'unknown' },
    { HOST: 'host/path' },
    { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://user:secret@example.test/trace' },
  ])
    assert.throws(() => runtimeConfig(env, 4100));
  assert.throws(
    () => runtimeConfig({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'malformed-private-value' }, 4100),
    (error) =>
      error.message === 'Invalid telemetry endpoint' &&
      !String(error.stack).includes('malformed-private-value'),
  );
  assert.equal(runtimeConfig({ NODE_ENV: 'test', PORT: '0' }, 4100).port, 0);
  assert.equal(runtimeConfig({ NODE_ENV: 'production' }, 4100).host, '0.0.0.0');
});
test('Identifiers validate independently without equating tenants and companies', () => {
  assert.throws(() => tenantId('client-hint'));
  assert.throws(() => companyId('1'));
  assert.equal(
    tenantId('11111111-1111-4111-8111-111111111111'),
    '11111111-1111-4111-8111-111111111111',
  );
});
