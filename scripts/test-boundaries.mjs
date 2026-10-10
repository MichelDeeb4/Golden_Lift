import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const prefix = '.lint-probe-' + randomUUID();
let count = 0;
function probe(files, expected, location = 'services/catalog/src/domain') {
  const base = path.resolve(location),
    created = [];
  try {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(base, prefix + name + '.ts');
      assert.ok(file.startsWith(base + path.sep));
      fs.writeFileSync(file, content, { flag: 'wx' });
      created.push(file);
    }
    const result = spawnSync(process.execPath, ['scripts/check-boundaries.mjs'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (expected === null) assert.equal(result.status, 0, result.stderr);
    else {
      assert.notEqual(result.status, 0, 'Architecture lint accepted a forbidden dependency.');
      assert.ok(result.stderr.includes(expected), result.stderr);
    }
    count++;
  } finally {
    for (const file of created) fs.unlinkSync(file);
  }
}
probe(
  { '-nest': "import { Controller } from '@nestjs/common'; export const forbidden=Controller;" },
  'business layer cannot import',
);
probe(
  {
    '-service':
      "export { CheckReadiness } from '../../../identity/src/application/use-cases/check-readiness.js';",
  },
  'crosses service ownership',
);
probe(
  {
    '-a': "export { b } from './" + prefix + "-b.js'; export const a=1;",
    '-b': "export { a } from './" + prefix + "-a.js'; export const b=1;",
  },
  'Circular import',
);
probe(
  {
    '-inline-type':
      "export type Forbidden=import('../infrastructure/prisma/category-repository.js').PrismaCategoryRepository;",
  },
  'domain cannot import infrastructure',
);
probe(
  { '-external-type': "export type Forbidden=import('pg').Pool;" },
  'business layer cannot import pg',
);
probe(
  { '-equals': "import forbidden=require('pg');export {forbidden};" },
  'use static ESM imports',
);
probe(
  { '-contract-escape': "export { ConfigurationError } from '../../platform/src/config.js';" },
  'contracts must stay dependency-free',
  'packages/contracts/src',
);
probe(
  {
    '-package-internals':
      "export type Forbidden=import('@business-platform/platform/src/config').HttpConfig;",
  },
  'declared public exports',
  'services/catalog/src/infrastructure/prisma',
);
probe(
  { '-orm-type': "export type Forbidden=import('@prisma/client').PrismaClient;" },
  'business layer cannot import @prisma/client',
);
probe(
  {
    '-generated-orm-type':
      "export type Forbidden=import('../infrastructure/prisma/generated/client.js').PrismaClient;",
  },
  'domain cannot import infrastructure',
);
probe(
  { '-contract-type': "export type Allowed=import('@business-platform/contracts').Uuid;" },
  null,
);
probe(
  { '-frontend-backend': "export { ConfigurationError } from '@business-platform/platform';" },
  'frontend cannot import backend platform adapters',
  'apps/storefront/features',
);
probe(
  {
    '-frontend-service':
      "export { mediaConfig } from '../../../services/media/src/infrastructure/config.js';",
  },
  'frontend cannot import a service implementation',
  'apps/storefront/features',
);
probe(
  { '-backend-ui': "export { BPButton } from '@business-platform/ui';" },
  'backend cannot import frontend packages',
  'services/catalog/src/presentation',
);
console.log(
  'Architecture enforcement probes passed: ' +
    count +
    ' checks including inline types, package ownership and allowed contracts.',
);
