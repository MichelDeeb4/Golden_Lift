import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const mode = process.argv[2] || 'unit';
if (!['unit', 'integration'].includes(mode)) throw new Error('Choose unit or integration.');
const workspace = path.resolve(process.cwd()),
  output = path.resolve('.local/test-build');
if (!output.startsWith(workspace + path.sep + '.local' + path.sep))
  throw new Error('Unsafe test output path.');
fs.rmSync(output, { recursive: true, force: true });
let result = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.tests.json'],
  { stdio: 'inherit', windowsHide: true },
);
if (result.status !== 0) process.exit(result.status || 1);
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)],
    );
}
const tests = walk('.local/test-build').filter((file) => file.endsWith('.' + mode + '.test.js'));
if (!tests.length) throw new Error('No ' + mode + ' tests found.');
result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
  stdio: 'inherit',
  windowsHide: true,
});
if (result.status === 0)
  fs.writeFileSync(
    '.local/backend-test-' + mode + '.json',
    JSON.stringify(
      { mode, files: tests.length, result: 'passed', checkedAt: new Date().toISOString() },
      null,
      2,
    ) + '\n',
  );
process.exit(result.status || 0);
