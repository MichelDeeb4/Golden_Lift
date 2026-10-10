import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error(
    'BLOCKED: actual disposable target PostgreSQL fixture configuration is required. No isolation result claimed.',
  );
  process.exit(2);
}
const config = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
assert.equal(config.disposable, true, 'Refuse an unmarked environment');
assert.equal(config.fixtureVersion, 1);
assert.deepEqual(Object.keys(config.tenants).sort(), ['A', 'B', 'C']);
for (const key of ['A', 'B', 'C']) {
  const tenant = config.tenants[key];
  assert.equal(tenant.mode, key === 'C' ? 'dedicated' : 'pooled');
  assert.match(tenant.id, /^[0-9a-f-]{36}$/i);
  assert.ok(tenant.companies.length >= 2);
  const url = new URL(tenant.connectionString);
  assert.ok(
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
    'This phase test accepts local disposable targets only',
  );
  assert.match(url.pathname, /^\/bp_target_test_[a-z0-9_]+$/);
}
assert.equal(
  new URL(config.tenants.A.connectionString).pathname,
  new URL(config.tenants.B.connectionString).pathname,
);
assert.notEqual(
  new URL(config.tenants.A.connectionString).pathname,
  new URL(config.tenants.C.connectionString).pathname,
);
const { default: pg } = await import('pg');
for (const name of ['A', 'B', 'C']) {
  const tenant = config.tenants[name],
    foreign = config.tenants[name === 'A' ? 'B' : 'A'];
  const client = new pg.Client({
    connectionString: tenant.connectionString,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const marker = await client.query(
      "SELECT value FROM test_support.fixture_metadata WHERE key='disposable'",
    );
    assert.equal(marker.rows[0]?.value, config.marker, 'Refuse an unrelated database');
    const role = await client.query(
      'SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user',
    );
    assert.equal(role.rows[0].rolname, tenant.runtimeRole);
    for (const attr of ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb'])
      assert.equal(role.rows[0][attr], false);
    const table = await client.query(
      "SELECT c.relrowsecurity,c.relforcerowsecurity,c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS runtime_owner FROM pg_class c WHERE c.oid='test_support.isolation_records'::regclass",
    );
    assert.deepEqual(table.rows[0], {
      relrowsecurity: true,
      relforcerowsecurity: true,
      runtime_owner: false,
    });
    await client.query('BEGIN');
    try {
      const unscoped = await client.query('SELECT tenant_id FROM test_support.isolation_records');
      assert.equal(unscoped.rowCount, 0, 'Unscoped query leaked rows');
    } catch (error) {
      assert.ok(['42501', '22023'].includes(error.code), error.message);
    }
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant.id]);
    const own = await client.query(
      'SELECT id,tenant_id FROM test_support.isolation_records ORDER BY id',
    );
    assert.ok(own.rowCount > 0, 'Missing positive fixture evidence');
    assert.ok(own.rows.every((row) => row.tenant_id === tenant.id));
    const id = randomUUID();
    await client.query(
      'INSERT INTO test_support.isolation_records(tenant_id,id,company_id,label) VALUES($1,$2,$3,$4)',
      [tenant.id, id, tenant.companies[0], 'positive-fixture'],
    );
    assert.equal(
      (await client.query('SELECT id FROM test_support.isolation_records WHERE id=$1', [id]))
        .rowCount,
      1,
    );
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant.id]);
    await assert.rejects(
      client.query(
        'INSERT INTO test_support.isolation_records(tenant_id,id,company_id,label) VALUES($1,$2,$3,$4)',
        [foreign.id, randomUUID(), foreign.companies[0], 'forbidden-fixture'],
      ),
      (error) => ['42501', '23514'].includes(error.code),
    );
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant.id]);
    await assert.rejects(
      client.query('UPDATE test_support.isolation_records SET tenant_id=$1 WHERE tenant_id=$2', [
        foreign.id,
        tenant.id,
      ]),
      (error) => ['42501', '23514', '23503'].includes(error.code),
    );
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    try {
      const reused = await client.query('SELECT tenant_id FROM test_support.isolation_records');
      assert.equal(reused.rowCount, 0, 'Transaction-local scope survived rollback');
    } catch (error) {
      assert.ok(['42501', '22023'].includes(error.code));
    }
    await client.query('ROLLBACK');
    if (name === 'C') {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [foreign.id]);
      try {
        assert.equal(
          (await client.query('SELECT tenant_id FROM test_support.isolation_records')).rowCount,
          0,
        );
      } catch (error) {
        assert.ok(['42501', '22023'].includes(error.code));
      }
      await client.query('ROLLBACK');
    }
    console.log(
      'PASS: actual runtime-role SQL probes for tenant ' + name + ' (' + tenant.mode + ').',
    );
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}
console.log(
  'These probes are partial ISO-RLS/ISO-CONTEXT evidence; API/company/worker/role-bypass and all other scenarios still require independent tests.',
);
