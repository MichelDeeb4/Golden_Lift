import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
if (process.env.NODE_ENV === 'production' || process.env.GL_DATABASE_CONFIG_FILE)
  throw new Error('Native local setup is for the normal development profile only.');
const toolFile = path.resolve('.local/tools/commands.json');
if (!fs.existsSync(toolFile)) throw new Error('Run npm run media:tools first.');
const { commands } = JSON.parse(fs.readFileSync(toolFile, 'utf8'));
const directory = path.resolve('.local/media');
fs.mkdirSync(path.join(directory, 'signatures'), { recursive: true });
const database = path.join(directory, 'signatures').replaceAll('\\', '/');
const config = path.join(directory, 'clamd.conf');
fs.writeFileSync(
  config,
  `DatabaseDirectory ${database}\nTCPSocket 3310\nTCPAddr 127.0.0.1\nForeground yes\nStreamMaxLength 262144000\nMaxFileSize 262144000\nMaxScanSize 524288000\nLogTime yes\n`,
);
const freshConfig = path.join(directory, 'freshclam.conf');
fs.writeFileSync(
  freshConfig,
  `DatabaseDirectory ${database}\nDatabaseMirror database.clamav.net\nConnectTimeout 30\nReceiveTimeout 300\n`,
);
const secretsFile = path.join(directory, 'secrets.json');
if (!fs.existsSync(secretsFile)) {
  const secret = () => randomBytes(32).toString('base64url');
  fs.writeFileSync(
    secretsFile,
    JSON.stringify({ coordination: secret(), mediaEvents: secret(), catalogEvents: secret() }) +
      '\n',
    { flag: 'wx', mode: 0o600 },
  );
}
if (process.argv[2] !== '--offline') {
  const result = spawnSync(commands.FRESHCLAM, ['--config-file=' + freshConfig], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error('ClamAV signature update failed; upload intake remains unavailable.');
}
if (!fs.readdirSync(path.join(directory, 'signatures')).some((name) => /\.(cvd|cld)$/.test(name)))
  throw new Error('No ClamAV signature database. Rerun media:setup with network access.');
fs.writeFileSync(
  path.join(directory, 'local-profile.json'),
  JSON.stringify({ profile: 'native-local-http', commands, clamdConfig: config }, null, 2) + '\n',
);
console.log(
  'Native local Media prepared: real ClamAV/Sharp/FFmpeg/Poppler, private files, signed HTTP event relays (development only). npm start launches owned roles.',
);
