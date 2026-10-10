import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { migrate, readManifest } from './migrations.js';
export function identifier(value: string): string {
  if (!/^bp_[a-z0-9_]{1,45}$/.test(value)) throw new Error('Invalid infrastructure identifier');
  return '"' + value + '"';
}
export async function initializeClusterRoles(admin: Pool): Promise<void> {
  await admin.query(`DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='erp_owner') THEN CREATE ROLE erp_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='erp_migrator') THEN CREATE ROLE erp_migrator NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT erp_owner TO erp_migrator; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='erp_runtime') THEN CREATE ROLE erp_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='control_owner') THEN CREATE ROLE control_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='control_runtime') THEN CREATE ROLE control_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 END $$`);
  const roles = await admin.query(
    "SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('erp_owner','erp_migrator','erp_runtime','control_owner','control_runtime')",
  );
  if (
    roles.rows.length !== 5 ||
    roles.rows.some((r) => r.rolsuper || r.rolbypassrls || r.rolcanlogin)
  )
    throw new Error('Unsafe infrastructure role');
  const membership = await admin.query(
    "SELECT pg_has_role('erp_runtime','erp_owner','MEMBER') OR pg_has_role('erp_runtime','erp_migrator','MEMBER') OR pg_has_role('control_runtime','control_owner','MEMBER') AS unsafe",
  );
  if (membership.rows[0]?.unsafe) throw new Error('Unsafe runtime role membership');
}
export async function createDatabase(
  admin: Pool,
  name: string,
  owner: 'erp_owner' | 'control_owner',
  login: string,
  password: string,
): Promise<void> {
  const db = identifier(name),
    user = identifier(login);
  // Credentials are internally supplied, never accepted from an HTTP DTO or logged.
  if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('Operational password format invalid');
  const { rows } = await admin.query<{ owner: string }>(
    'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
    [name],
  );
  if (rows.length && rows[0]?.owner !== owner)
    throw new Error('Existing database ownership mismatch');
  if (!rows.length) await admin.query('CREATE DATABASE ' + db + ' OWNER ' + owner);
  const roles = await admin.query<{
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
  }>(
    'SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=$1',
    [login],
  );
  if (
    roles.rows[0] &&
    (roles.rows[0].rolsuper ||
      roles.rows[0].rolcreaterole ||
      roles.rows[0].rolcreatedb ||
      roles.rows[0].rolbypassrls ||
      !roles.rows[0].rolcanlogin)
  )
    throw new Error('Existing runtime role privilege mismatch');
  if (roles.rowCount) {
    const membership = await admin.query(
      "SELECT pg_has_role($1,'erp_owner','MEMBER') OR pg_has_role($1,'erp_migrator','MEMBER') OR pg_has_role($1,'control_owner','MEMBER') AS unsafe",
      [login],
    );
    if (membership.rows[0]?.unsafe) throw new Error('Existing runtime role membership mismatch');
  }
  if (!roles.rowCount)
    await admin.query(
      'CREATE ROLE ' +
        user +
        " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '" +
        password +
        "'",
    );
  await admin.query(
    'GRANT ' + (owner === 'erp_owner' ? 'erp_runtime' : 'control_runtime') + ' TO ' + user,
  );
  await admin.query('REVOKE ALL ON DATABASE ' + db + ' FROM PUBLIC');
  await admin.query('GRANT CONNECT ON DATABASE ' + db + ' TO ' + user);
}
export interface ProvisionRequest {
  tenantId: string;
  mode: 'pooled' | 'dedicated';
  databaseId: string;
  credentialRef: string;
  idempotencyKey: string;
}
export interface ProvisionResources {
  admin: Pool;
  control: Pool;
  openDatabase: (name: string) => Pool;
  openRuntimeDatabase: (name: string) => Pool;
  runtimeSecret: (name: string) => { login: string; password: string };
  erpMigrations: string;
}
export async function provision(
  resources: ProvisionResources,
  request: ProvisionRequest,
): Promise<void> {
  const { admin, control } = resources;
  identifier(request.databaseId);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.tenantId) ||
    !request.idempotencyKey ||
    !request.credentialRef
  )
    throw new Error('Invalid provisioning request');
  const lock = await control.connect();
  let database: Pool | undefined;
  let operationId = '';
  let resourceTouched = false;
  try {
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [request.tenantId]);
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [
      'database:' + request.databaseId,
    ]);
    await lock.query('BEGIN');
    try {
      await lock.query(
        "INSERT INTO tenant_registry(id,lifecycle) VALUES($1,'PROVISIONING') ON CONFLICT(id) DO NOTHING",
        [request.tenantId],
      );
      const prior = await lock.query<{
        id: string;
        tenant_id: string;
        database_id: string;
        mode: string;
        state: string;
      }>('SELECT * FROM provisioning_operation WHERE idempotency_key=$1', [request.idempotencyKey]);
      if (prior.rows[0]) {
        const p = prior.rows[0];
        if (
          p.tenant_id !== request.tenantId ||
          p.database_id !== request.databaseId ||
          p.mode !== request.mode
        )
          throw new Error('Provisioning idempotency conflict');
        operationId = p.id;
      } else {
        const assignment = await lock.query('SELECT 1 FROM storage_assignment WHERE tenant_id=$1', [
          request.tenantId,
        ]);
        if (assignment.rowCount) throw new Error('Tenant already assigned');
        operationId = randomUUID();
        await lock.query(
          "INSERT INTO provisioning_operation(id,tenant_id,idempotency_key,database_id,mode,state) VALUES($1,$2,$3,$4,$5,'REQUESTED')",
          [operationId, request.tenantId, request.idempotencyKey, request.databaseId, request.mode],
        );
      }
      await lock.query('COMMIT');
    } catch (error) {
      await lock.query('ROLLBACK');
      throw error;
    }
    await lock.query(
      "UPDATE provisioning_operation SET state='ALLOCATING',attempt=attempt+1,last_error=NULL,updated_at=now() WHERE id=$1",
      [operationId],
    );
    await lock.query(
      "INSERT INTO storage_database(id,mode,credential_ref,state) VALUES($1,$2,$3,'ALLOCATING') ON CONFLICT(id) DO NOTHING",
      [request.databaseId, request.mode, request.credentialRef],
    );
    const existing = await lock.query<{ mode: string; credential_ref: string }>(
      'SELECT mode,credential_ref FROM storage_database WHERE id=$1',
      [request.databaseId],
    );
    if (
      existing.rows[0]?.mode !== request.mode ||
      existing.rows[0]?.credential_ref !== request.credentialRef
    )
      throw new Error('Storage assignment conflict');
    resourceTouched = true;
    const secret = resources.runtimeSecret(request.databaseId);
    await createDatabase(admin, request.databaseId, 'erp_owner', secret.login, secret.password);
    database = resources.openDatabase(request.databaseId);
    await database.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await database.query('GRANT USAGE ON SCHEMA public TO erp_runtime');
    await lock.query("UPDATE provisioning_operation SET state='MIGRATING' WHERE id=$1", [
      operationId,
    ]);
    await lock.query("UPDATE storage_database SET state='MIGRATING' WHERE id=$1", [
      request.databaseId,
    ]);
    const version = await migrate(database, readManifest(resources.erpMigrations), 'erp_owner');
    await lock.query("UPDATE provisioning_operation SET state='SEEDING' WHERE id=$1", [
      operationId,
    ]);
    const connection = await database.connect();
    try {
      await connection.query('BEGIN');
      await connection.query(
        'INSERT INTO storage_binding(singleton,mode,expected_tenant) VALUES(true,$1,$2) ON CONFLICT(singleton) DO NOTHING',
        [request.mode, request.mode === 'dedicated' ? request.tenantId : null],
      );
      const binding = await connection.query<{ mode: string; expected_tenant: string | null }>(
        'SELECT mode,expected_tenant FROM storage_binding',
      );
      if (
        binding.rows[0]?.mode !== request.mode ||
        (request.mode === 'dedicated' && binding.rows[0]?.expected_tenant !== request.tenantId)
      )
        throw new Error('Dedicated storage binding mismatch');
      await connection.query(
        'INSERT INTO tenant_installation(tenant_id) VALUES($1) ON CONFLICT(tenant_id) DO NOTHING',
        [request.tenantId],
      );
      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
    await lock.query("UPDATE provisioning_operation SET state='VERIFYING' WHERE id=$1", [
      operationId,
    ]);
    const runtime = resources.openRuntimeDatabase(request.databaseId);
    let probe;
    try {
      probe = await runtime.connect();
      await probe.query('BEGIN');
      await probe.query("SELECT set_config('app.tenant_id',$1,true)", [request.tenantId]);
      const ready = await probe.query(
        'SELECT 1 FROM tenant_installation WHERE tenant_id=$1 AND public.scoped_tenant()=$1::uuid',
        [request.tenantId],
      );
      if (ready.rowCount !== 1) throw new Error('Runtime installation validation failed');
      await probe.query('ROLLBACK');
    } finally {
      probe?.release();
      await runtime.end();
    }
    await lock.query('BEGIN');
    try {
      await lock.query(
        "UPDATE storage_database SET schema_version=$2,state='READY',last_error=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
        [request.databaseId, version],
      );
      await lock.query(
        'INSERT INTO storage_assignment(tenant_id,database_id) VALUES($1,$2) ON CONFLICT(tenant_id) DO NOTHING',
        [request.tenantId, request.databaseId],
      );
      const assigned = await lock.query<{ database_id: string }>(
        'SELECT database_id FROM storage_assignment WHERE tenant_id=$1',
        [request.tenantId],
      );
      if (assigned.rows[0]?.database_id !== request.databaseId)
        throw new Error('Assignment conflict');
      await lock.query(
        "UPDATE tenant_registry SET lifecycle='READY' WHERE id=$1 AND lifecycle IN ('PROVISIONING','FAILED','READY')",
        [request.tenantId],
      );
      await lock.query(
        "UPDATE provisioning_operation SET state='READY',last_error=NULL WHERE id=$1",
        [operationId],
      );
      await lock.query(
        "INSERT INTO registry_change(tenant_id,action,revision,operation_id) VALUES($1,'PROVISION_READY',1,$2) ON CONFLICT DO NOTHING",
        [request.tenantId, operationId],
      );
      await lock.query('COMMIT');
    } catch (error) {
      await lock.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (resourceTouched)
      await lock.query(
        "UPDATE storage_database SET state='FAILED',last_error='MIGRATION_FAILED' WHERE id=$1",
        [request.databaseId],
      );
    if (operationId)
      await lock.query(
        "UPDATE provisioning_operation SET state='FAILED',last_error='PROVISIONING_FAILED' WHERE id=$1",
        [operationId],
      );
    throw error;
  } finally {
    if (database) await database.end();
    try {
      await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [
        'database:' + request.databaseId,
      ]);
      await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [request.tenantId]);
    } finally {
      lock.release();
    }
  }
}
