import { spawn } from 'node:child_process';
import { runtimeConfig } from '@business-platform/security';
const app = process.argv[2];
if (!['erp-web', 'platform-admin'].includes(app)) throw new Error('Invalid web application');
const config = runtimeConfig(
  { ...process.env, PORT: process.argv[3] ?? process.env.PORT },
  app === 'erp-web' ? 4200 : 4201,
);
const child = spawn(
  process.execPath,
  ['apps/' + app + '/.next/standalone/apps/' + app + '/server.js'],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(config.port),
      HOSTNAME: config.host,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
