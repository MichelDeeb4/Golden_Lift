import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
export const buildOrder = [
  'packages/shared-kernel',
  'packages/contracts',
  'packages/ui',
  'infrastructure/database',
  'infrastructure/security',
  'infrastructure/observability',
  'infrastructure/deployment',
  'apps/erp-api',
  'apps/platform-api',
  'apps/worker',
];
const web = ['apps/erp-web', 'apps/platform-admin'];
export const formatFiles = [
  'package.json',
  'package-lock.json',
  'prisma.config.ts',
  'tsconfig.target.json',
  'packages/*/tsconfig.target.json',
  'packages/shared-kernel/**/*.{ts,json}',
  'packages/contracts/package.json',
  'packages/contracts/src/foundation.ts',
  'packages/ui/package.json',
  'packages/ui/src/foundation.{tsx,css}',
  'packages/tooling/*.{mjs,json}',
  'infrastructure/{security,observability,deployment}/**/*.{ts,mjs,json,yml}',
  'infrastructure/database/**/*.{ts,mjs,md,json}',
  '!infrastructure/database/.generated/**',
  'docs/implementation/phases/phase-03*.{md,json}',
  'docs/specifications/phase-03*.{md,json}',
  'docs/operations/phase-02-development.md',
  'docs/specifications/openapi/*.json',
  'apps/{erp-api,platform-api,worker}/**/*.{ts,json}',
  'apps/{erp-web,platform-admin}/{app/**/*.{ts,tsx},package.json,tsconfig.json,next.config.mjs}',
  'tests/{engineering,end-to-end,database-migrations}/**/*.mjs',
  'tests/architecture/{phase-01*,verify-phase-01*,target*}.mjs',
  '.github/workflows/backend.yml',
  'docs/implementation/phases/phase-02*.{md,json}',
  'docs/specifications/phase-02*.{md,json}',
  '!**/dist/**',
  '!**/node_modules/**',
];
const node = (args, cwd = process.cwd()) =>
  execFileSync(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
const action = process.argv[2];
if (action === 'build' || action === 'typecheck') {
  node([
    'node_modules/prisma/build/index.js',
    'generate',
    '--schema',
    'infrastructure/database/prisma/schema.prisma',
  ]);
  for (const dir of buildOrder)
    node([
      'node_modules/typescript/bin/tsc',
      '-p',
      dir + '/tsconfig.target.json',
      ...(action === 'typecheck' ? ['--noEmit'] : []),
    ]);
  for (const dir of web) {
    if (action === 'build') {
      node(['../../node_modules/next/dist/bin/next', 'build', '--webpack'], dir);
      const standalone = dir + '/.next/standalone/' + dir;
      fs.cpSync(dir + '/.next/static', standalone + '/.next/static', { recursive: true });
      if (fs.existsSync(dir + '/public'))
        fs.cpSync(dir + '/public', standalone + '/public', { recursive: true });
    } else node(['node_modules/typescript/bin/tsc', '-p', dir + '/tsconfig.json', '--noEmit']);
  }
} else if (['lint', 'format'].includes(action)) {
  node([
    'node_modules/prettier/bin/prettier.cjs',
    action === 'format' ? '--write' : '--check',
    ...formatFiles,
  ]);
  if (action === 'lint') node(['packages/tooling/boundaries.mjs']);
} else {
  console.error('Choose build, typecheck, lint or format');
  process.exit(1);
}
