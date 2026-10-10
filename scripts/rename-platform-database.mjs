import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { config, env, sql } from '../database/scripts/db.mjs';
const cfg = config();
const apply = process.argv.includes('--apply');
const services = ['identity', 'catalog', 'media', 'inquiries'];
const directory = path.resolve('.local/identity-rename');
const journalFile = path.join(directory, 'journal.json');
const client = new pg.Client({
  host: '127.0.0.1',
  port: cfg.port,
  database: 'postgres',
  user: cfg.adminUser,
  password: cfg.adminPassword,
  connectionTimeoutMillis: 5000,
});
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
await client.connect();
try {
  const actual = (await client.query('SHOW data_directory')).rows[0].data_directory;
  const normalize = (value) => path.resolve(value).toLowerCase();
  if (normalize(actual) !== normalize('.local/postgres'))
    throw new Error('Not the project-local cluster; refusing rename.');
  const journal = fs.existsSync(journalFile)
    ? JSON.parse(fs.readFileSync(journalFile, 'utf8'))
    : { version: 1, created: new Date().toISOString(), services: {} };
  for (const name of services) {
    const source = cfg.services[name];
    for (const [field, suffix] of [
      ['database', ''],
      ['owner', '_owner'],
      ['user', '_runtime'],
    ]) {
      if (
        !['golden_lift_' + name + suffix, 'business_platform_' + name + suffix].includes(
          source[field],
        )
      )
        throw new Error('Unexpected configured identifier: ' + name + '.' + field);
      const table = field === 'database' ? 'pg_database' : 'pg_roles';
      const column = field === 'database' ? 'datname' : 'rolname';
      const target = 'business_platform_' + name + suffix;
      const rows = (
        await client.query(
          'SELECT oid::text AS oid,' +
            column +
            ' AS name FROM ' +
            table +
            ' WHERE ' +
            column +
            ' = ANY($1)',
          [[source[field], target]],
        )
      ).rows;
      if (rows.length !== 1) throw new Error('Missing or conflicting rename target: ' + target);
      journal.services[name] ??= {};
      const recorded = journal.services[name][field];
      if (recorded && recorded.oid !== rows[0].oid)
        throw new Error('Object identity changed since recorded plan.');
      journal.services[name][field] = {
        oid: rows[0].oid,
        original: recorded?.original ?? rows[0].name,
        target,
      };
    }
  }
  const roleOids = services.flatMap((name) => [
    journal.services[name].owner.oid,
    journal.services[name].user.oid,
  ]);
  const databaseOids = services.map((name) => journal.services[name].database.oid);
  const credentials = (
    await client.query(
      "SELECT rolname, rolpassword LIKE 'SCRAM-SHA-256$%' AS scram FROM pg_authid WHERE oid::text = ANY($1)",
      [services.map((name) => journal.services[name].user.oid)],
    )
  ).rows;
  if (credentials.some((role) => !role.scram))
    throw new Error(
      'Runtime roles must use SCRAM credentials before rename; refusing password invalidation.',
    );
  const active = (
    await client.query(
      'SELECT datname,usename,application_name FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND (datid::text=ANY($1) OR usesysid::text=ANY($2))',
      [databaseOids, roleOids],
    )
  ).rows;
  console.log(
    JSON.stringify(
      {
        action: apply ? 'apply' : 'plan',
        services: journal.services,
        activeClients: active.length,
      },
      null,
      2,
    ),
  );
  if (!apply) process.exitCode = 0;
  else {
    if (active.length)
      throw new Error(
        'Stop all owning APIs/workers/test clients before applying; no client was terminated.',
      );
    fs.mkdirSync(directory, { recursive: true });
    if (!journal.backedUp) {
      if (!fs.existsSync(path.join(directory, 'database-before.json')))
        fs.writeFileSync(
          path.join(directory, 'database-before.json'),
          JSON.stringify(cfg, null, 2),
          { flag: 'wx', mode: 0o600 },
        );
      const binary = path.join(
        process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin',
        process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump',
      );
      for (const name of services) {
        const result = spawnSync(
          binary,
          ['--format=custom', '--file=' + path.join(directory, name + '.dump')],
          { env: env(cfg, name), encoding: 'utf8', windowsHide: true },
        );
        if (result.error || result.status !== 0)
          throw new Error('Backup failed for ' + name + '; no identifiers changed.');
        const check = spawnSync(
          binary.replace(/pg_dump(\.exe)?$/, 'pg_restore$1'),
          ['--list', path.join(directory, name + '.dump')],
          { encoding: 'utf8', windowsHide: true },
        );
        if (check.error || check.status !== 0) throw new Error('Backup archive validation failed.');
      }
      journal.backedUp = true;
      fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
    }
    // Stop new connections before a second live-client check. Existing sessions are never killed.
    await client.query('BEGIN');
    try {
      for (const oid of databaseOids) {
        const current = (await client.query('SELECT datname FROM pg_database WHERE oid=$1', [oid]))
          .rows[0].datname;
        await client.query('ALTER DATABASE ' + identifier(current) + ' ALLOW_CONNECTIONS false');
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    try {
      const remaining = (
        await client.query(
          'SELECT pid FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND (datid::text=ANY($1) OR usesysid::text=ANY($2))',
          [databaseOids, roleOids],
        )
      ).rows;
      if (remaining.length) throw new Error('A client connected during backup; stop it and rerun.');
      await client.query('BEGIN');
      try {
        for (const name of services)
          for (const field of ['owner', 'user']) {
            const item = journal.services[name][field];
            const current = (
              await client.query('SELECT rolname FROM pg_roles WHERE oid=$1', [item.oid])
            ).rows[0].rolname;
            if (current !== item.target)
              await client.query(
                'ALTER ROLE ' + identifier(current) + ' RENAME TO ' + identifier(item.target),
              );
          }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      for (const name of services) {
        const item = journal.services[name].database;
        const current = (
          await client.query('SELECT datname FROM pg_database WHERE oid=$1', [item.oid])
        ).rows[0].datname;
        if (current !== item.target)
          await client.query(
            'ALTER DATABASE ' + identifier(current) + ' RENAME TO ' + identifier(item.target),
          );
      }
      const next = structuredClone(cfg);
      for (const name of services)
        for (const field of ['database', 'owner', 'user'])
          next.services[name][field] = journal.services[name][field].target;
      const configFile =
        process.env.BUSINESS_PLATFORM_DATABASE_CONFIG_FILE || '.local/database.json';
      fs.writeFileSync(configFile + '.rename.tmp', JSON.stringify(next, null, 2) + '\n', {
        mode: 0o600,
      });
      fs.renameSync(configFile + '.rename.tmp', configFile);
      fs.writeFileSync(
        '.local/database.env',
        services
          .map((name) => {
            const s = next.services[name];
            return (
              name.toUpperCase() +
              '_DATABASE_URL=postgresql://' +
              s.user +
              ':' +
              encodeURIComponent(s.password) +
              '@127.0.0.1:' +
              next.port +
              '/' +
              s.database
            );
          })
          .join('\n') + '\n',
        { mode: 0o600 },
      );
      journal.completed = new Date().toISOString();
      fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
      console.log(
        'Renamed four databases and eight roles by OID; credentials, grants, rows and object keys preserved.',
      );
    } finally {
      for (const oid of databaseOids) {
        const row = (await client.query('SELECT datname FROM pg_database WHERE oid=$1', [oid]))
          .rows[0];
        if (row)
          await client.query(
            'ALTER DATABASE ' + identifier(row.datname) + ' ALLOW_CONNECTIONS true',
          );
      }
    }
    for (const name of services) sql(config(), name, 'SELECT 1', true);
    console.log(
      'PASS all four owning runtime connections. Bootstrap cluster administrator remains its existing identity.',
    );
  }
} finally {
  await client.end();
}
