// Reproduce the reviewed dictionary and ORM checks solely against disposable databases.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { databaseFixture } from '../.local/test-build/packages/platform/tests/support/database-fixture.js';
const fixtures = [];
try {
  let configuration;
  for (const service of ['identity', 'catalog', 'media', 'inquiries']) {
    const fixture = await databaseFixture(service, { catalogProfile: 'category' });
    fixtures.push(fixture);
    configuration ??= structuredClone(fixture.configuration);
    configuration.services[service] = fixture.configuration.services[service];
  }
  const file = path.resolve('.local/deletion-schema-config.json');
  fs.writeFileSync(file, JSON.stringify(configuration), { mode: 0o600 });
  for (const args of [['database/scripts/db.mjs', 'manifest'], ['scripts/verify-orm.mjs']]) {
    const result = spawnSync(process.execPath, args, {
      env: { ...process.env, BUSINESS_PLATFORM_DATABASE_CONFIG_FILE: file },
      encoding: 'utf8',
      windowsHide: true,
    });
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    assert.equal(result.status, 0, 'Disposable schema verification');
  }
} finally {
  for (const fixture of fixtures.reverse()) await fixture.dispose();
}
