import { spawn } from 'node:child_process';
const names = ['identity', 'catalog', 'media', 'inquiries', 'gateway'];
const selected = process.argv[2] ? names.filter((name) => name === process.argv[2]) : names;
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
  const child = spawn(process.execPath, ['services/' + name + '/dist/composition/main.js'], {
    stdio: 'inherit',
    env,
    windowsHide: true,
  });
  children.push(child);
  child.on('error', () => stop(1));
  child.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
