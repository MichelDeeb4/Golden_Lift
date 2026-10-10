import { spawn } from 'node:child_process';
const services = [
  ['erp-api', 4100],
  ['platform-api', 4101],
  ['worker', 4102],
];
const children = services.map(([service, port]) =>
  spawn(process.execPath, ['apps/' + service + '/dist/main.js'], {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, PORT: String(port) },
  }),
);
for (const [service, port] of [
  ['erp-web', 4200],
  ['platform-admin', 4201],
])
  children.push(
    spawn(
      process.execPath,
      ['apps/' + service + '/.next/standalone/apps/' + service + '/server.js'],
      {
        stdio: 'inherit',
        windowsHide: true,
        env: {
          ...process.env,
          PORT: String(port),
          HOSTNAME: process.env.HOST ?? '127.0.0.1',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
    ),
  );
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  if (process.connected) process.disconnect();
}
for (const child of children)
  child.on('exit', (code) => {
    if (!closing) {
      process.exitCode = code || 1;
      close();
    }
  });
process.once('SIGINT', close);
process.once('SIGTERM', close);

process.on('message', (message) => {
  if (message === 'shutdown') close();
});
for (const child of children)
  child.on('error', () => {
    process.exitCode = 1;
    close();
  });
