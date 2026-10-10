import { spawn } from 'node:child_process';
const app = process.env.TARGET_APP;
if (!['erp-api', 'platform-api', 'worker', 'erp-web', 'platform-admin'].includes(app))
  throw new Error('Invalid target application');
const web = ['erp-web', 'platform-admin'].includes(app);
const child = spawn(
  process.execPath,
  web ? ['packages/tooling/web-start.mjs', app] : ['apps/' + app + '/dist/main.js'],
  { stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
