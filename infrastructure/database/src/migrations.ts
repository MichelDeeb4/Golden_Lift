import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
export interface Migration {
  sequence: number;
  name: string;
  sha256: string;
  sql: string;
}
export function readManifest(directory: string): Migration[] {
  const names = fs
    .readdirSync(directory)
    .filter((n) => n.endsWith('.sql'))
    .sort();
  return names.map((name, index) => {
    if (!/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(name) || Number(name.slice(0, 4)) !== index + 1)
      throw new Error('Invalid migration sequence');
    const sql = fs.readFileSync(path.join(directory, name), 'utf8');
    if (!sql.trim()) throw new Error('Empty migration');
    return {
      sequence: index + 1,
      name,
      sha256: createHash('sha256').update(sql).digest('hex'),
      sql,
    };
  });
}
export async function migrate(
  pool: Pool,
  manifest: readonly Migration[],
  owner: 'erp_owner' | 'control_owner',
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(724031)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS public.schema_migration(sequence integer PRIMARY KEY,name text NOT NULL,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await client.query('REVOKE ALL ON public.schema_migration FROM PUBLIC');
    await client.query('ALTER TABLE public.schema_migration OWNER TO ' + owner);
    const { rows } = await client.query<{ sequence: number; sha256: string }>(
      'SELECT sequence,sha256 FROM public.schema_migration ORDER BY sequence',
    );
    if (
      rows.length > manifest.length ||
      rows.some((r, i) => r.sequence !== manifest[i]?.sequence || r.sha256 !== manifest[i]?.sha256)
    )
      throw new Error('Migration checksum/history mismatch');
    for (const m of manifest.slice(rows.length)) {
      await client.query('BEGIN');
      try {
        await client.query(
          owner === 'erp_owner' ? 'SET LOCAL ROLE erp_owner' : 'SET LOCAL ROLE control_owner',
        );
        await client.query(m.sql);
        await client.query(
          'INSERT INTO public.schema_migration(sequence,name,sha256) VALUES($1,$2,$3)',
          [m.sequence, m.name, m.sha256],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return manifest.length;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(724031)');
    } finally {
      client.release();
    }
  }
}
