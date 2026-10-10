import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const pointer = JSON.parse(fs.readFileSync('.local/b5-validation-pointer.json', 'utf8'));
process.env.BUSINESS_PLATFORM_DATABASE_CONFIG_FILE = pointer.configFile;
const tools = await import('../database/scripts/db.mjs'),
  original = tools.config(),
  scratch = structuredClone(original),
  created = [];
function dictionary(cfg, name) {
  return tools.sql(
    cfg,
    name,
    `SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
    'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT coalesce(jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=c.oid),
    'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]'::jsonb) FROM pg_index i WHERE i.indrelid=c.oid),
    'triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)) ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('${name}','ops')`,
  );
}
try {
  const manifest = JSON.parse(fs.readFileSync('database/schema-manifest.json', 'utf8'));
  for (const name of ['media', 'catalog']) {
    const fresh = structuredClone(original),
      upgrade = structuredClone(original),
      base = name === 'media' ? '03_media.sql' : '15_catalog_dynamic.sql',
      entry = name === 'media' ? '18_media_core_fresh.sql' : '19_catalog_media_core_fresh.sql',
      migration = name === 'media' ? '16_media_core.sql' : '17_catalog_media_core.sql';
    for (const cfg of [fresh, upgrade]) {
      const s = cfg.services[name];
      s.database =
        'business_platform_b5_schema_' + name + '_' + randomUUID().replaceAll('-', '').slice(0, 16);
      tools.sql(
        original,
        null,
        `CREATE DATABASE ${s.database} OWNER ${s.owner} TEMPLATE template0 ENCODING 'UTF8'`,
      );
      created.push(s.database);
    }
    tools.file(fresh, name, 'sql/' + entry, { owner: true, atomic: true });
    tools.grantRuntime(fresh, name);
    tools.file(upgrade, name, 'sql/' + base, { owner: true, atomic: true });
    tools.file(upgrade, name, 'sql/' + migration, { owner: true, atomic: true });
    tools.grantRuntime(upgrade, name);
    const reviewed = dictionary(fresh, name);
    assert.equal(reviewed, dictionary(upgrade, name), name + ' fresh/upgrade schema parity');
    manifest.databases['business_platform_' + name] = JSON.parse(reviewed);
    scratch.services[name] = fresh.services[name];
    console.log('PASS B5 fresh/upgrade columns, constraints, indexes and triggers: ' + name);
  }
  manifest.schemaVersion = '1.3';
  manifest.physicalTables = Object.values(manifest.databases).reduce((sum, t) => sum + t.length, 0);
  fs.writeFileSync('database/schema-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  const cfgFile = path.join(pointer.directory, 'schema-config.json');
  fs.writeFileSync(cfgFile, JSON.stringify(scratch), { mode: 0o600 });
  // Prisma verification is read-only; its URLs resolve solely to this disposable cluster.
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['scripts/verify-orm.mjs'], {
    env: { ...process.env, BUSINESS_PLATFORM_DATABASE_CONFIG_FILE: cfgFile },
    encoding: 'utf8',
    windowsHide: true,
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  assert.equal(result.status, 0, 'B5 Prisma/schema parity');
} finally {
  for (const database of created) {
    if (!/^business_platform_b5_schema_(media|catalog)_[a-f0-9]{16}$/.test(database))
      throw new Error('Unsafe schema fixture cleanup.');
    tools.sql(original, null, 'DROP DATABASE ' + database + ' WITH (FORCE)');
  }
}
