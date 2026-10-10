import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { disposableDatabase } from '../../infrastructure/database/fixtures.mjs';
for (const attempt of [1, 2])
  test(
    'Fresh fixture ' +
      attempt +
      ': actual disposable PostgreSQL lifecycle, transaction rollback and repeatable SQL',
    async () => {
      const version = spawnSync('docker', ['version'], { encoding: 'utf8', windowsHide: true });
      assert.ok(
        !version.error && version.status === 0,
        'BLOCKED: Docker PostgreSQL fixture unavailable; no database result claimed',
      );
      const fixture = disposableDatabase();
      try {
        const sql = (text) =>
          fixture.docker([
            'exec',
            fixture.name,
            'psql',
            '-U',
            'fixture_admin',
            '-d',
            fixture.name,
            '-v',
            'ON_ERROR_STOP=1',
            '-Atc',
            text,
          ]);
        let ready = false;
        for (let n = 0; n < 60; n++) {
          try {
            fixture.docker([
              'exec',
              fixture.name,
              'pg_isready',
              '-h',
              '127.0.0.1',
              '-U',
              'fixture_admin',
              '-d',
              fixture.name,
            ]);
            assert.equal(sql('SELECT 1;').trim(), '1');
            ready = true;
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
        assert.ok(ready, 'Final PostgreSQL TCP listener and named database did not become ready');
        assert.equal(sql('SELECT current_database();').trim(), fixture.name);
        let diagnostics = '';
        try {
          fixture.docker([
            'exec',
            fixture.name,
            'sh',
            '-c',
            'printf \"%s\" \"$POSTGRES_PASSWORD\" >&2; exit 1',
          ]);
        } catch (error) {
          diagnostics = String(error);
        }
        assert.ok(
          diagnostics.includes('[REDACTED]'),
          'Fixture diagnostics must redact credentials',
        );
        assert.ok(
          !diagnostics.includes(fixture.password),
          'Fixture diagnostics must not disclose credentials',
        );
        for (let n = 0; n < 2; n++)
          sql('CREATE TABLE IF NOT EXISTS engineering_probe(id integer PRIMARY KEY);');
        sql('BEGIN; INSERT INTO engineering_probe VALUES(1); ROLLBACK;');
        assert.equal(sql('SELECT count(*) FROM engineering_probe;').trim(), '0');
        sql('INSERT INTO engineering_probe VALUES(1);');
        assert.equal(sql('SELECT count(*) FROM engineering_probe;').trim(), '1');
      } finally {
        fixture.close();
      }
    },
  );
