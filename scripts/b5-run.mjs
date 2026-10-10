// Supply ephemeral credentials only to disposable validation processes, without changing local/live profiles.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const pointer = JSON.parse(fs.readFileSync('.local/b5-validation-pointer.json', 'utf8'));
const directory = path.resolve(pointer.directory);
if (
  path.dirname(directory) !== path.resolve('.local') ||
  !path.basename(directory).startsWith('b5-validation-')
)
  throw new Error('Unsafe validation profile.');
const cfg = JSON.parse(fs.readFileSync(pointer.configFile, 'utf8'));
const secret = () => randomBytes(32).toString('base64url'),
  callers = { catalog: secret(), media: secret(), inquiries: secret() };
const env = {
  ...process.env,
  BUSINESS_PLATFORM_DATABASE_CONFIG_FILE: pointer.configFile,
  NODE_ENV: 'development',
  IDENTITY_CSRF_SECRET: secret(),
  IDENTITY_SERVICE_CREDENTIALS: JSON.stringify(callers),
  CATALOG_IDENTITY_SERVICE_TOKEN: callers.catalog,
  MEDIA_IDENTITY_SERVICE_TOKEN: callers.media,
  INQUIRIES_IDENTITY_SERVICE_TOKEN: callers.inquiries,
  MEDIA_CATALOG_TOKEN: secret(),
  MEDIA_EVENT_SECRET: secret(),
  CATALOG_EVENT_SECRET: secret(),
  MEDIA_STORAGE_ROOT: path.join(directory, 'objects'),
  MEDIA_SCRATCH_ROOT: path.join(directory, 'scratch'),
};
for (const [name, s] of Object.entries(cfg.services))
  env[name.toUpperCase() + '_DATABASE_URL'] =
    `postgresql://${s.user}:${encodeURIComponent(s.password)}@127.0.0.1:${cfg.port}/${s.database}`;
const commands = {
  'test:integration': [['scripts/test.mjs', 'integration']],
  check: [
    ['scripts/check-boundaries.mjs'],
    ['scripts/test-boundaries.mjs'],
    ['scripts/prisma.mjs', 'validate'],
    ['scripts/test.mjs', 'unit'],
  ],
  smoke: [['scripts/smoke.mjs']],
  'smoke:identity': [['scripts/identity-smoke.mjs']],
  'orm:verify': [['scripts/verify-orm.mjs']],
  'db:verify:dynamic': [['database/scripts/verify-dynamic.mjs']],
  'db:test': [['database/scripts/db.mjs', 'test']],
  manifest: [['database/scripts/db.mjs', 'manifest']],
};
const command = process.argv[2];
if (!commands[command]) throw new Error('Unsupported validation command.');
if (command === 'smoke') {
  process.env.BUSINESS_PLATFORM_DATABASE_CONFIG_FILE = pointer.configFile;
  const tools = await import('../database/scripts/db.mjs');
  if (
    tools.sql(
      cfg,
      'catalog',
      "SELECT count(*) FROM catalog.categories WHERE id::text LIKE '10000000-0000-4000-8000-00000000000%'",
    ) === '0'
  )
    tools.file(cfg, 'catalog', 'sql/08_seed_roots.sql', { owner: true });
}
const logs = path.join(directory, 'logs');
fs.mkdirSync(logs, { recursive: true });
for (const args of commands[command]) {
  const result = spawnSync(process.execPath, args, {
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  fs.writeFileSync(
    path.join(logs, command.replaceAll(':', '-') + '-' + path.basename(args[0]) + '.log'),
    output,
  );
  console.log(output.length > 10000 ? output.slice(-10000) : output);
  if (result.status !== 0 || result.error) process.exit(result.status ?? 1);
}
