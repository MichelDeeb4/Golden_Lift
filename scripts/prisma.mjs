import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] ?? 'generate';
if (!['generate', 'validate', 'format', 'pull'].includes(command))
  throw new Error('Use prisma.mjs generate, validate, format or pull.');
const services = ['identity', 'catalog', 'media', 'inquiries'];
for (const service of services) {
  const env = { ...process.env };
  for (const other of services)
    if (other !== service) delete env[other.toUpperCase() + '_DATABASE_URL'];
  if (command === 'pull' && !env[service.toUpperCase() + '_DATABASE_URL']) {
    const { config } = await import('../database/scripts/db.mjs');
    const cfg = config(),
      entry = cfg.services[service];
    env[service.toUpperCase() + '_DATABASE_URL'] =
      'postgresql://' +
      entry.user +
      ':' +
      encodeURIComponent(entry.password) +
      '@127.0.0.1:' +
      cfg.port +
      '/' +
      entry.database;
  }
  const args = [
    path.join(root, 'node_modules/prisma/build/index.js'),
    ...(command === 'pull' ? ['db', 'pull', '--print'] : [command]),
    '--config',
    'services/' + service + '/prisma.config.ts',
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    // Never include a connection URL or query parameters in an operator failure.
    const detail = (result.stderr || result.stdout || result.error?.message || '').replace(
      /postgres(?:ql)?:\/\/[^\s"']+/g,
      '[database URL redacted]',
    );
    throw new Error('Prisma ' + command + ' failed for ' + service + ': ' + detail);
  }
  if (command === 'pull') {
    // Introspection is evidence for review, never an automatic rewrite of approved bindings.
    const destination = path.join(root, '.local/prisma-introspection');
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, service + '.prisma'), result.stdout);
    console.log('Review introspection: .local/prisma-introspection/' + service + '.prisma');
  }
  console.log('Prisma ' + command + ' passed: ' + service);
}
