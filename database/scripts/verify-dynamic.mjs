import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, sql, file, grantRuntime } from './db.mjs';
import { verifyFresh } from './verify.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const original = config(),
  reference = structuredClone(original),
  name = 'business_platform_test_dynamic_' + crypto.randomBytes(8).toString('hex');
reference.services.catalog.database = name;
const reportPath = path.resolve(
  process.argv[2] ?? path.join(root, '.local/dynamic-database-validation.json'),
);
assert(
  reportPath.startsWith(root + path.sep) && reportPath.endsWith('.json'),
  'report stays within this workspace',
);
sql(
  original,
  null,
  `CREATE DATABASE ${name} OWNER ${reference.services.catalog.owner} TEMPLATE template0 ENCODING 'UTF8'`,
);
try {
  const mediaCore=sql(original,'catalog',"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='catalog' AND column_name='security_blocked')")==='t';
  file(reference, 'catalog', 'sql/'+(mediaCore?'19_catalog_media_core_fresh.sql':'15_catalog_dynamic.sql'), { owner: true, atomic: true });
  grantRuntime(reference, 'catalog');
  await verifyFresh(reference, { reportPath, catalogProfile: 'v1.2' });
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.installedSchemaParity =
    'disposable final Catalog versus fresh/upgrade; other installed schemas read-only';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
} finally {
  assert(/^business_platform_test_dynamic_[0-9a-f]{16}$/.test(name));
  sql(original, null, 'DROP DATABASE ' + name + ' WITH (FORCE)');
}
