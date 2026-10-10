import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { databasePool } from '../../src/database.js';
export type FixtureService = 'identity' | 'catalog' | 'media' | 'inquiries';
interface LocalConfig {
  port: number;
  services: Record<
    FixtureService,
    { database: string; owner: string; user: string; password: string }
  >;
}
interface DatabaseTools {
  config(): LocalConfig;
  sql(cfg: LocalConfig, service: string | null, query: string): string;
  file(
    cfg: LocalConfig,
    service: string,
    name: string,
    options: { owner: boolean; atomic: boolean },
  ): string;
  grantRuntime(cfg: LocalConfig, service: string): void;
}
const tools = (await import(
  pathToFileURL(path.join(process.cwd(), 'database/scripts/db.mjs')).href
)) as DatabaseTools;
const entrypoints: Record<FixtureService, string> = {
  identity: '01_identity.sql',
  catalog: '25_category_catalog_fresh.sql',
  media: '18_media_core_fresh.sql',
  inquiries: '04_inquiries.sql',
};
export async function databaseFixture(
  service: FixtureService,
  options: { readonly catalogProfile?: 'v1.1' | 'v1.2' | 'category' } = {},
) {
  const original = tools.config(),
    scratch = structuredClone(original),
    entry = scratch.services[service];
  const database = 'golden_lift_orm_' + service + '_' + randomUUID().replaceAll('-', '');
  if (
    !/^golden_lift_orm_(identity|catalog|media|inquiries)_[0-9a-f]{32}$/.test(database) ||
    database.length > 63
  )
    throw new Error('Unsafe fixture database name.');
  entry.database = database;
  tools.sql(
    original,
    null,
    'CREATE DATABASE ' + database + ' OWNER ' + entry.owner + " TEMPLATE template0 ENCODING 'UTF8'",
  );
  try {
    const entrypoint =
      service === 'catalog' && options.catalogProfile === 'v1.1'
        ? '20_catalog_media_legacy_fresh.sql'
        : service === 'catalog' && options.catalogProfile === 'category'
          ? '25_category_catalog_fresh.sql'
          : entrypoints[service];
    tools.file(scratch, service, 'sql/' + entrypoint, { owner: true, atomic: true });
    if (service === 'catalog' && options.catalogProfile === 'v1.1')
      tools.file(scratch, service, 'sql/21_catalog_product_management.sql', {
        owner: true,
        atomic: true,
      });
    tools.grantRuntime(scratch, service);
    const pool = await databasePool({
      service,
      connectionString:
        'postgresql://' +
        entry.user +
        ':' +
        encodeURIComponent(entry.password) +
        '@127.0.0.1:' +
        scratch.port +
        '/' +
        database,
      max: 5,
    });
    return {
      pool,
      configuration: scratch,
      async dispose() {
        try {
          if (!pool.ended) await pool.end();
        } finally {
          tools.sql(original, null, 'DROP DATABASE ' + database + ' WITH (FORCE)');
        }
      },
    };
  } catch (error) {
    tools.sql(original, null, 'DROP DATABASE ' + database + ' WITH (FORCE)');
    throw error;
  }
}
