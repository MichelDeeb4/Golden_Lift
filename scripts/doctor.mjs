// Operator command only; never bundled into the public app or exposed as an HTTP page.
import fs from 'node:fs';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { config, sql } from '../database/scripts/db.mjs';
const results = {
  checkedAt: new Date().toISOString(),
  services: {},
  databases: {},
  tools: {},
  dependencies: {},
};
await Promise.all(
  ['gateway', 'identity', 'catalog', 'media', 'inquiries'].map(async (service) => {
    const port = { gateway: 3000, identity: 3001, catalog: 3002, media: 3003, inquiries: 3004 }[
      service
    ];
    try {
      const response = await fetch(`http://localhost:${port}/health/ready`, {
        signal: AbortSignal.timeout(3000),
      });
      results.services[service] = { port, status: response.status, ready: response.status === 200 };
    } catch {
      results.services[service] = { port, ready: false };
    }
  }),
);
try {
  const cfg = config();
  for (const service of ['identity', 'catalog', 'media', 'inquiries']) {
    try {
      results.databases[service] = { ready: sql(cfg, service, 'SELECT 1') === '1' };
    } catch {
      results.databases[service] = { ready: false };
    }
  }
} catch {
  results.databases.configuration = { ready: false };
}
const commands = fs.existsSync('.local/tools/commands.json')
  ? JSON.parse(fs.readFileSync('.local/tools/commands.json', 'utf8')).commands
  : {};
for (const [name, key, argument] of [
  ['ffmpeg', 'MEDIA_FFMPEG', '-version'],
  ['ffprobe', 'MEDIA_FFPROBE', '-version'],
  ['pdfinfo', 'MEDIA_PDFINFO', '-v'],
  ['pdftoppm', 'MEDIA_PDFTOPPM', '-v'],
]) {
  const output = spawnSync(process.env[key] ?? commands[key] ?? name, [argument], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  results.tools[name] = {
    available: !output.error && output.status === 0,
    version:
      !output.error && output.status === 0
        ? (output.stdout || output.stderr).split(/\r?\n/)[0].slice(0, 250)
        : null,
  };
}
async function probeTcp(host, port, command) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(3000, () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('connect', () => {
      if (command) socket.write(command);
      else finish(true);
    });
    if (command)
      socket.once('data', (body) => {
        const reply = body.toString().replaceAll('\0', '').trim().slice(0, 250);
        finish(
          command === 'zVERSION\0'
            ? /^ClamAV [0-9.]+/.test(reply)
              ? reply
              : null
            : reply.startsWith('PONG'),
        );
      });
  });
}
results.dependencies.scanner = {
  ready: await probeTcp(
    process.env.MEDIA_CLAMAV_HOST ?? '127.0.0.1',
    Number(process.env.MEDIA_CLAMAV_PORT ?? 3310),
    'zPING\0',
  ),
};
const scannerVersion = await probeTcp(
  process.env.MEDIA_CLAMAV_HOST ?? '127.0.0.1',
  Number(process.env.MEDIA_CLAMAV_PORT ?? 3310),
  'zVERSION\0',
);
results.tools.clamd = {
  available: typeof scannerVersion === 'string',
  version: typeof scannerVersion === 'string' ? scannerVersion : null,
};
results.dependencies.rabbitmq = { reachable: await probeTcp('127.0.0.1', 5672) };
results.dependencies.events = {
  profile: fs.existsSync('.local/media/local-profile.json')
    ? 'native-local-http'
    : 'external-rabbitmq',
  catalogLocalListener: await probeTcp('127.0.0.1', 3102),
  mediaLocalListener: await probeTcp('127.0.0.1', 3103),
};
try {
  const response = await fetch('http://localhost:8081', { signal: AbortSignal.timeout(3000) });
  results.services.frontend = { port: 8081, ready: response.status === 200 };
} catch {
  results.services.frontend = { port: 8081, ready: false };
}
console.log(JSON.stringify(results, null, 2));
if (
  Object.values(results.services).some((item) => !item.ready) ||
  Object.values(results.databases).some((item) => !item.ready) ||
  !results.dependencies.scanner.ready ||
  Object.values(results.tools).some((item) => !item.available) ||
  (results.dependencies.events.profile === 'native-local-http'
    ? !results.dependencies.events.catalogLocalListener ||
      !results.dependencies.events.mediaLocalListener
    : !results.dependencies.rabbitmq.reachable)
)
  process.exitCode = 1;
