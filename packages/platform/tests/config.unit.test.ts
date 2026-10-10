import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigurationError, httpConfig, serviceConfig, upstreams } from '../src/config.js';
test('each service requires its own runtime connection and production never reads local credentials', () => {
  const url =
    'postgresql://business_platform_catalog_runtime:synthetic@127.0.0.1:55432/test_catalog';
  assert.equal(
    serviceConfig('catalog', {
      NODE_ENV: 'production',
      CATALOG_DATABASE_URL: url,
      IDENTITY_DATABASE_URL: 'invalid',
    }).database.connectionString,
    url,
  );
  assert.throws(
    () => serviceConfig('identity', { NODE_ENV: 'production', CATALOG_DATABASE_URL: url }),
    ConfigurationError,
  );
  assert.throws(
    () =>
      serviceConfig('catalog', {
        NODE_ENV: 'production',
        CATALOG_DATABASE_URL: url.replace('catalog_runtime', 'catalog_owner'),
      }),
    ConfigurationError,
  );
  assert.throws(
    () =>
      serviceConfig('catalog', {
        NODE_ENV: 'production',
        CATALOG_DATABASE_URL: url,
        DATABASE_POOL_MAX: 'NaN',
      }),
    ConfigurationError,
  );
});
test('HTTP configuration rejects ambiguous ports/origins and production plaintext upstreams', () => {
  assert.equal(httpConfig('media', {}).port, 3003);
  assert.throws(() => httpConfig('media', { PORT: '3003oops' }), ConfigurationError);
  assert.throws(
    () => httpConfig('gateway', { ALLOWED_ORIGINS: 'https://example.com/path' }),
    ConfigurationError,
  );
  assert.throws(() => upstreams({ NODE_ENV: 'production' }), ConfigurationError);
});
