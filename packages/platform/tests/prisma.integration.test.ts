import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { uuid } from '@business-platform/contracts';
import { sqlState } from '../src/transactions.js';
import { databaseFixture } from './support/database-fixture.js';
import { orm as identityOrm } from '../../../services/identity/src/infrastructure/prisma/client.js';
import { orm as catalogOrm } from '../../../services/catalog/src/infrastructure/prisma/client.js';
import { orm as mediaOrm } from '../../../services/media/src/infrastructure/prisma/client.js';
import { orm as inquiryOrm } from '../../../services/inquiries/src/infrastructure/prisma/client.js';
import { PrismaIdentityRepository } from '../../../services/identity/src/infrastructure/prisma/repository.js';
import { PrismaCatalogUnitOfWork } from '../../../services/catalog/src/infrastructure/prisma/unit-of-work.js';
const fixtures: Awaited<ReturnType<typeof databaseFixture>>[] = [];
const clients: { $disconnect(): Promise<void> }[] = [];
let identity: ReturnType<typeof identityOrm>,
  catalog: ReturnType<typeof catalogOrm>,
  media: ReturnType<typeof mediaOrm>,
  inquiries: ReturnType<typeof inquiryOrm>;
before(async () => {
  const a = await databaseFixture('identity');
  fixtures.push(a);
  identity = identityOrm(a.pool);
  clients.push(identity);
  const b = await databaseFixture('catalog');
  fixtures.push(b);
  catalog = catalogOrm(b.pool);
  clients.push(catalog);
  const c = await databaseFixture('media');
  fixtures.push(c);
  media = mediaOrm(c.pool);
  clients.push(media);
  const d = await databaseFixture('inquiries');
  fixtures.push(d);
  inquiries = inquiryOrm(d.pool);
  clients.push(inquiries);
});
after(async () => {
  const outcomes = await Promise.allSettled(clients.map((client) => client.$disconnect()));
  const cleanup = await Promise.allSettled(fixtures.map((fixture) => fixture.dispose()));
  for (const outcome of [...outcomes, ...cleanup])
    if (outcome.status === 'rejected') throw outcome.reason;
});
test('Prisma keeps bigint versions, generated email keys and binary session hashes exact', async () => {
  const high = 9007199254740993n;
  const account = await identity.staffAccounts.create({
    data: {
      email: '  ORM-Identity@example.test  ',
      display_name: 'Synthetic ORM',
      role: 'ADMIN',
      auth_version: high,
      version: high,
    },
  });
  assert.equal(account.email_key, 'orm-identity@example.test');
  assert.equal(account.version, high);
  const updated = await identity.staffAccounts.update({
    where: { id: account.id },
    data: { display_name: 'Synthetic updated ORM' },
  });
  assert.equal(updated.version, high + 1n);
  assert.equal(updated.auth_version, high);
  const digest = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));
  const session = await identity.staffSessions.create({
    data: {
      staff_id: account.id,
      token_hash: digest,
      auth_version: high,
      expires_at: new Date('2099-01-01T00:00:00Z'),
    },
  });
  assert.deepEqual(session.token_hash, digest);
  assert.equal(session.auth_version, high);
  const domain = await new PrismaIdentityRepository(identity).findAccount(uuid(account.id));
  assert.equal(domain?.version, (high + 1n).toString());
});
test('Identity pagination preserves microseconds lost by native Prisma Date values', async () => {
  const a = randomUUID(),
    b = randomUUID(),
    fixture = fixtures[0];
  if (!fixture) throw new Error('Missing fixture');
  await fixture.pool.query(
    "INSERT INTO identity.staff_accounts(id,email,display_name,role,created_at) VALUES($1,'micro-a@example.test','Synthetic micro a','ADMIN','2026-10-04T01:02:03.123456Z'),($2,'micro-b@example.test','Synthetic micro b','ADMIN','2026-10-04T01:02:03.123455Z')",
    [a, b],
  );
  const reader = new PrismaIdentityRepository(identity);
  const first = await reader.findAccount(uuid(a));
  assert.equal(first?.createdAt, '2026-10-04T01:02:03.123456Z');
  if (!first) throw new Error('Missing account');
  const page = await reader.listAdmins(1, { id: first.id, createdAt: first.createdAt });
  assert.equal(page[0]?.id, b);
  assert.equal(page[0]?.createdAt, '2026-10-04T01:02:03.123455Z');
});
test('Prisma Decimal preserves all numeric(20,6) digits through a Catalog transaction', async () => {
  const minimum = '99999999999999.123456',
    maximum = '99999999999999.999999';
  const result = await catalog.$transaction(
    async (tx) => {
      const row = await tx.specificationDefinitions.create({
        data: {
          code: 'synthetic-orm-decimal',
          value_type: 'NUMBER',
          minimum_value: minimum,
          maximum_value: maximum,
        },
      });
      await tx.specificationTranslations.create({
        data: { definition_id: row.id, locale: 'ar', label: 'Synthetic numeric definition' },
      });
      return row;
    },
    { isolationLevel: 'Serializable' },
  );
  assert.equal(result.minimum_value?.toFixed(6), minimum);
  assert.equal(result.maximum_value?.toFixed(6), maximum);
  assert.equal('writeGate' in catalog, false);
});
test('Prisma translation writes retain deleted rows and respect live partial uniqueness', async () => {
  const id = uuid(randomUUID()),
    work = new PrismaCatalogUnitOfWork(catalog);
  await work.execute(async ({ categories }) => {
    await categories.insert(id, null);
    await categories.putTranslations(id, [
      { locale: 'ar', name: 'Synthetic Arabic', description: null, slug: null },
      { locale: 'en', name: 'Synthetic old English', description: null, slug: null },
    ]);
  });
  const old = await catalog.categoryTranslations.findFirstOrThrow({
    where: { category_id: id, locale: 'en', deleted_at: null },
  });
  await catalog.$transaction(
    async (tx) => {
      await tx.categoryTranslations.update({
        where: { id: old.id },
        data: { deleted_at: new Date() },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  await work.execute(async ({ categories }) => {
    await categories.touch(id, (await categories.find(id, 'ar'))!.version);
    await categories.putTranslations(id, [
      { locale: 'en', name: 'Synthetic new English', description: null, slug: null },
    ]);
  });
  const rows = await catalog.categoryTranslations.findMany({
    where: { category_id: id, locale: 'en' },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((r) => r.deleted_at === null).length, 1);
  assert.equal(rows.find((r) => r.id === old.id)?.name, 'Synthetic old English');
});
test('Media Prisma models preserve JSON/binary/int8 data and restrict deletion to owned business tables', async () => {
  const hash = new Uint8Array(32).fill(127),
    metadata = { details: { locale: 'en', decimal: '123.000001' } };
  const asset = await media.assets.create({
    data: {
      media_kind: 'IMAGE',
      original_name: 'synthetic.jpg',
      storage_bucket: 'synthetic',
      storage_key: randomUUID(),
      byte_size: 9007199254740993n,
      sha256: hash,
      metadata,
    },
  });
  assert.equal(asset.status, 'UPLOADING');
  assert.equal(asset.byte_size, 9007199254740993n);
  assert.deepEqual(asset.sha256, hash);
  assert.deepEqual(asset.metadata, metadata);
  await media.assets.delete({ where: { id: asset.id } });
  assert.equal(await media.assets.findUnique({ where: { id: asset.id } }), null);
  await assert.rejects(
    media.$executeRaw`DELETE FROM ops.deletion_operations`,
    (error: unknown) => sqlState(error) === '42501',
  );
  await assert.rejects(
    media.$executeRaw`TRUNCATE media.assets`,
    (error: unknown) => sqlState(error) === '42501',
  );
});
test('Inquiries Prisma models preserve idempotency uniqueness after soft deletion', async () => {
  const data = {
    kind: 'CONTACT',
    locale: 'en',
    full_name: 'Synthetic inquiry',
    email: 'synthetic@example.test',
    message: 'Synthetic ORM fixture',
    idempotency_key: randomUUID(),
    request_hash: new Uint8Array(32).fill(91),
  };
  const inquiry = await inquiries.inquiries.create({ data });
  assert.equal(inquiry.status, 'NEW');
  assert.deepEqual(inquiry.request_hash, data.request_hash);
  await inquiries.inquiries.update({ where: { id: inquiry.id }, data: { deleted_at: new Date() } });
  await assert.rejects(
    inquiries.inquiries.create({ data }),
    (error: unknown) => sqlState(error) === '23505',
  );
  assert.ok((await inquiries.inquiries.findUnique({ where: { id: inquiry.id } }))?.deleted_at);
});
