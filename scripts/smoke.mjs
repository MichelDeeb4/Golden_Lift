import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
const names = ['identity', 'catalog', 'media', 'inquiries', 'gateway'];
const children = [],
  ports = {};
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No port.'));
      server.close(() => resolve(address.port));
    });
  });
}
for (const name of names) ports[name] = await freePort();
async function waitReady(name) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + ports[name] + '/health/ready', {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const data = await response.json();
        assert.equal(data.service, name);
        return;
      }
    } catch {}
    if (
      children.some(
        (item) =>
          item.name === name && (item.child.exitCode !== null || item.child.signalCode !== null),
      )
    )
      throw new Error(name + ' exited before readiness.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(name + ' did not become ready.');
}
try {
  for (const name of names) {
    const env = { ...process.env, PORT: String(ports[name]) };
    for (const other of names) {
      delete env[other.toUpperCase() + '_PORT'];
      if (name !== other) delete env[other.toUpperCase() + '_DATABASE_URL'];
    }
    for (const caller of ['catalog', 'media', 'inquiries'])
      if (caller !== name) delete env[caller.toUpperCase() + '_IDENTITY_SERVICE_TOKEN'];
    if (name !== 'identity') {
      delete env.IDENTITY_CSRF_SECRET;
      delete env.IDENTITY_SERVICE_CREDENTIALS;
      delete env.SMTP_PASSWORD;
      delete env.SMTP_USER;
    }
    delete env.BOOTSTRAP_PASSWORD;
    env.IDENTITY_SERVICE_URL = 'http://127.0.0.1:' + ports.identity;
    if (name === 'gateway')
      for (const upstream of names.filter((item) => item !== 'gateway'))
        env[upstream.toUpperCase() + '_SERVICE_URL'] = 'http://127.0.0.1:' + ports[upstream];
    const child = spawn(
      process.execPath,
      [path.resolve('services', name, 'dist/composition/main.js')],
      {
        env,
        cwd: path.resolve('services', name),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const done = new Promise((resolve) => {
      child.once('exit', resolve);
      child.once('error', resolve);
    });
    children.push({ name, child, done });
    await waitReady(name);
    assert.ok(output.includes('service.started'));
    console.log('PASS independent process: ' + name);
  }
  const gateway = 'http://127.0.0.1:' + ports.gateway;
  const response = await fetch(gateway + '/api/v1/categories?locale=ar');
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.ok(page.items.length > 0);
  assert.equal(typeof page.items[0].version, 'string');
  const spec = await (await fetch(gateway + '/api/v1/openapi.json')).json();
  assert.equal(spec.openapi, '3.1.0');
  assert.equal((await fetch(gateway + '/internal/identity')).status, 404);
  children.find((item) => item.name === 'identity').child.kill();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await fetch(gateway + '/health/ready')).status, 503);
  assert.equal((await fetch(gateway + '/api/v1/categories')).status, 200);
  console.log('PASS gateway routing, OpenAPI and readiness/dependency isolation');
  fs.mkdirSync('.local', { recursive: true });
  fs.writeFileSync(
    '.local/backend-smoke.json',
    JSON.stringify(
      {
        services: names,
        result: 'passed',
        publicCategoryRead: true,
        identityOutagePublicRead: true,
        internalRoutesBlocked: true,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  for (const { child } of children)
    if (child.exitCode === null && child.signalCode === null) child.kill();
  await Promise.all(children.map(({ done }) => done));
}
