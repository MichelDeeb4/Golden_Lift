// Disposable validation cluster. Never initializes or changes the normal .local/database.json profile.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = path.resolve('.local'),
  pointer = path.join(root, 'b5-validation-pointer.json');
const bin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const exe = (name) => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
function run(name, args, env = process.env) {
  const result = spawnSync(exe(name), args, {
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    ...(name === 'pg_ctl' ? { stdio: 'ignore' } : {}),
  });
  if (result.status !== 0 || result.error)
    throw new Error(
      name + ' failed: ' + (result.error?.message ?? result.stderr ?? 'unknown failure'),
    );
  return (result.stdout ?? '').trim();
}
if (process.argv[2] === 'start') {
  fs.mkdirSync(root, { recursive: true });
  if (fs.existsSync(pointer))
    throw new Error(
      'A B5 validation cluster is already recorded. Stop it before creating another.',
    );
  const directory = fs.mkdtempSync(path.join(root, 'b5-validation-'));
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('No free port.')),
      );
    });
  });
  const secret = () => randomBytes(32).toString('base64url');
  const cfg = { port, adminUser: 'b5_disposable_admin', adminPassword: secret(), services: {} };
  for (const name of ['identity', 'catalog', 'media', 'inquiries'])
    cfg.services[name] = {
      database: 'business_platform_' + name,
      owner: 'business_platform_' + name + '_owner',
      user: 'business_platform_' + name + '_runtime',
      password: secret(),
    };
  const passwordFile = path.join(directory, 'init-password');
  fs.writeFileSync(passwordFile, cfg.adminPassword + '\n', { mode: 0o600 });
  try {
    run('initdb', [
      '-D',
      path.join(directory, 'postgres'),
      '-U',
      cfg.adminUser,
      '--pwfile=' + passwordFile,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale-provider=builtin',
      '--builtin-locale=C.UTF-8',
    ]);
  } finally {
    fs.unlinkSync(passwordFile);
  }
  fs.appendFileSync(
    path.join(directory, 'postgres/postgresql.conf'),
    `\nlisten_addresses='127.0.0.1'\nport=${port}\ntimezone='UTC'\nmax_connections=80\n`,
  );
  const configFile = path.join(directory, 'database.json');
  fs.writeFileSync(configFile, JSON.stringify(cfg), { mode: 0o600 });
  fs.writeFileSync(pointer, JSON.stringify({ directory, configFile }), { mode: 0o600 });
  run('pg_ctl', [
    '-D',
    path.join(directory, 'postgres'),
    '-l',
    path.join(directory, 'postgres.log'),
    '-w',
    '-t',
    '30',
    'start',
  ]);
  const env = {
    ...process.env,
    PGHOST: '127.0.0.1',
    PGPORT: String(port),
    PGUSER: cfg.adminUser,
    PGPASSWORD: cfg.adminPassword,
    PGDATABASE: 'postgres',
  };
  for (const s of Object.values(cfg.services)) {
    run(
      'psql',
      [
        '-X',
        '-w',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `CREATE ROLE ${s.owner} NOLOGIN; CREATE ROLE ${s.user} LOGIN PASSWORD '${s.password}';`,
      ],
      env,
    );
    run(
      'psql',
      [
        '-X',
        '-w',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `CREATE DATABASE ${s.database} OWNER ${s.owner} TEMPLATE template0 ENCODING 'UTF8';`,
      ],
      env,
    );
  }
  process.env.BUSINESS_PLATFORM_DATABASE_CONFIG_FILE = configFile;
  const tools = await import('../database/scripts/db.mjs');
  for (const [name, file] of Object.entries({
    identity: '01_identity.sql',
    catalog: '19_catalog_media_core_fresh.sql',
    media: '18_media_core_fresh.sql',
    inquiries: '04_inquiries.sql',
  })) {
    tools.file(cfg, name, 'sql/' + file, { owner: true, atomic: true });
    tools.grantRuntime(cfg, name);
  }
  console.log(JSON.stringify({ event: 'b5.disposable-cluster.ready', port, configFile }));
} else if (process.argv[2] === 'stop') {
  const info = JSON.parse(fs.readFileSync(pointer, 'utf8')),
    directory = path.resolve(info.directory);
  if (path.dirname(directory) !== root || !path.basename(directory).startsWith('b5-validation-'))
    throw new Error('Unsafe disposable cluster path.');
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Unsafe cluster directory link.');
  const profile = JSON.parse(fs.readFileSync(info.configFile, 'utf8'));
  if (
    profile.adminUser !== 'b5_disposable_admin' ||
    path.dirname(path.resolve(info.configFile)) !== directory
  )
    throw new Error('Not an owned disposable profile.');
  const status = spawnSync(exe('pg_ctl'), ['-D', path.join(directory, 'postgres'), 'status'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  if (status.error || ![0, 3].includes(status.status))
    throw new Error('Cannot establish disposable PostgreSQL shutdown state.');
  const pidFile = path.join(directory, 'postgres', 'postmaster.pid');
  if (status.status === 3 && fs.existsSync(pidFile))
    throw new Error('PostgreSQL retains a process marker; retry cleanup with process visibility.');
  if (status.status === 0)
    run('pg_ctl', ['-D', path.join(directory, 'postgres'), '-w', '-t', '30', '-m', 'fast', 'stop']);
  if (fs.existsSync(pidFile))
    throw new Error('PostgreSQL shutdown did not remove its process marker.');
  fs.rmSync(directory, { recursive: true, force: true });
  fs.unlinkSync(pointer);
  console.log('Removed only the owned B5 disposable cluster.');
} else throw new Error('Use b5-environment.mjs start or stop.');
