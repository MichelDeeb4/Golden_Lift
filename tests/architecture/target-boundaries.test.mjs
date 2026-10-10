import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectBoundaries, targetSources } from '../../packages/tooling/boundaries.mjs';
test('Actual target dependency graph excludes legacy implementations', () => {
  const { sources, packages } = targetSources();
  assert.deepEqual(inspectBoundaries(sources, packages), []);
});
const cases = [
  [
    'domain framework',
    'modules/accounting/domain/value.ts',
    "import {Module} from '@nestjs/common';",
    {},
  ],
  ['application ORM', 'modules/accounting/application/post.ts', "import pg from 'pg';", {}],
  [
    'inline private import',
    'modules/accounting/domain/value.ts',
    "type X=import('../../inventory/infrastructure/repository.js').X;",
    { 'modules/inventory/infrastructure/repository.ts': 'export type X=string;' },
  ],
  [
    'domain reversed layer',
    'modules/accounting/domain/value.ts',
    "import {x} from '../application/post.js';",
    { 'modules/accounting/application/post.ts': 'export const x=1;' },
  ],
  [
    'cross-owner relative',
    'modules/accounting/application/post.ts',
    "import {x} from '../../inventory/domain/x.js';",
    { 'modules/inventory/domain/x.ts': 'export const x=1;' },
  ],
  [
    're-export escape',
    'packages/contracts/src/foundation.ts',
    "export * from '../../../services/catalog/src/domain/category.js';",
    {},
  ],
  ['legacy alias', 'apps/erp-api/src/main.ts', "import {x} from '@business-platform/catalog';", {}],
  ['dynamic import', 'modules/accounting/domain/value.ts', "const x=import('pg');", {}],
  ['require escape', 'modules/accounting/domain/value.ts', "const x=require('pg');", {}],
  ['explicit any', 'modules/accounting/domain/value.ts', 'const x:any=1;', {}],
  [
    'cycle',
    'modules/accounting/domain/a.ts',
    "import './b.js';",
    { 'modules/accounting/domain/b.ts': "import './a.js';" },
  ],
];
for (const [name, file, body, more] of cases)
  test('Reject ' + name, () =>
    assert.ok(inspectBoundaries(new Map([[file, body], ...Object.entries(more)])).length > 0),
  );
test('Alias resolution cannot hide an infrastructure dependency', () =>
  assert.ok(
    inspectBoundaries(
      new Map([
        ['modules/accounting/domain/value.ts', "import {x} from '@alias/db';"],
        ['modules/accounting/infrastructure/db.ts', 'export const x=1;'],
      ]),
      {},
      { '@alias/db': 'modules/accounting/infrastructure/db.ts' },
    ).length > 0,
  ));
test('Domain may use its own domain value', () =>
  assert.deepEqual(
    inspectBoundaries(
      new Map([
        ['modules/accounting/domain/a.ts', "import './b.js';"],
        ['modules/accounting/domain/b.ts', 'export const x=1;'],
      ]),
    ),
    [],
  ));

test('A dependency named contracts does not exempt a framework from domain rules', () => {
  const result = inspectBoundaries(
    new Map([['modules/sales/domain/test.ts', "import {X} from '@framework/contracts';"]]),
  );
  assert.ok(result.some((error) => error.includes('external dependency')));
});
