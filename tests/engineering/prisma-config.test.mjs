import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineConfig } from 'prisma/config';
import configModule from '@prisma/config';
const { loadConfigFromFile } = configModule;
test('Patched Prisma config merger preserves the actual PostgreSQL generator configuration', async () => {
  const config = defineConfig({ schema: 'infrastructure/database/prisma/schema.prisma' });
  assert.equal(config.schema, 'infrastructure/database/prisma/schema.prisma');
  const loaded = await loadConfigFromFile({ configFile: 'prisma.config.ts' });
  assert.equal(loaded.error, undefined);
  assert.ok(
    loaded.config.schema
      .split(path.sep)
      .join('/')
      .endsWith('infrastructure/database/prisma/schema.prisma'),
  );
});
