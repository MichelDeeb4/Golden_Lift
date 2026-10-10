import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  migrationManifest,
  verifyMigrationHistory,
} from '../../infrastructure/database/migration-manifest.mjs';
test('Migration lineage detects edited history, future state and invalid sequences', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-migration-contract-'));
  try {
    fs.writeFileSync(path.join(dir, '0001_probe.sql'), 'CREATE TABLE probe(id integer);');
    const original = migrationManifest(dir);
    assert.equal(verifyMigrationHistory(original, []).length, 1);
    assert.equal(verifyMigrationHistory(original, original).length, 0);
    fs.writeFileSync(path.join(dir, '0001_probe.sql'), 'CREATE TABLE changed(id integer);');
    assert.throws(() => verifyMigrationHistory(migrationManifest(dir), original), /mismatch/);
    assert.throws(() => verifyMigrationHistory([], original), /ahead/);
    fs.writeFileSync(path.join(dir, '0003_gap.sql'), 'SELECT 1;');
    assert.throws(() => migrationManifest(dir), /gap/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
