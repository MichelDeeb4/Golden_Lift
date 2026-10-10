import type { Pool } from 'pg';
import { migrate } from './migrations.js';
import type { Migration } from './migrations.js';
import { identifier } from './provisioning.js';
export async function migrateFleet(
  control: Pool,
  openDatabase: (id: string) => Pool,
  manifest: readonly Migration[],
): Promise<{ databaseId: string; state: 'READY' | 'FAILED'; version: number | null }[]> {
  const databases = await control.query<{ id: string; revision: string }>(
    'SELECT id,revision FROM storage_database ORDER BY id',
  );
  const results: { databaseId: string; state: 'READY' | 'FAILED'; version: number | null }[] = [];
  for (const database of databases.rows) {
    identifier(database.id);
    let pool: Pool | undefined;
    let reserved = false;
    try {
      const active = await control.query(
        "SELECT 1 FROM tenant_registry t JOIN storage_assignment a ON a.tenant_id=t.id WHERE a.database_id=$1 AND t.lifecycle='ACTIVE'",
        [database.id],
      );
      if (active.rowCount) throw new Error('Active migration requires coordinated maintenance');
      const claimed = await control.query(
        "UPDATE storage_database SET state='MIGRATING',revision=revision+1 WHERE id=$1 AND revision=$2 AND state IN ('READY','FAILED')",
        [database.id, database.revision],
      );
      if (claimed.rowCount !== 1) throw new Error('Fleet operation conflict');
      reserved = true;
      pool = openDatabase(database.id);
      const version = await migrate(pool, manifest, 'erp_owner');
      await control.query(
        "UPDATE storage_database SET state='READY',schema_version=$2,last_error=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
        [database.id, version],
      );
      results.push({ databaseId: database.id, state: 'READY', version });
    } catch (error) {
      if (reserved)
        await control.query(
          "UPDATE storage_database SET state='FAILED',last_error='MIGRATION_FAILED',revision=revision+1,updated_at=now() WHERE id=$1",
          [database.id],
        );
      results.push({ databaseId: database.id, state: 'FAILED', version: null });
      if (!(error instanceof Error)) throw error;
    } finally {
      if (pool) await pool.end();
    }
  }
  return results;
}
