import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { disposableDatabase } from '../../infrastructure/database/fixtures.mjs';
import {
  initializeClusterRoles,
  createDatabase,
  provision,
  migrate,
  migrateFleet,
  readManifest,
  TenantConnections,
} from '@business-platform/database';
const limits = {
  maxPools: 2,
  maxProfiles: 8,
  perPool: 2,
  globalConnections: 4,
  maxWaiters: 2,
  acquireMs: 350,
  idleMs: 100,
  transactionMs: 1200,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test('Hybrid PostgreSQL foundation: real provision/migration/Prisma/role/concurrency proof', async (t) => {
  const fixture = disposableDatabase();
  const pools = [];
  let connections;
  let maximumPhysical = 0;
  const rootDir = process.cwd();
  try {
    let ready = false;
    for (let n = 0; n < 80; n++) {
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
        fixture.docker([
          'exec',
          fixture.name,
          'psql',
          '-U',
          'fixture_admin',
          '-d',
          fixture.name,
          '-Atc',
          'SELECT 1',
        ]);
        ready = true;
        break;
      } catch {
        await sleep(250);
      }
    }
    assert.ok(ready, 'Fixture unavailable; no database result claimed');
    const port = JSON.parse(fixture.docker(['inspect', fixture.name]))[0].NetworkSettings.Ports[
      '5432/tcp'
    ][0].HostPort;
    const url = (database, user = 'fixture_admin', password = fixture.password) =>
      'postgresql://' + user + ':' + password + '@127.0.0.1:' + port + '/' + database;
    const pool = (database) => {
      const p = new Pool({
        connectionString: url(database),
        max: 2,
        connectionTimeoutMillis: 2000,
      });
      pools.push(p);
      return p;
    };
    const admin = pool(fixture.name);
    await initializeClusterRoles(admin);
    const suffix = randomBytes(6).toString('hex');
    const controlName = 'bp_control_' + suffix,
      pooledName = 'bp_pooled_' + suffix,
      dedicatedName = 'bp_dedicated_' + suffix,
      secondName = 'bp_second_' + suffix;
    const secret = new Map();
    const runtimeSecret = (name) => {
      if (!secret.has(name))
        secret.set(name, { login: name + '_runtime', password: randomBytes(24).toString('hex') });
      return secret.get(name);
    };
    const controlSecret = runtimeSecret(controlName);
    await createDatabase(
      admin,
      controlName,
      'control_owner',
      controlSecret.login,
      controlSecret.password,
    );
    const control = pool(controlName);
    await control.query(
      'REVOKE CREATE ON SCHEMA public FROM PUBLIC;GRANT USAGE ON SCHEMA public TO control_runtime',
    );
    const controlManifest = readManifest(
      path.join(rootDir, 'infrastructure/database/migrations/control'),
    );
    const erpManifest = readManifest(path.join(rootDir, 'infrastructure/database/migrations/erp'));
    await migrate(control, controlManifest, 'control_owner');
    const a = randomUUID(),
      b = randomUUID(),
      c = randomUUID(),
      d = randomUUID();
    const resources = {
      admin,
      control,
      openDatabase: (name) => new Pool({ connectionString: url(name), max: 2 }),
      openRuntimeDatabase: (name) => {
        const secret = runtimeSecret(name);
        return new Pool({ connectionString: url(name, secret.login, secret.password), max: 1 });
      },
      runtimeSecret,
      erpMigrations: path.join(rootDir, 'infrastructure/database/migrations/erp'),
    };
    const request = (tenantId, mode, databaseId) => ({
      tenantId,
      mode,
      databaseId,
      credentialRef: databaseId + '-secret-ref',
      idempotencyKey: 'provision-' + tenantId,
    });
    await t.test(
      'DB-001 repeated and concurrent pooled/dedicated provisioning; distinct physical control DB',
      async () => {
        await Promise.all([
          provision(resources, request(a, 'pooled', pooledName)),
          provision(resources, request(b, 'pooled', pooledName)),
        ]);
        await provision(resources, request(c, 'dedicated', dedicatedName));
        await provision(resources, request(d, 'dedicated', secondName));
        await provision(resources, request(a, 'pooled', pooledName));
        await provision(resources, request(c, 'dedicated', dedicatedName));
        assert.equal(
          (await control.query('SELECT count(*)::int n FROM storage_assignment')).rows[0].n,
          4,
        );
        assert.equal(
          (
            await control.query(
              "SELECT count(*)::int n FROM provisioning_operation WHERE state='READY'",
            )
          ).rows[0].n,
          4,
        );
        assert.equal(
          (
            await control.query(
              "SELECT count(*)::int n FROM tenant_registry WHERE lifecycle='ACTIVE'",
            )
          ).rows[0].n,
          0,
          'Provisioning must not activate admission',
        );
        assert.equal(
          (await control.query('SELECT count(*)::int n FROM registry_change')).rows[0].n,
          4,
        );
        await assert.rejects(
          provision(resources, { ...request(a, 'pooled', pooledName), databaseId: secondName }),
          /idempotency conflict/,
        );
      },
    );
    const upgraded = pool('bp_upgrade_' + suffix);
    const erp = pool(pooledName),
      dedicated = pool(dedicatedName),
      second = pool(secondName);
    await t.test(
      'DB-001 same canonical schema/keys/policies/owner and version in both modes',
      async () => {
        const upgradeName = 'bp_upgrade_' + suffix,
          upgradeSecret = runtimeSecret(upgradeName);
        await createDatabase(
          admin,
          upgradeName,
          'erp_owner',
          upgradeSecret.login,
          upgradeSecret.password,
        );
        await migrate(upgraded, erpManifest.slice(0, 1), 'erp_owner');
        await migrate(upgraded, erpManifest, 'erp_owner');
        const inventory = async (p) =>
          (
            await p.query(
              `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`,
            )
          ).rows;
        assert.deepEqual(await inventory(erp), await inventory(dedicated));
        assert.deepEqual(await inventory(erp), await inventory(second));
        assert.deepEqual(await inventory(erp), await inventory(upgraded));
        for (const p of [erp, dedicated, second]) {
          assert.deepEqual(
            (await p.query('SELECT sequence,sha256 FROM schema_migration ORDER BY sequence')).rows,
            erpManifest.map((m) => ({ sequence: m.sequence, sha256: m.sha256 })),
          );
          const policies = (await p.query('SELECT qual,with_check FROM pg_policies')).rows;
          assert.equal(policies.length, 4);
          assert.ok(policies.every((x) => x.qual && x.with_check));
          assert.equal(
            (
              await p.query(
                "SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosecdef",
              )
            ).rows[0].n,
            0,
          );
        }
      },
    );
    await t.test(
      'DB-002/003 checksum drift, atomic DDL failure, locked parallel migration and retry',
      async () => {
        await assert.rejects(
          migrate(erp, [{ ...erpManifest[0], sha256: 'changed' }], 'erp_owner'),
          /checksum/,
        );
        const bad = {
          sequence: 3,
          name: '0003_failure.sql',
          sha256: 'bad',
          sql: 'CREATE TABLE rolled_back_probe(id integer); SELECT missing_failure_column;',
        };
        await assert.rejects(migrate(erp, [...erpManifest, bad], 'erp_owner'));
        assert.equal(
          (await erp.query("SELECT to_regclass('public.rolled_back_probe') AS name")).rows[0].name,
          null,
        );
        assert.equal(
          (await erp.query('SELECT count(*)::int n FROM schema_migration')).rows[0].n,
          2,
        );
        await Promise.all([
          migrate(erp, erpManifest, 'erp_owner'),
          migrate(erp, erpManifest, 'erp_owner'),
        ]);
        await assert.rejects(migrate(erp, [], 'erp_owner'), /history/);
        const failDir = path.join(rootDir, '.local', 'hybrid-' + suffix);
        fs.mkdirSync(failDir, { recursive: true });
        fs.writeFileSync(path.join(failDir, '0001_failure.sql'), 'SELECT deliberate_missing;');
        const e = randomUUID(),
          failedName = 'bp_failed_' + suffix;
        await assert.rejects(
          provision({ ...resources, erpMigrations: failDir }, request(e, 'dedicated', failedName)),
        );
        assert.equal(
          (await control.query('SELECT state FROM provisioning_operation WHERE tenant_id=$1', [e]))
            .rows[0].state,
          'FAILED',
        );
        assert.equal(
          (await control.query('SELECT state FROM storage_database WHERE id=$1', [failedName]))
            .rows[0].state,
          'FAILED',
        );
        assert.equal(
          (
            await control.query(
              'SELECT count(*)::int n FROM storage_assignment WHERE tenant_id=$1',
              [e],
            )
          ).rows[0].n,
          0,
        );
        await provision(resources, request(e, 'dedicated', failedName));
        assert.equal(
          (await control.query('SELECT state FROM provisioning_operation WHERE tenant_id=$1', [e]))
            .rows[0].state,
          'READY',
        );
      },
    );
    await t.test(
      'DB-003 migration fleet exposes one failed database, preserves others, and retries safely',
      async () => {
        const first = await migrateFleet(
          control,
          (id) => {
            if (id === secondName) throw new Error('Injected operational connection outage');
            return new Pool({ connectionString: url(id), max: 1 });
          },
          erpManifest,
        );
        assert.equal(first.filter((r) => r.state === 'FAILED').length, 1);
        assert.equal(first.find((r) => r.databaseId === secondName).state, 'FAILED');
        assert.equal(
          (await control.query('SELECT state FROM storage_database WHERE id=$1', [secondName]))
            .rows[0].state,
          'FAILED',
        );
        const retried = await migrateFleet(
          control,
          (id) => new Pool({ connectionString: url(id), max: 1 }),
          erpManifest,
        );
        assert.equal(retried.length, 4);
        assert.ok(retried.every((r) => r.state === 'READY' && r.version === 2));
      },
    );
    const runtimeProfile = (name, mode, expectedTenant = null) => {
      const s = runtimeSecret(name);
      return {
        id: name,
        connectionString: url(name, s.login, s.password),
        credentialVersion: 1,
        mode,
        expectedTenant,
      };
    };
    const pooled = runtimeProfile(pooledName, 'pooled'),
      dedicatedProfile = runtimeProfile(dedicatedName, 'dedicated', c),
      secondProfile = runtimeProfile(secondName, 'dedicated', d);
    connections = new TenantConnections(limits);
    const scoped = (tenantId, fn, p = pooled) =>
      connections.transaction(p, { tenantId, generation: 1n }, fn);
    await t.test(
      'TEN-005 foreign key rejects an orphan even with privileged RLS bypass',
      async () => {
        await assert.rejects(
          erp.query('INSERT INTO company_identity(tenant_id,id,code) VALUES($1,$2,$3)', [
            randomUUID(),
            randomUUID(),
            'ORPHAN',
          ]),
          (error) => error.code === '23503',
        );
      },
    );
    await t.test(
      'DB-004 disconnected idle runtime session is observed and safely reconnected',
      async () => {
        const pid = await scoped(
          a,
          async (tx) => (await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid,
        );
        await admin.query('SELECT pg_terminate_backend($1)', [pid]);
        await sleep(30);
        await scoped(a, (tx) => tx.companyIdentity.count());
        assert.ok(connections.stats().poolFailures >= 1);
      },
    );
    const companyA = randomUUID(),
      companyB = randomUUID();
    await t.test(
      'ISO-CONTEXT generated Prisma writes and raw operations share one PID/context',
      async () => {
        await scoped(a, async (tx) => {
          const start =
            await tx.$queryRaw`SELECT pg_backend_pid() AS pid,current_setting('app.tenant_id') AS tenant`;
          await tx.companyIdentity.create({ data: { tenantId: a, id: companyA, code: 'SAME' } });
          assert.equal((await tx.companyIdentity.findMany()).length, 1);
          const end =
            await tx.$queryRaw`SELECT pg_backend_pid() AS pid,current_setting('app.tenant_id') AS tenant`;
          assert.deepEqual(start, end);
          assert.equal(start[0].tenant, a);
        });
        await scoped(b, (tx) =>
          tx.companyIdentity.create({ data: { tenantId: b, id: companyB, code: 'SAME' } }),
        );
        await scoped(
          c,
          (tx) =>
            tx.companyIdentity.create({ data: { tenantId: c, id: randomUUID(), code: 'SAME' } }),
          dedicatedProfile,
        );
      },
    );
    await t.test(
      'TEN-002/003/005 tenant read/write/FK and dedicated wrong-context denial',
      async () => {
        await scoped(a, async (tx) => {
          assert.equal(await tx.companyIdentity.count(), 1);
          assert.equal(await tx.companyIdentity.count({ where: { tenantId: b } }), 0);
        });
        await assert.rejects(
          scoped(a, (tx) =>
            tx.companyIdentity.create({ data: { tenantId: b, id: randomUUID(), code: 'FORGED' } }),
          ),
        );
        await assert.rejects(
          scoped(a, (tx) =>
            tx.companyIdentity.create({ data: { tenantId: a, id: randomUUID(), code: 'SAME' } }),
          ),
        );
        await assert.rejects(
          scoped(a, (tx) =>
            tx.companyIdentity.create({
              data: { tenantId: randomUUID(), id: randomUUID(), code: 'ORPHAN' },
            }),
          ),
        );
        await assert.rejects(
          scoped(a, (tx) => tx.companyIdentity.count(), dedicatedProfile),
          /Dedicated tenant mismatch/,
        );
        const forged = { ...dedicatedProfile, mode: 'pooled', expectedTenant: null };
        await assert.rejects(
          scoped(a, (tx) => tx.companyIdentity.count(), forged),
          /Database tenant binding mismatch/,
        );
        await assert.rejects(
          connections.transaction(pooled, { tenantId: 'malformed', generation: 1n }, (tx) =>
            tx.companyIdentity.count(),
          ),
          /scope/,
        );
      },
    );
    await t.test(
      'ISO-ROLES restricted migration login can migrate but runtime cannot assume it',
      async () => {
        const login = 'bp_migrator_' + suffix,
          password = randomBytes(24).toString('hex');
        await admin.query(
          'CREATE ROLE "' +
            login +
            '" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ' +
            "'" +
            password +
            "'",
        );
        await admin.query('GRANT erp_migrator TO "' + login + '"');
        await admin.query('GRANT CONNECT ON DATABASE "' + pooledName + '" TO "' + login + '"');
        const migrator = new Pool({ connectionString: url(pooledName, login, password), max: 1 });
        try {
          assert.equal(await migrate(migrator, erpManifest, 'erp_owner'), 2);
          assert.equal(
            (await migrator.query('SELECT count(*)::int n FROM tenant_installation')).rows[0].n,
            2,
          );
          const flags = (
            await migrator.query(
              'SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
            )
          ).rows[0];
          assert.equal(flags.rolsuper, false);
          assert.equal(flags.rolbypassrls, false);
        } finally {
          await migrator.end();
        }
      },
    );
    await t.test(
      'ISO-ROLES actual nonowner logins cannot bypass RLS, DDL, owner roles or cross-database CONNECT',
      async () => {
        const s = runtimeSecret(pooledName);
        const runtime = new Pool({
          connectionString: url(pooledName, s.login, s.password),
          max: 1,
        });
        pools.push(runtime);
        const role = (
          await runtime.query(
            'SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user',
          )
        ).rows[0];
        assert.ok(Object.values(role).every((v) => v === false));
        assert.equal(
          (await runtime.query('SELECT count(*)::int n FROM company_identity')).rows[0].n,
          0,
        );
        for (const sql of [
          'SET ROLE erp_owner',
          'SET ROLE erp_migrator',
          'CREATE TABLE forbidden(id int)',
          'TRUNCATE company_identity',
          "UPDATE storage_binding SET mode='pooled',expected_tenant=NULL",
        ]) {
          await assert.rejects(runtime.query(sql));
        }
        assert.equal(
          (
            await runtime.query(
              "SELECT has_database_privilege(current_user,$1,'CONNECT') AS permitted",
              [dedicatedName],
            )
          ).rows[0].permitted,
          false,
        );
        const wrong = new Pool({
          connectionString: url(dedicatedName, s.login, s.password),
          max: 1,
        });
        try {
          await assert.rejects(wrong.query('SELECT 1'));
        } finally {
          await wrong.end();
        }
        await admin.query('GRANT erp_owner TO "' + s.login + '"');
        try {
          await assert.rejects(
            createDatabase(admin, pooledName, 'erp_owner', s.login, s.password),
            /membership mismatch/,
          );
        } finally {
          await admin.query('REVOKE erp_owner FROM "' + s.login + '"');
        }
        await admin.query('GRANT erp_owner TO erp_runtime');
        try {
          await assert.rejects(initializeClusterRoles(admin), /Unsafe runtime role membership/);
        } finally {
          await admin.query('REVOKE erp_owner FROM erp_runtime');
        }
        const controlLogin = new Pool({
          connectionString: url(controlName, controlSecret.login, controlSecret.password),
          max: 1,
        });
        pools.push(controlLogin);
        assert.equal(
          (await controlLogin.query('SELECT count(*)::int n FROM tenant_registry')).rows[0].n,
          5,
        );
        await assert.rejects(controlLogin.query('SELECT * FROM company_identity'));
        assert.equal(
          (
            await controlLogin.query(
              "SELECT has_database_privilege(current_user,$1,'CONNECT') AS permitted",
              [pooledName],
            )
          ).rows[0].permitted,
          false,
        );
      },
    );
    await t.test(
      'ISO-CONTEXT rollback, escaped tx, timeout and parallel pool reuse never retain tenant',
      async () => {
        let escaped;
        await assert.rejects(
          scoped(a, async (tx) => {
            escaped = tx;
            await tx.companyIdentity.create({
              data: { tenantId: a, id: randomUUID(), code: 'ROLLBACK' },
            });
            throw new Error('rollback requested');
          }),
          /rollback requested/,
        );
        await assert.rejects(escaped.companyIdentity.count());
        await scoped(a, async (tx) =>
          assert.equal(await tx.companyIdentity.count({ where: { code: 'ROLLBACK' } }), 0),
        );
        await assert.rejects(
          scoped(a, (tx) => tx.$queryRaw`SELECT 1 AS value FROM pg_sleep(2)`),
          (error) => /timeout|cancell|transaction/i.test(error.message),
        );
        await Promise.all(
          Array.from({ length: 2 }, (_, i) =>
            scoped(i % 2 ? a : b, async (tx) => {
              const who = i % 2 ? a : b;
              const rows = await tx.companyIdentity.findMany();
              assert.ok(rows.every((r) => r.tenantId === who));
              maximumPhysical = Math.max(maximumPhysical, connections.stats().physical);
            }),
          ),
        );
        await scoped(b, async (tx) =>
          assert.ok((await tx.companyIdentity.findMany()).every((r) => r.tenantId === b)),
        );
        // Independent white-box adapter proof: pooled connection has no retained tenant outside its transaction.
        const rootPool = connections.entries.get(pooledName).pool;
        const cleared = await rootPool.query(
          "SELECT NULLIF(current_setting('app.tenant_id',true),'') AS tenant,(SELECT count(*) FROM company_identity)::int AS n",
        );
        assert.equal(cleared.rows[0].tenant, null);
        assert.equal(cleared.rows[0].n, 0);
      },
    );
    await t.test(
      'DB-004 pooled A/B and dedicated C execute concurrently within one shared budget',
      async () => {
        await Promise.all(
          [
            [a, pooled],
            [b, pooled],
            [c, dedicatedProfile],
          ].map(([tenant, profile]) =>
            scoped(
              tenant,
              async (tx) => {
                const row = (
                  await tx.$queryRaw`SELECT current_setting('app.tenant_id') AS tenant FROM pg_sleep(0.02)`
                )[0];
                assert.equal(row.tenant, tenant);
                assert.ok(connections.stats().pools <= 2 && connections.stats().physical <= 4);
                maximumPhysical = Math.max(maximumPhysical, connections.stats().physical);
              },
              profile,
            ),
          ),
        );
      },
    );
    await t.test(
      'DB-004 budget, queue backpressure, cancellation, eviction and credential rotation',
      async () => {
        assert.throws(() => new TenantConnections({ ...limits, globalConnections: 3 }), /budget/);
        let release;
        const gate = new Promise((r) => {
          release = r;
        });
        let started = 0;
        const holders = [a, b].map((tenant) =>
          scoped(tenant, async (tx) => {
            await tx.companyIdentity.count();
            started++;
            await gate;
          }),
        );
        while (started < 2) await sleep(5);
        try {
          await assert.rejects(
            scoped(a, (tx) => tx.companyIdentity.count()),
            /acquisition deadline/,
          );
          const controller = new AbortController();
          const waiting = connections.transaction(
            pooled,
            { tenantId: a, generation: 1n },
            (tx) => tx.companyIdentity.count(),
            controller.signal,
          );
          controller.abort();
          await assert.rejects(waiting, /cancelled/);
          const wait1 = scoped(a, (tx) => tx.companyIdentity.count()),
            wait2 = scoped(b, (tx) => tx.companyIdentity.count());
          await assert.rejects(
            scoped(a, (tx) => tx.companyIdentity.count()),
            /queue full/,
          );
          release();
          await Promise.all([...holders, wait1, wait2]);
        } finally {
          release();
          await Promise.allSettled(holders);
        }
        for (const [tenant, profile] of [
          [c, dedicatedProfile],
          [d, secondProfile],
          [a, pooled],
          [c, dedicatedProfile],
        ]) {
          await scoped(tenant, (tx) => tx.companyIdentity.count(), profile);
          const stats = connections.stats();
          maximumPhysical = Math.max(maximumPhysical, stats.physical);
          assert.ok(stats.pools <= 2 && stats.reserved <= 4 && stats.physical <= 4);
        }
        const old = runtimeSecret(dedicatedName),
          rotated = randomBytes(24).toString('hex');
        await admin.query('ALTER ROLE "' + old.login + '" PASSWORD ' + "'" + rotated + "'");
        secret.set(dedicatedName, { login: old.login, password: rotated });
        const next = { ...runtimeProfile(dedicatedName, 'dedicated', c), credentialVersion: 2 };
        await scoped(c, (tx) => tx.companyIdentity.count(), next);
        await assert.rejects(
          scoped(c, (tx) => tx.companyIdentity.count(), dedicatedProfile),
          /Stale credential/,
        );
        const expired = new Pool({ connectionString: dedicatedProfile.connectionString, max: 1 });
        try {
          await assert.rejects(expired.query('SELECT 1'));
        } finally {
          await expired.end();
        }
        await sleep(120);
        await connections.reapIdle();
        assert.equal(connections.stats().pools, 0);
        await connections.close();
        assert.equal(connections.stats().physical, 0);
      },
    );
    await t.test('DB-004 concurrent new-database churn cannot exceed reservations', async () => {
      const churn = new TenantConnections({
        ...limits,
        maxPools: 1,
        perPool: 1,
        globalConnections: 1,
      });
      await churn.transaction(pooled, { tenantId: a, generation: 1n }, (tx) =>
        tx.companyIdentity.count(),
      );
      try {
        const jobs = [
          [c, { ...runtimeProfile(dedicatedName, 'dedicated', c), credentialVersion: 2 }],
          [d, secondProfile],
          [a, pooled],
        ].map(([tenantId, profile]) =>
          churn.transaction(profile, { tenantId, generation: 1n }, async (tx) => {
            assert.ok(churn.stats().pools <= 1 && churn.stats().physical <= 1);
            return tx.companyIdentity.count();
          }),
        );
        await Promise.all(jobs);
        assert.ok(churn.stats().reserved <= 1);
      } finally {
        await churn.close();
      }
    });
    await t.test(
      'ISO-CONTEXT bounded serialization retry establishes new local context',
      async () => {
        const retry = new TenantConnections(limits);
        let arrivals = 0;
        let unblock;
        const barrier = new Promise((r) => {
          unblock = r;
        });
        let attempts = 0;
        const operation = () =>
          retry.transaction(
            pooled,
            { tenantId: a, generation: 1n },
            async (tx) => {
              attempts++;
              const rows = await tx.companyIdentity.findMany({ where: { id: companyA } });
              assert.equal(rows[0].tenantId, a);
              if (arrivals < 2) {
                arrivals++;
                if (arrivals === 2) unblock();
                await barrier;
              }
              await tx.companyIdentity.update({
                where: { tenantId_id: { tenantId: a, id: companyA } },
                data: { active: !rows[0].active },
              });
            },
            undefined,
            { isolation: 'Serializable', retries: 2 },
          );
        try {
          await Promise.all([operation(), operation()]);
          assert.equal(attempts, 3);
          await retry.transaction(pooled, { tenantId: a, generation: 1n }, async (tx) =>
            assert.equal(
              (await tx.companyIdentity.findMany({ where: { id: companyA } }))[0].active,
              true,
            ),
          );
        } finally {
          await retry.close();
        }
      },
    );
    console.log(
      'MEASURED synthetic ERP physical connections maximum: ' +
        maximumPhysical +
        '; reserved budget 4; administrative pools separate, each max 2. No production NFR implied.',
    );
  } finally {
    try {
      if (connections) await connections.close();
      for (const p of pools) await p.end();
    } finally {
      fixture.close();
    }
  }
});
