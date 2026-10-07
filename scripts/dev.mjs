import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const web = process.argv.includes('--web');
let mediaProfile;
if (web) {
  if (process.env.NODE_ENV === 'production' || process.env.GL_DATABASE_CONFIG_FILE)
    throw new Error('Combined startup is for the default local development profile only.');
  if (!fs.existsSync('.local/database.json'))
    throw new Error(
      'Prepare the local databases first; see documentation/operations/admin-local.md.',
    );
  process.env.STAFF_APP_URL ??= 'http://localhost:8081/admin/';
  process.env.ALLOWED_ORIGINS ??= new URL(process.env.STAFF_APP_URL).origin;
  process.env.MEDIA_PUBLIC_ORIGIN ??= 'http://localhost:3003';
  for (const entry of ['database/scripts/db.mjs', 'scripts/setup-auth.mjs', 'scripts/build.mjs']) {
    const result = spawnSync(
      process.execPath,
      [entry, ...(entry.includes('/db.mjs') ? ['start'] : [])],
      {
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0) throw new Error('Local preparation failed: ' + entry);
  }
  if (fs.existsSync('.local/media/local-profile.json')) {
    mediaProfile = JSON.parse(fs.readFileSync('.local/media/local-profile.json', 'utf8'));
    if (mediaProfile.profile !== 'native-local-http')
      throw new Error('Unknown local Media profile.');
    const secrets = JSON.parse(fs.readFileSync('.local/media/secrets.json', 'utf8'));
    process.env.MEDIA_CATALOG_TOKEN ??= secrets.coordination;
    process.env.MEDIA_EVENT_SECRET ??= secrets.mediaEvents;
    process.env.CATALOG_EVENT_SECRET ??= secrets.catalogEvents;
    process.env.MEDIA_EVENT_TRANSPORT = 'local-http';
    for (const key of ['MEDIA_FFMPEG', 'MEDIA_FFPROBE', 'MEDIA_PDFINFO', 'MEDIA_PDFTOPPM'])
      process.env[key] ??= mediaProfile.commands[key];
  } else
    console.warn(
      'Media native profile is not prepared. Run npm run media:tools and npm run media:setup; scanner/worker uploads are unavailable.',
    );
}
const names = ['identity', 'catalog', 'media', 'inquiries', 'gateway'];
const service = process.argv.slice(2).find((argument) => argument !== '--web');
const selected = service ? names.filter((name) => name === service) : names;
if (!selected.length) throw new Error('Unknown service.');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
for (const name of selected) {
  const env = { ...process.env };
  for (const service of names)
    if (service !== name) delete env[service.toUpperCase() + '_DATABASE_URL'];
  for (const caller of ['catalog', 'media', 'inquiries'])
    if (caller !== name) delete env[caller.toUpperCase() + '_IDENTITY_SERVICE_TOKEN'];
  if (name !== 'identity') {
    delete env.IDENTITY_CSRF_SECRET;
    delete env.IDENTITY_SERVICE_CREDENTIALS;
    delete env.SMTP_PASSWORD;
    delete env.SMTP_USER;
  }
  delete env.BOOTSTRAP_PASSWORD;
  if (!['media', 'catalog'].includes(name)) {
    for (const key of [
      'MEDIA_CATALOG_TOKEN',
      'MEDIA_EVENT_SECRET',
      'CATALOG_EVENT_SECRET',
      'MEDIA_BROKER_URL',
      'CATALOG_BROKER_URL',
    ])
      delete env[key];
  }
  const child = spawn(process.execPath, ['services/' + name + '/dist/composition/main.js'], {
    stdio: 'inherit',
    env,
    windowsHide: true,
  });
  watch(child);
}
function watch(child) {
  children.push(child);
  child.on('error', () => stop(1));
  child.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}
if (web) {
  if (mediaProfile) {
    watch(
      spawn(mediaProfile.commands.CLAMD, ['--config-file=' + mediaProfile.clamdConfig], {
        stdio: 'inherit',
        windowsHide: true,
      }),
    );
    for (const [service, entry] of [
      ['media', 'worker'],
      ['media', 'events'],
      ['catalog', 'media-events'],
    ]) {
      const roleEnv = { ...process.env };
      for (const name of names)
        if (name !== service) delete roleEnv[name.toUpperCase() + '_DATABASE_URL'];
      for (const key of Object.keys(roleEnv))
        if (/IDENTITY_|^SMTP_|^BOOTSTRAP_/.test(key)) delete roleEnv[key];
      watch(
        spawn(process.execPath, [`services/${service}/dist/composition/${entry}.js`], {
          stdio: 'inherit',
          env: roleEnv,
          windowsHide: true,
        }),
      );
    }
  }
  const webEnv = { ...process.env };
  for (const key of Object.keys(webEnv))
    if (
      /DATABASE_URL$|_TOKEN$|_SECRET$|BROKER_URL$|^IDENTITY_SERVICE_CREDENTIALS$|^BOOTSTRAP_|^SMTP_/.test(
        key,
      )
    )
      delete webEnv[key];
  watch(
    spawn(
      process.execPath,
      ['../../node_modules/expo/bin/cli', 'start', '--web', '--port', '8081', '--clear'],
      {
        cwd: 'apps/storefront',
        stdio: 'inherit',
        env: webEnv,
        windowsHide: true,
      },
    ),
  );
  console.log('Website: http://localhost:8081 | Staff: http://localhost:8081/admin/login');
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
