import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { verifyFresh } from './verify.mjs';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = path.join(root, '.local');
const configFile = process.env.GL_DATABASE_CONFIG_FILE ? path.resolve(process.env.GL_DATABASE_CONFIG_FILE) : path.join(local, 'database.json');
const pgBin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const exe = name => path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const services = { identity: ['01_identity.sql', 5], catalog: ['02_catalog.sql', 43], media: ['03_media.sql', 6], inquiries: ['04_inquiries.sql', 5] };
const secret = () => crypto.randomBytes(32).toString('base64url');
function run(name, args, options = {}) {
  const result = spawnSync(exe(name), args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.stdout || 'exit status '+result.status+'; Windows process control may require an unrestricted terminal'}`);
  return (result.stdout || '').trim();
}
export function config() {
  if (!fs.existsSync(configFile)) throw new Error('Run init first. Local connection details do not exist.');
  return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}
export function env(cfg, service, runtime = false) {
  const role = runtime ? cfg.services[service] : { user: cfg.adminUser, password: cfg.adminPassword };
  const result = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(cfg.port), PGUSER: role.user, PGPASSWORD: role.password,
    PGDATABASE: service ? cfg.services[service].database : 'postgres', PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5', PGOPTIONS: '' }; delete result.PGSERVICE; delete result.PGSERVICEFILE; return result;
}
export function sql(cfg, service, query, runtime = false) {
  return run('psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { env: env(cfg, service, runtime) });
}
export function file(cfg, service, name, { owner = false, runtime = false, atomic = false, variables = {} } = {}) {
  const args = ['-X', '-w', '-v', 'ON_ERROR_STOP=1'];
  if (atomic) args.push('--single-transaction');
  for (const [key,value] of Object.entries(variables)) args.push('-v',key+'='+value);
  if (owner) args.push('-c', `SET ROLE ${cfg.services[service].owner}`);
  args.push('-f', path.join(root, 'database', name));
  return run('psql', args, { env: env(cfg, service, runtime), maxBuffer: 8 * 1024 * 1024 });
}
export function schemaHash() {
  return crypto.createHash('sha256').update(Object.keys(services).join(',')).update(
    fs.readdirSync(path.join(root, 'database/sql')).filter(n => /^(?:0[0-59]|12)_.*\.sql$/.test(n)).sort().map(n =>
      fs.readFileSync(path.join(root, 'database/sql', n), 'utf8')).join('\n')).digest('hex');
}
function init() {
  fs.mkdirSync(local, { recursive: true });
  if (fs.existsSync(configFile)) { start(); return; }
  const cfg = { port: 55432, adminUser: 'golden_lift_local_admin', adminPassword: secret(), services: {} };
  for (const name of Object.keys(services)) cfg.services[name] = { database: `golden_lift_${name}`, owner: `golden_lift_${name}_owner`, user: `golden_lift_${name}_runtime`, password: secret() };
  const probe = spawnSync(exe('pg_isready'), ['-h', '127.0.0.1', '-p', String(cfg.port)], { windowsHide: true });
  if (probe.status === 0) throw new Error('Port 55432 is already in use; refusing to change another server.');
  const pwfile = path.join(local, 'initdb-password');
  fs.writeFileSync(pwfile, cfg.adminPassword + '\n', { mode: 0o600 });
  try {
    run('initdb', ['-D', path.join(local, 'postgres'), '-U', cfg.adminUser, '--pwfile=' + pwfile,
      '--auth=scram-sha-256', '--encoding=UTF8', '--locale-provider=builtin', '--builtin-locale=C.UTF-8']);
  } finally { fs.unlinkSync(pwfile); }
  fs.appendFileSync(path.join(local, 'postgres/postgresql.conf'), `\nlisten_addresses = '127.0.0.1'\nport = ${cfg.port}\npassword_encryption = 'scram-sha-256'\ntimezone = 'UTC'\n`);
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  start();
  console.log('Initialized a private project-local PostgreSQL server at 127.0.0.1:55432.');
}
function start() {
  const cfg = config();
  const ready = spawnSync(exe('pg_isready'), ['-q','-h','127.0.0.1','-p',String(cfg.port)], { windowsHide: true, env: env(cfg) });
  if (ready.status !== 0) run('pg_ctl', ['-D', path.join(local, 'postgres'), '-l', path.join(local, 'postgres.log'), '-w', '-t', '30', 'start'], { stdio: 'ignore' });
  const actual=path.resolve(sql(cfg,null,'SHOW data_directory'));
  const expected=path.resolve(local,'postgres');
  const normalize=s=>process.platform==='win32'?s.toLowerCase():s;
  if(normalize(actual)!==normalize(expected)) throw new Error('Port 55432 belongs to a different PostgreSQL data directory.');
}
export function grantRuntime(cfg,name) {
  const svc=cfg.services[name];
  file(cfg,name,'sql/07_permissions_template.sql',{variables:{
    database_name:svc.database,service_schema:name,owner_role:svc.owner,runtime_role:svc.user,is_catalog:name==='catalog'
  }});
}
function setup() {
  const cfg = config();
  const hash = schemaHash();
  for (const [name, [entry, expectedTables]] of Object.entries(services)) {
    const svc = cfg.services[name];
    // Role names are fixed application identifiers; credentials travel through psql variables.
    const createRoles = `\\\getenv runtime_password GL_RUNTIME_PASSWORD\n` +
      `SELECT 'CREATE ROLE ${svc.owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${svc.owner}') \\gexec\n` +
      `SELECT format('CREATE ROLE ${svc.user} LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'runtime_password') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${svc.user}') \\gexec\n` +
      `SELECT 'CREATE DATABASE ${svc.database} OWNER ${svc.owner} TEMPLATE template0 ENCODING ''UTF8''' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${svc.database}') \\gexec\n`;
    run('psql', ['-X','-w','-q','-v','ON_ERROR_STOP=1'], { input: createRoles, env: { ...env(cfg), GL_RUNTIME_PASSWORD: svc.password } });
    const marker = sql(cfg, name, `SELECT coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname=current_database()`);
    if (marker) {
      if (marker !== `Golden Lift schema v1.1 ${hash}`) throw new Error(`${svc.database}: installed schema differs; apply a reviewed migration instead of reapplying initial SQL.`);
      console.log(`${svc.database}: schema v1.1 already installed.`);
    } else {
      const existing = sql(cfg, name, `SELECT count(*) FROM pg_tables WHERE schemaname IN ('identity','catalog','media','inquiries','ops')`);
      if (existing !== '0') throw new Error(`${svc.database}: untracked existing tables; refusing to overwrite them.`);
      file(cfg, name, 'sql/' + entry, { owner: true, atomic: true });
      sql(cfg, name, `COMMENT ON DATABASE ${svc.database} IS 'Golden Lift schema v1.1 ${hash}'`);
      console.log(`${svc.database}: installed.`);
    }
    grantRuntime(cfg,name);
    const count = Number(sql(cfg, name, `SELECT count(*) FROM pg_tables WHERE schemaname IN ('${name}','ops')`));
    if (count !== expectedTables) throw new Error(`${svc.database}: expected ${expectedTables} tables, got ${count}`);
    console.log(`${svc.database}: ${count} tables; isolated owner and runtime role.`);
  }
  const envFile = Object.entries(cfg.services).map(([name, s]) => `${name.toUpperCase()}_DATABASE_URL=postgresql://${s.user}:${s.password}@127.0.0.1:${cfg.port}/${s.database}`).join('\n') + '\n';
  fs.writeFileSync(path.join(local, 'database.env'), envFile, { mode: 0o600 });
  console.log('All 59 physical tables installed; credentials saved in .local/database.env (ignored by Git).');
}
export function test(cfg = config()) {
  const dynamic=sql(cfg,'catalog',"SELECT to_regprocedure('catalog.assert_valid_dynamic_catalog()') IS NOT NULL")==='t';
  const checks = [['catalog',dynamic?'tests/dynamic-smoke.sql':'sql/06_smoke_test.sql',false],['catalog',dynamic?'tests/dynamic-tree-specifications.sql':'tests/tree-specifications.sql',true],['catalog',dynamic?'tests/dynamic-technical.sql':'tests/technical.sql',false],
    ['identity','tests/identity.sql',true],['media','tests/media.sql',true],['inquiries','tests/inquiries.sql',true],['catalog','tests/permissions.sql',true]];
  let passed = 0;
  for (const [service, script, runtime] of checks) {
    if (!fs.existsSync(path.join(root, 'database', script))) throw new Error(`Missing test: ${script}`);
    const output = file(cfg, service, script, { runtime });
    console.log(`PASS ${service}: ${script}`);
    fs.writeFileSync(path.join(local, script.replaceAll('/','-') + '.log'), output);
    passed++;
  }
  fs.writeFileSync(path.join(local, 'validation.json'), JSON.stringify({ postgres: sql(cfg,null,'SHOW server_version'), schemaVersion:'1.1', suites:passed, result:'passed' },null,2));
}
function seed() {
  const cfg=config();
  const count=Number(sql(cfg,'catalog',"SELECT count(*) FROM catalog.categories WHERE id::text LIKE '10000000-0000-4000-8000-00000000000%'"));
  if(count===6) { console.log('The six initial root categories are already present (including retained deleted records).'); return; }
  if(count!==0) throw new Error('Partial initial root seed detected; review before changing existing categories.');
  file(cfg,'catalog','sql/08_seed_roots.sql',{runtime:true});
  console.log('Seeded the six agreed root categories with Arabic and English names.');
}
function backup() {
  const cfg=config();
  const backupDir=path.join(local,'backups',new Date().toISOString().replaceAll(':','-').replaceAll('.','-'));
  fs.mkdirSync(backupDir,{recursive:true});
  for(const [name,s] of Object.entries(cfg.services)) run('pg_dump',['--format=custom','--file='+path.join(backupDir,s.database+'.dump')],{env:env(cfg,name)});
  console.log('Created four database backups in '+backupDir);
}
function manifest() {
  const cfg=config();
  const databases={};
  for(const name of Object.keys(services)) {
    databases['golden_lift_'+name]=JSON.parse(sql(cfg,name,`
      SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
        'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
        'constraints',(SELECT coalesce(jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=c.oid),
        'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]'::jsonb) FROM pg_index i WHERE i.indrelid=c.oid),
        'triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)) ORDER BY n.nspname,c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('${name}','ops')
    `));
  }
  const schemaVersion=databases.golden_lift_catalog.some(t=>t.table==='product_types')?'1.2':'1.1';
  fs.writeFileSync(path.join(root,'database/schema-manifest.json'),JSON.stringify({schemaVersion,physicalTables:Object.values(databases).reduce((sum,t)=>sum+t.length,0),databases},null,2)+'\n');
  console.log('Exported the installed column, constraint, index and trigger dictionary.');
}
function status() {
  const cfg = config();
  console.log('PostgreSQL ' + sql(cfg,null,'SHOW server_version') + ` at 127.0.0.1:${cfg.port}`);
  let total=0;
  for (const name of Object.keys(services)) {
    const count=Number(sql(cfg,name,`SELECT count(*) FROM pg_tables WHERE schemaname IN ('${name}','ops')`));
    total+=count; console.log(`${cfg.services[name].database}: ${count} tables`);
  }
  console.log(`Total: ${total} physical tables`);
}
async function main() {
  const command=process.argv[2] || 'status';
  if (command==='init') init();
  else if (command==='start') start();
  else if (command==='stop') { config(); run('pg_ctl',['-D',path.join(local,'postgres'),'-w','-t','30','-m','fast','stop']); console.log('Local server stopped.'); }
  else if (command==='setup') setup();
  else if (command==='test') test();
  else if (command==='seed') seed();
  else if (command==='backup') backup();
  else if (command==='manifest') manifest();
  else if (command==='status') status();
  else if (command==='verify') await verifyFresh(config());
  else if (command==='all') { init(); setup(); seed(); test(); await verifyFresh(config()); manifest(); status(); }
  else throw new Error('Use init, start, setup, seed, test, verify, manifest, backup, status, stop or all.');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=> { console.error(error.message); process.exitCode=1; });


