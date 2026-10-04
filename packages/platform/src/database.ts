import pg from 'pg';
import type { DatabaseConfig } from './config.js';
import { ConfigurationError } from './config.js';
export async function databasePool(config: DatabaseConfig): Promise<pg.Pool> {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    max: config.max,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    query_timeout: 5000,
    application_name: 'golden_lift_' + config.service + '_api',
  });
  pool.on('error', () =>
    console.error(JSON.stringify({ event: 'database.idle_error', service: config.service })),
  );
  try {
    const result = await pool.query<{
      database: string;
      user: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      schema: boolean;
    }>(
      'SELECT current_database() AS database, current_user AS user, r.rolsuper, r.rolcreatedb, r.rolcreaterole, EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS schema FROM pg_roles r WHERE r.rolname=current_user',
      [config.service],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.user !== 'golden_lift_' + config.service + '_runtime' ||
      row.database !== decodeURIComponent(new URL(config.connectionString).pathname.slice(1)) ||
      row.rolsuper ||
      row.rolcreatedb ||
      row.rolcreaterole ||
      !row.schema
    )
      throw new ConfigurationError('Database ownership or runtime-role check failed.');
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
export async function databaseReady(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
