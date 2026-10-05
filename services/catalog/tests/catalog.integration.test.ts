import type { PrismaClient } from '../src/infrastructure/prisma/client.js';
import { orm } from '../src/infrastructure/prisma/client.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import { databasePool, httpConfig } from '@golden-lift/platform';
import { CreateCategory } from '../src/application/use-cases/create-category.js';
import { EditCategory } from '../src/application/use-cases/edit-category.js';
import { PrismaCatalogUnitOfWork } from '../src/infrastructure/prisma/unit-of-work.js';
import { PrismaCategoryRepository } from '../src/infrastructure/prisma/category-repository.js';
import { catalogApplication } from '../src/composition/application.js';
import { gatewayApplication } from '../../gateway/src/composition/application.js';
interface LocalConfig {
  port: number;
  adminUser: string;
  adminPassword: string;
  services: Record<string, { database: string; owner: string; user: string; password: string }>;
}
interface DatabaseTools {
  config(): LocalConfig;
  sql(cfg: LocalConfig, service: string | null, query: string, runtime?: boolean): string;
  file(
    cfg: LocalConfig,
    service: string,
    name: string,
    options: { owner: boolean; atomic: boolean },
  ): string;
  grantRuntime(cfg: LocalConfig, service: string): void;
}
const tools = (await import(
  pathToFileURL(path.join(process.cwd(), 'database/scripts/db.mjs')).href
)) as DatabaseTools;
const original = tools.config(),
  scratch = structuredClone(original),
  service = scratch.services['catalog'];
if (!service) throw new Error('Missing Catalog config.');
const database = 'golden_lift_b12_test_' + randomUUID().replaceAll('-', '');
if (!/^golden_lift_b12_test_[0-9a-f]{32}$/.test(database))
  throw new Error('Unsafe test database identifier.');
service.database = database;
const connectionString =
  'postgresql://' +
  service.user +
  ':' +
  encodeURIComponent(service.password) +
  '@127.0.0.1:' +
  scratch.port +
  '/' +
  database;
let pool: pg.Pool,
  databaseClient: PrismaClient,
  created = false;
const actor = { id: uuid(randomUUID()), role: 'ADMIN' as const, authVersion: version('1') };
const ids = { newUuid: () => uuid(randomUUID()) },
  clock = { now: () => new Date().toISOString() };
const translation = {
  locale: 'ar' as const,
  name: 'Synthetic integration category',
  description: 'Fallback description',
  slug: null,
};
const draft = { parentId: null, expectedParentVersion: null, translations: [translation] };
const isCode = (code: string) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;
before(async () => {
  tools.sql(
    original,
    null,
    'CREATE DATABASE ' +
      database +
      ' OWNER ' +
      service.owner +
      " TEMPLATE template0 ENCODING 'UTF8'",
  );
  created = true;
  tools.file(scratch, 'catalog', 'sql/20_catalog_media_legacy_fresh.sql', {
    owner: true,
    atomic: true,
  });
  tools.grantRuntime(scratch, 'catalog');
  pool = await databasePool({ service: 'catalog', connectionString, max: 5 });
  databaseClient = orm(pool);
});
after(async () => {
  if (databaseClient) await databaseClient.$disconnect();
  if (pool) await pool.end();
  if (created) tools.sql(original, null, 'DROP DATABASE ' + database + ' WITH (FORCE)');
});
function create() {
  return new CreateCategory(new PrismaCatalogUnitOfWork(databaseClient), ids, clock);
}
function edit() {
  return new EditCategory(new PrismaCatalogUnitOfWork(databaseClient), ids, clock);
}
test('real transaction commits category and versioned outbox event together', async () => {
  const category = await create().execute(draft, actor);
  const event = await pool.query<{ payload: { aggregate: { version: string } } }>(
    'SELECT payload FROM ops.outbox_events WHERE aggregate_id=$1',
    [category.id],
  );
  assert.equal(category.version, '1');
  assert.equal(event.rowCount, 1);
  assert.equal(event.rows[0]?.payload.aggregate.version, '1');
});
test('application failure rolls back category, translations and outbox', async () => {
  const id = ids.newUuid();
  await assert.rejects(
    new PrismaCatalogUnitOfWork(databaseClient).execute(async ({ categories, outbox }) => {
      await categories.insert(id, null);
      await categories.putTranslations(id, [translation]);
      await outbox.append({
        id: ids.newUuid(),
        type: 'catalog.category.created.v1',
        schemaVersion: 1,
        producer: 'catalog',
        occurredAt: clock.now(),
        correlationId: ids.newUuid(),
        aggregate: { type: 'Category', key: id, version: version('1') },
        data: { categoryId: id },
      });
      throw new ApplicationError('INVALID_STATE', 'Synthetic rollback.');
    }),
    isCode('INVALID_STATE'),
  );
  assert.equal(
    (await pool.query('SELECT 1 FROM catalog.categories WHERE id=$1', [id])).rowCount,
    0,
  );
  assert.equal(
    (await pool.query('SELECT 1 FROM ops.outbox_events WHERE aggregate_id=$1', [id])).rowCount,
    0,
  );
});
test('deferred Arabic-name failure is caught at COMMIT and rolls back', async () => {
  const id = ids.newUuid();
  await assert.rejects(
    new PrismaCatalogUnitOfWork(databaseClient).execute(async ({ categories }) => {
      await categories.insert(id, null);
    }),
    isCode('INVALID_STATE'),
  );
  assert.equal(
    (await pool.query('SELECT 1 FROM catalog.categories WHERE id=$1', [id])).rowCount,
    0,
  );
});
test('stale version cannot overwrite translations or append another edit event', async () => {
  const category = await create().execute(draft, actor);
  const updated = await edit().execute(
    category.id,
    category.version,
    [{ ...translation, name: 'First edit' }],
    actor,
  );
  assert.equal(updated.version, '2');
  await assert.rejects(
    edit().execute(category.id, category.version, [{ ...translation, name: 'Stale edit' }], actor),
    isCode('VERSION_CONFLICT'),
  );
  assert.equal(
    (await new PrismaCategoryRepository(databaseClient).find(category.id, 'ar'))?.name,
    'First edit',
  );
  assert.equal(
    (await pool.query('SELECT 1 FROM ops.outbox_events WHERE aggregate_id=$1', [category.id]))
      .rowCount,
    2,
  );
});
test('child creation advances/checks the parent version and locale fallback is field-specific', async () => {
  const parent = await create().execute(draft, actor);
  const child = await create().execute(
    {
      parentId: parent.id,
      expectedParentVersion: parent.version,
      translations: [
        translation,
        { ...translation, locale: 'en', name: 'English child', description: null },
      ],
    },
    actor,
  );
  const repository = new PrismaCategoryRepository(databaseClient);
  assert.equal((await repository.find(parent.id, 'ar'))?.version, '2');
  const en = await repository.find(child.id, 'en'),
    sorani = await repository.find(child.id, 'ckb');
  assert.equal(en?.name, 'English child');
  assert.equal(en?.description, 'Fallback description');
  assert.equal(sorani?.resolvedNameLocale, 'ar');
  await assert.rejects(
    create().execute(
      { parentId: parent.id, expectedParentVersion: parent.version, translations: [translation] },
      actor,
    ),
    isCode('VERSION_CONFLICT'),
  );
});
test('two real connections retry serialization then reject the stale expected version', async () => {
  const category = await create().execute(draft, actor);
  let releaseWriter: () => void = () => {},
    snapshotReady: () => void = () => {};
  const writerDone = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    }),
    snapshot = new Promise<void>((resolve) => {
      snapshotReady = resolve;
    });
  let attempts = 0;
  const pending = new PrismaCatalogUnitOfWork(databaseClient).execute(async ({ categories }) => {
    attempts++;
    await categories.find(category.id, 'ar');
    if (attempts === 1) {
      snapshotReady();
      await writerDone;
    }
    await categories.touch(category.id, category.version);
  });
  const outcome = assert.rejects(pending, isCode('VERSION_CONFLICT'));
  await snapshot;
  try {
    await edit().execute(
      category.id,
      category.version,
      [{ ...translation, name: 'Concurrent winner' }],
      actor,
    );
  } finally {
    releaseWriter();
  }
  await outcome;
  assert.equal(attempts, 2);
  assert.equal(
    (await new PrismaCategoryRepository(databaseClient).find(category.id, 'ar'))?.name,
    'Concurrent winner',
  );
});
test('retry budget is finite and deadlock signals restart the whole callback', async () => {
  // The preceding contention test generates a real 40001; injected states establish the retry policy limits.
  let attempts = 0;
  await assert.rejects(
    new PrismaCatalogUnitOfWork(databaseClient).execute(async () => {
      attempts++;
      throw Object.assign(new Error('Synthetic serialization signal'), { code: '40001' });
    }),
    isCode('DEPENDENCY_UNAVAILABLE'),
  );
  assert.equal(attempts, 3);
  let deadlockAttempts = 0;
  const result = await new PrismaCatalogUnitOfWork(databaseClient).execute(
    async ({ categories }) => {
      deadlockAttempts++;
      if (deadlockAttempts === 1)
        throw Object.assign(new Error('Synthetic deadlock signal'), { code: '40P01' });
      return categories.list({ parentId: null, locale: 'ar', limit: 1, after: null });
    },
  );
  assert.equal(deadlockAttempts, 2);
  assert.equal(result.length, 1);
  assert.equal(pool.idleCount, pool.totalCount);
});

test('Super Admin content writes are rejected before data changes', async () => {
  const before = await pool.query<{ count: string }>(
    'SELECT count(*)::text FROM catalog.categories',
  );
  await assert.rejects(
    create().execute(draft, { ...actor, role: 'SUPER_ADMIN' }),
    isCode('FORBIDDEN'),
  );
  assert.equal(
    (await pool.query<{ count: string }>('SELECT count(*)::text FROM catalog.categories')).rows[0]
      ?.count,
    before.rows[0]?.count,
  );
});
test('public HTTP/gateway contracts cover pagination, fallback, redaction, deletion and safe failures', async () => {
  const apiPool = await databasePool({ service: 'catalog', connectionString, max: 2 });
  const catalog = await catalogApplication(httpConfig('catalog', {}), apiPool);
  await catalog.listen(0, '127.0.0.1');
  const origin = await catalog.getUrl();
  const gateway = await gatewayApplication(httpConfig('gateway', {}), {
    catalog: origin,
    identity: origin,
    media: origin,
    inquiries: origin,
  });
  await gateway.listen(0, '127.0.0.1');
  const url = await gateway.getUrl();
  try {
    const first = await fetch(url + '/api/v1/categories?locale=ckb&limit=1', {
      headers: { 'x-request-id': 'integration-request' },
    });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-request-id'), 'integration-request');
    const page = (await first.json()) as {
      items: { id: string; name: string; version: string; resolvedNameLocale: string }[];
      nextCursor: string | null;
    };
    assert.equal(page.items.length, 1);
    assert.ok(page.nextCursor);
    assert.equal(page.items[0]?.resolvedNameLocale, 'ar');
    const next = await fetch(
      url + '/api/v1/categories?locale=ckb&limit=1&cursor=' + page.nextCursor,
    );
    const second = (await next.json()) as { items: { id: string }[] };
    assert.notEqual(second.items[0]?.id, page.items[0]?.id);
    assert.equal(
      (await fetch(url + '/api/v1/categories?locale=en&cursor=' + page.nextCursor)).status,
      400,
    );
    for (const query of [
      'limit=1000',
      'locale=ku',
      'sort=storage_key',
      'parentId=invalid',
      'cursor=invalid',
    ])
      assert.equal((await fetch(url + '/api/v1/categories?' + query)).status, 400);
    assert.equal(
      (
        await fetch(url + '/api/v1/categories', {
          method: 'POST',
          headers: { 'x-user-role': 'ADMIN', 'x-user-id': actor.id },
        })
      ).status,
      404,
    );
    assert.equal((await fetch(url + '/internal/identity')).status, 404);
    assert.equal(
      (
        await fetch(url + '/api/v1/categories', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{invalid',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url + '/api/v1/categories', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ padding: 'x'.repeat(70000) }),
        })
      ).status,
      413,
    );
    const body = JSON.stringify(page);
    for (const key of ['storage_key', 'password', 'source_observations', 'sales_email'])
      assert.ok(!body.includes(key));
    assert.equal((await fetch(url + '/health/ready')).status, 200);
    const spec = (await (await fetch(url + '/api/v1/openapi.json')).json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    assert.equal(spec.openapi, '3.1.0');
    const document = await import('node:fs/promises');
    assert.deepEqual(
      spec,
      JSON.parse(
        await document.readFile(path.join(process.cwd(), 'documentation/api/openapi.json'), 'utf8'),
      ) as unknown,
    );
    assert.ok(spec.paths['/api/v1/categories']);
    const target = await create().execute(draft, actor),
      client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await client.query('SELECT catalog.soft_delete_branch($1,$2::bigint)', [
        target.id,
        target.version,
      ]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const deleted = await fetch(url + '/api/v1/categories/' + target.id);
    assert.equal(deleted.status, 404);
    assert.equal(
      (
        await pool.query(
          'SELECT 1 FROM catalog.categories WHERE id=$1 AND deleted_at IS NOT NULL',
          [target.id],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await fetch(url + '/api/v1/categories', {
          headers: { Origin: 'https://unapproved.example' },
        })
      ).status,
      403,
    );
    const unknown = await fetch(url + '/api/v1/categories/not-a-uuid');
    const error = (await unknown.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    assert.equal(unknown.status, 400);
    assert.equal(error.error.code, 'VALIDATION_FAILED');
    assert.ok(error.error.requestId);
    assert.ok(!JSON.stringify(error).includes('SELECT'));
    await catalog.close();
    assert.equal((await fetch(url + '/health/ready')).status, 503);
  } finally {
    await gateway.close();
    if (!apiPool.ended) await catalog.close();
  }
});
