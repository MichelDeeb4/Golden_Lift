import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const generated = spawnSync(process.execPath, ['scripts/prisma.mjs', 'generate'], {
  stdio: 'inherit',
  windowsHide: true,
});
if (generated.status !== 0) process.exit(generated.status || 1);
const projects = [
  'packages/contracts',
  'packages/platform',
  'services/identity',
  'services/catalog',
  'services/media',
  'services/inquiries',
  'services/gateway',
];
for (const project of projects) {
  const workspace = path.resolve(process.cwd()),
    output = path.resolve(project, 'dist');
  if (!output.startsWith(workspace + path.sep) || path.basename(output) !== 'dist')
    throw new Error('Unsafe build output path.');
  fs.rmSync(output, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', project + '/tsconfig.json'],
    { stdio: 'inherit', windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status || 1);
  console.log('Built ' + project);
}
