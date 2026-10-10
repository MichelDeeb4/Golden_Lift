// Local, reviewed expansion/owner-copy rollout. Never use against hosted databases.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config, env, sql, file, grantRuntime } from '../database/scripts/db.mjs';

if (
  !process.argv.includes('--reviewed') ||
  process.env.NODE_ENV === 'production' ||
  process.env.GL_DATABASE_CONFIG_FILE
)
  throw Error(
    'Use --reviewed only for the default local profile, with application writers stopped.',
  );
const cfg = config();
function stopped() {
  for (const service of ['catalog', 'media']) {
    const clients = Number(
      sql(
        cfg,
        service,
        "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'",
      ),
    );
    if (clients)
      throw Error(`${service}: ${clients} active clients; stop all writers before rollout.`);
  }
}
stopped();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.resolve('.local/deletion-backups', stamp);
fs.mkdirSync(backup, { recursive: true });
for (const service of ['catalog', 'media']) {
  const result = spawnSync(
    path.join(process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin', 'pg_dump.exe'),
    ['--format=custom', '--file=' + path.join(backup, service + '.dump')],
    { env: env(cfg, service), windowsHide: true, encoding: 'utf8' },
  );
  if (result.error || result.status !== 0)
    throw Error(`${service}: backup failed before migration.`);
}
const source = path.resolve(process.env.MEDIA_STORAGE_ROOT ?? '.local/media/private');
fs.cpSync(source, path.join(backup, 'private'), {
  recursive: true,
  errorOnExist: true,
  force: false,
});
fs.copyFileSync('.local/deletion-owner-copies.json', path.join(backup, 'owner-copies.before.json'));
fs.writeFileSync(
  path.join(backup, 'state.json'),
  JSON.stringify({ createdAt: new Date().toISOString(), source, status: 'BACKED_UP' }, null, 2),
);
stopped();
for (const [service, migration] of [
  ['catalog', '27_catalog_deletion_expand.sql'],
  ['media', '28_media_deletion_expand.sql'],
]) {
  if (sql(cfg, service, "SELECT to_regclass('ops.deletion_operations') IS NOT NULL") !== 't')
    file(cfg, service, 'sql/' + migration, { owner: true, atomic: true });
  grantRuntime(cfg, service);
}
stopped();
const copies = spawnSync(
  process.execPath,
  ['scripts/deletion-owner-copies.mjs', 'apply', '--reviewed'],
  { stdio: 'inherit', windowsHide: true },
);
if (copies.error || copies.status !== 0)
  throw Error(
    'Owner copies incomplete. Keep writers stopped and resume the same manifest; backups retained at ' +
      backup,
  );
stopped();
if (
  sql(
    cfg,
    'catalog',
    "SELECT to_regprocedure('catalog.assert_exclusive_media_owners()') IS NOT NULL",
  ) !== 't'
)
  file(cfg, 'catalog', 'sql/29_catalog_media_ownership.sql', { owner: true, atomic: true });
sql(cfg, 'catalog', 'SELECT catalog.assert_exclusive_media_owners()');
fs.copyFileSync('.local/deletion-owner-copies.json', path.join(backup, 'owner-copies.after.json'));
fs.writeFileSync(
  path.join(backup, 'state.json'),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      source,
      status: 'OWNERSHIP_ENFORCED',
      retainedReferenceDecision: 'PENDING',
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ status: 'OWNERSHIP_ENFORCED', backup, sourceObjectsRetained: true }));
