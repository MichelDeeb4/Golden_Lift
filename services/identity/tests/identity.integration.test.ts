import type { PrismaClient } from '../src/infrastructure/prisma/client.js';
import { orm } from '../src/infrastructure/prisma/client.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { ApplicationError, uuid } from '@business-platform/contracts';
import type {
  AuthenticatedActor,
  StaffAccountDto,
  StaffSessionDto,
  CategoryDto,
} from '@business-platform/contracts';
import {
  databasePool,
  httpConfig,
  httpApplication,
  IdentitySessionClient,
} from '@business-platform/platform';
import type { HttpConfig } from '@business-platform/platform';
import { identityApplication } from '../src/composition/application.js';
import { identityConfig } from '../src/infrastructure/config.js';
import type { ActionMessage } from '../src/application/ports/identity.js';
import { PrismaIdentityRepository } from '../src/infrastructure/prisma/repository.js';
import { PrismaIdentityUnitOfWork } from '../src/infrastructure/prisma/unit-of-work.js';
import { catalogApplication } from '../../catalog/src/composition/application.js';
import { gatewayApplication } from '../../gateway/src/composition/application.js';
import {
  StaffController as MediaStaffController,
  STAFF_ACCESS as MEDIA_ACCESS,
} from '../../media/src/presentation/http/staff-controller.js';
import {
  StaffController as InquiryStaffController,
  STAFF_ACCESS as INQUIRY_ACCESS,
} from '../../inquiries/src/presentation/http/staff-controller.js';
import { CheckStaffAccess as MediaAccess } from '../../media/src/application/use-cases/check-staff-access.js';
import { CheckStaffAccess as InquiryAccess } from '../../inquiries/src/application/use-cases/check-staff-access.js';
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
  created: string[] = [],
  pools: pg.Pool[] = [],
  apps: Awaited<ReturnType<typeof httpApplication>>[] = [];
const origin = 'http://127.0.0.1:8082',
  security = {
    csrfSecret: 's'.repeat(43),
    callers: { catalog: 'c'.repeat(43), media: 'm'.repeat(43), inquiries: 'i'.repeat(43) },
  };
const messages: ActionMessage[] = [];
let failMail = false;
const firstPassword = 'Synthetic initial password 2026',
  newPassword = 'Synthetic changed password 2026';
let runtime: Awaited<ReturnType<typeof identityApplication>>,
  identityPool: pg.Pool,
  identityDatabase: PrismaClient,
  catalogPool: pg.Pool,
  gateway: string,
  identityUrl: string,
  superAccount: StaffAccountDto,
  adminAccount: StaffAccountDto,
  superSession: Session,
  adminSession: Session,
  superActor: AuthenticatedActor;
interface Session {
  cookie: string;
  csrf: string;
  account: StaffAccountDto;
}
interface Result<T> {
  status: number;
  body: T;
  cookie: string | null;
}
function config(service: HttpConfig['service']) {
  return { ...httpConfig(service, { ALLOWED_ORIGINS: origin }), port: 0 };
}
async function listen(app: Awaited<ReturnType<typeof httpApplication>>): Promise<string> {
  apps.push(app);
  await app.listen(0, '127.0.0.1');
  return app.getUrl();
}
async function call<T = Record<string, unknown>>(
  method: string,
  route: string,
  data?: unknown,
  session?: Session,
  extra: Record<string, string> = {},
  includeOrigin = true,
  base = gateway,
): Promise<Result<T>> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(includeOrigin ? { origin } : {}),
    ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}),
    ...extra,
  };
  const response = await fetch(base + route, {
    method,
    headers,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(25000),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as T,
    cookie: response.headers.get('set-cookie'),
  };
}
async function login(email: string, password = firstPassword): Promise<Session> {
  const result = await call<StaffSessionDto>('POST', '/api/v1/auth/login', { email, password });
  assert.equal(result.status, 200);
  assert.ok(result.cookie);
  return {
    cookie: result.cookie.split(';')[0] ?? '',
    csrf: result.body.csrfToken,
    account: result.body.account,
  };
}
async function invite(email: string): Promise<{ account: StaffAccountDto; token: string }> {
  const result = await runtime.admins.invite(email, 'Synthetic Admin', superActor);
  assert.equal(result.delivery, 'SENT');
  const token = messages.at(-1)?.token;
  if (!token) throw new Error('No delivered fixture token.');
  return { account: result.account, token };
}
async function active(email: string): Promise<StaffAccountDto> {
  const item = await invite(email);
  await runtime.actions.consume(item.token, firstPassword, 'INVITATION');
  return runtime.admins.detail(item.account.id, superActor);
}
const isCode = (code: string) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;
const b4CategoryId = 'ab000000-0000-4000-8000-000000000001';
const b4Routes: readonly (readonly [string, string, unknown?])[] = [
  ...['attributes', 'attribute-groups', 'units'].flatMap((resource) => [
    ['GET', '/api/v1/admin/' + resource] as const,
    ['POST', '/api/v1/admin/' + resource, {}] as const,
    ['GET', '/api/v1/admin/' + resource + '/' + b4CategoryId] as const,
    ['POST', '/api/v1/admin/' + resource + '/' + b4CategoryId + '/changes/preview', {}] as const,
    ['POST', '/api/v1/admin/' + resource + '/' + b4CategoryId + '/changes', {}] as const,
  ]),
  ['GET', '/api/v1/admin/categories/' + b4CategoryId + '/schema'],
  ['GET', '/api/v1/admin/attribute-options/' + b4CategoryId],
  ['POST', '/api/v1/admin/attributes/' + b4CategoryId + '/options', {}],
  ['POST', '/api/v1/admin/attribute-options/' + b4CategoryId + '/changes/preview', {}],
  ['POST', '/api/v1/admin/attribute-options/' + b4CategoryId + '/changes', {}],
  ['POST', '/api/v1/admin/products', {}],
  ['GET', '/api/v1/admin/products?locale=ar'],
  ['GET', '/api/v1/admin/products/' + b4CategoryId + '/management'],
  ['POST', '/api/v1/admin/products/' + b4CategoryId + '/publication', {}],
  ['POST', '/api/v1/admin/products/' + b4CategoryId + '/media', {}],
  [
    'DELETE',
    '/api/v1/admin/products/' + b4CategoryId,
    { expectedVersion: '1', impactRevision: 'd1-' + '0'.repeat(64), confirmed: true },
  ],
  ['GET', '/api/v1/admin/products/' + b4CategoryId],
  ['GET', '/api/v1/admin/products/' + b4CategoryId + '/edit-schema'],
  ['PATCH', '/api/v1/admin/products/' + b4CategoryId, {}],
  ['POST', '/api/v1/admin/products/' + b4CategoryId + '/placement', {}],
  ['POST', '/api/v1/admin/products/' + b4CategoryId + '/placement/preview', {}],
  ...['categories', 'attribute-groups', 'attributes'].flatMap((resource) => [
    ['GET', '/api/v1/admin/' + resource + '/' + b4CategoryId + '/memberships'] as const,
    [
      'POST',
      '/api/v1/admin/' + resource + '/' + b4CategoryId + '/memberships/preview',
      {},
    ] as const,
    ['POST', '/api/v1/admin/' + resource + '/' + b4CategoryId + '/memberships', {}] as const,
  ]),
  ['GET', '/api/v1/admin/categories'],
  ['GET', '/api/v1/admin/categories/' + b4CategoryId],
  ['GET', '/api/v1/admin/categories/' + b4CategoryId + '/breadcrumbs'],
  ['GET', '/api/v1/admin/categories/' + b4CategoryId + '/move-destinations'],
  ['GET', '/api/v1/admin/categories/' + b4CategoryId + '/deletion-impact'],
  ['POST', '/api/v1/admin/categories/' + b4CategoryId + '/move', {}],
  ['POST', '/api/v1/admin/categories/reorder', {}],
  [
    'DELETE',
    '/api/v1/admin/categories/' + b4CategoryId,
    { expectedVersion: '1', impactRevision: 'd1-' + '0'.repeat(64), confirmed: true },
  ],
];
async function assertB4Status(
  session: Session | undefined,
  expected: number,
  headers: Record<string, string> = {},
) {
  for (const [method, route, body] of b4Routes)
    assert.equal(
      (await call(method, route, body, session, headers)).status,
      expected,
      method + ' ' + route,
    );
}
before(async () => {
  for (const service of ['identity', 'catalog'] as const) {
    const entry = scratch.services[service];
    if (!entry) throw new Error('Missing service config.');
    const database = 'business_platform_b3_' + service + '_' + randomUUID().replaceAll('-', '');
    if (!/^business_platform_b3_(identity|catalog)_[0-9a-f]{32}$/.test(database))
      throw new Error('Unsafe scratch identifier.');
    entry.database = database;
    tools.sql(
      original,
      null,
      'CREATE DATABASE ' +
        database +
        ' OWNER ' +
        entry.owner +
        " TEMPLATE template0 ENCODING 'UTF8'",
    );
    created.push(database);
    tools.file(
      scratch,
      service,
      'sql/' + (service === 'identity' ? '01_identity.sql' : '25_category_catalog_fresh.sql'),
      { owner: true, atomic: true },
    );
    tools.grantRuntime(scratch, service);
    const pool = await databasePool({
      service,
      connectionString:
        'postgresql://' +
        entry.user +
        ':' +
        encodeURIComponent(entry.password) +
        '@127.0.0.1:' +
        scratch.port +
        '/' +
        database,
      max: 8,
    });
    pools.push(pool);
    if (service === 'identity') {
      identityPool = pool;
      identityDatabase = orm(pool);
    } else catalogPool = pool;
  }
  const options = identityConfig(config('identity'));
  runtime = await identityApplication({ ...options, security }, identityPool, {
    send: async (message) => {
      if (failMail) throw new Error('Synthetic provider failure.');
      messages.push(message);
    },
  });
  identityUrl = await listen(runtime.app);
  const catalog = await listen(
    await catalogApplication(
      config('catalog'),
      catalogPool,
      new IdentitySessionClient({
        origin: identityUrl,
        caller: 'catalog',
        credential: security.callers.catalog,
      }),
    ),
  );
  const media = await listen(
    await httpApplication(config('media'), {
      ready: async () => true,
      controllers: [MediaStaffController],
      providers: [
        {
          provide: MEDIA_ACCESS,
          useValue: new MediaAccess(
            new IdentitySessionClient({
              origin: identityUrl,
              caller: 'media',
              credential: security.callers.media,
            }),
          ),
        },
      ],
    }),
  );
  const inquiries = await listen(
    await httpApplication(config('inquiries'), {
      ready: async () => true,
      controllers: [InquiryStaffController],
      providers: [
        {
          provide: INQUIRY_ACCESS,
          useValue: new InquiryAccess(
            new IdentitySessionClient({
              origin: identityUrl,
              caller: 'inquiries',
              credential: security.callers.inquiries,
            }),
          ),
        },
      ],
    }),
  );
  gateway = await listen(
    await gatewayApplication(config('gateway'), {
      identity: identityUrl,
      catalog,
      media,
      inquiries,
    }),
  );
});

after(async () => {
  if (identityDatabase) await identityDatabase.$disconnect();
  for (const app of [...apps].reverse()) await app.close();
  for (const pool of pools) if (!pool.ended) await pool.end();
  for (const database of created)
    tools.sql(original, null, 'DROP DATABASE ' + database + ' WITH (FORCE)');
});
test('concurrent operator bootstrap creates exactly one Super Admin and cannot be repeated', async () => {
  const results = await Promise.allSettled([
    runtime.bootstrap.execute('super-one@example.test', 'Synthetic Super Admin', firstPassword),
    runtime.bootstrap.execute('super-two@example.test', 'Synthetic Super Admin', firstPassword),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const success = results.find((result) => result.status === 'fulfilled');
  if (!success || success.status !== 'fulfilled') throw new Error('Bootstrap failed.');
  superAccount = success.value;
  const failure = results.find((result) => result.status === 'rejected');
  assert.ok(failure && failure.status === 'rejected' && isCode('CONFLICT')(failure.reason));
  assert.equal(
    (await identityPool.query("SELECT 1 FROM identity.staff_accounts WHERE role='SUPER_ADMIN'"))
      .rowCount,
    1,
  );
  await assert.rejects(
    runtime.bootstrap.execute('another@example.test', 'Another Super Admin', firstPassword),
    isCode('CONFLICT'),
  );
  superSession = await login(superAccount.email);
  const principal = await runtime.authentication.current(
    superSession.cookie.slice('bp_staff='.length),
  );
  superActor = principal.actor;
});
test('invitation activates a fixed-role Admin through the gateway without exposing raw tokens', async () => {
  assert.equal(
    (
      await call(
        'POST',
        '/api/v1/staff/admins',
        { email: 'role@example.test', displayName: 'Attempt', role: 'SUPER_ADMIN' },
        superSession,
      )
    ).status,
    400,
  );
  const invited = await call<{ account: StaffAccountDto; delivery: string }>(
    'POST',
    '/api/v1/staff/admins',
    { email: ' ADMIN@Example.test ', displayName: 'Synthetic Admin' },
    superSession,
  );
  assert.equal(invited.status, 201);
  assert.equal(invited.body.delivery, 'SENT');
  assert.equal(invited.body.account.role, 'ADMIN');
  assert.equal(invited.body.account.status, 'INVITED');
  const exactUpdated = await identityPool.query<{ updated: string }>(
    `SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated FROM identity.staff_accounts WHERE id=$1`,
    [invited.body.account.id],
  );
  assert.equal(invited.body.account.updatedAt, exactUpdated.rows[0]!.updated);
  assert.match(invited.body.account.updatedAt, /\.\d{6}Z$/);
  const token = messages.at(-1)?.token;
  if (!token) throw new Error('No invitation mail.');
  assert.ok(!JSON.stringify(invited.body).includes(token));
  assert.equal(
    (
      await call('POST', '/api/v1/auth/login', {
        email: 'admin@example.test',
        password: firstPassword,
      })
    ).status,
    401,
  );
  assert.equal(
    (await call('POST', '/api/v1/auth/invitations/accept', { token, password: 'short' })).status,
    400,
  );
  assert.equal(
    (await call('POST', '/api/v1/auth/invitations/accept', { token, password: firstPassword }))
      .status,
    200,
  );
  adminSession = await login('admin@example.test');
  adminAccount = adminSession.account;
  assert.equal(adminAccount.status, 'ACTIVE');
  assert.equal(
    (await call('POST', '/api/v1/auth/invitations/accept', { token, password: firstPassword }))
      .status,
    400,
  );
});
test('sessions use hashed database credentials, HttpOnly cookies, and session-bound CSRF tokens', async () => {
  const result = await call<StaffSessionDto>('POST', '/api/v1/auth/login', {
    email: adminAccount.email,
    password: firstPassword,
  });
  assert.equal(result.status, 200);
  assert.match(result.cookie ?? '', /HttpOnly; SameSite=Strict/);
  assert.ok(!JSON.stringify(result.body).includes('passwordHash'));
  assert.ok(!JSON.stringify(result.body).includes('authVersion'));
  const raw = (result.cookie ?? '').split(';')[0]?.slice('bp_staff='.length) ?? '';
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify(result.body).includes(raw));
  assert.notEqual(result.body.csrfToken, adminSession.csrf);
  const rows = await identityPool.query<{ digest: string; password_hash: string }>(
    "SELECT encode(s.token_hash,'hex') AS digest,a.password_hash FROM identity.staff_sessions s JOIN identity.staff_accounts a ON a.id=s.staff_id WHERE s.staff_id=$1",
    [adminAccount.id],
  );
  assert.ok(
    rows.rows.every(
      (row) =>
        row.digest !== raw &&
        row.digest.length === 64 &&
        row.password_hash.startsWith('$argon2id$'),
    ),
  );
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, adminSession)).status, 200);
  assert.equal(
    (
      await call('POST', '/api/v1/auth/logout', undefined, adminSession, {
        'x-csrf-token': result.body.csrfToken,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call('POST', '/api/v1/auth/login', {
        email: 'unknown@example.test',
        password: firstPassword,
      })
    ).status,
    401,
  );
});
test('credentialed browser preflight accepts only configured origins and headers', async () => {
  const allowed = await fetch(gateway + '/api/v1/auth/login', {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-csrf-token',
    },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  assert.ok(allowed.headers.get('access-control-allow-headers')?.includes('x-csrf-token'));
  const foreign = await fetch(gateway + '/api/v1/auth/login', {
    method: 'OPTIONS',
    headers: { origin: 'https://foreign.invalid', 'access-control-request-method': 'POST' },
  });
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});
test('role boundaries deny Admin account administration and Super Admin content access', async () => {
  await assertB4Status(superSession, 403);
  for (const [method, route, data] of [
    ['GET', '/api/v1/staff/admins', undefined],
    ['POST', '/api/v1/staff/admins', { email: 'blocked@example.test', displayName: 'Blocked' }],
    [
      'POST',
      '/api/v1/staff/admins/' + adminAccount.id + '/disable',
      { expectedVersion: adminAccount.version },
    ],
  ] as const)
    assert.equal((await call(method, route, data, adminSession)).status, 403);
  const draft = { translations: [{ locale: 'ar', name: 'Synthetic content' }] };
  assert.equal((await call('POST', '/api/v1/admin/categories', draft, superSession)).status, 403);
  for (const service of ['media', 'inquiries']) {
    assert.equal(
      (await call('GET', '/api/v1/admin/' + service + '/session', undefined, superSession)).status,
      403,
    );
    assert.equal(
      (await call('GET', '/api/v1/admin/' + service + '/session', undefined, adminSession)).status,
      200,
    );
  }
  assert.equal(
    (
      await call(
        'PATCH',
        '/api/v1/staff/admins/' + superAccount.id,
        { expectedVersion: superAccount.version, displayName: 'Forbidden' },
        superSession,
      )
    ).status,
    403,
  );
});
test('gateway and services reject spoofed principals, missing CSRF, and foreign Origins', async () => {
  await assertB4Status(undefined, 401, {
    'x-user-role': 'ADMIN',
    'x-user-id': adminAccount.id,
    'x-service-name': 'catalog',
    authorization: 'Bearer fabricated',
  });
  for (const [method, route, body] of b4Routes.filter(([method]) => method !== 'GET')) {
    assert.equal(
      (await call(method, route, body, adminSession, { 'x-csrf-token': '' })).status,
      403,
    );
    assert.equal((await call(method, route, body, adminSession, {}, false)).status, 403);
  }
  await assertB4Status(adminSession, 403, { origin: 'https://foreign.example.test' });
  const draft = { translations: [{ locale: 'ar', name: 'Synthetic category' }] };
  assert.equal(
    (
      await call('POST', '/api/v1/admin/categories', draft, undefined, {
        'x-user-role': 'ADMIN',
        'x-user-id': adminAccount.id,
        'x-auth-version': '1',
      })
    ).status,
    401,
  );
  assert.equal(
    (await call('POST', '/api/v1/admin/categories', draft, adminSession, { 'x-csrf-token': '' }))
      .status,
    403,
  );
  assert.equal(
    (await call('POST', '/api/v1/admin/categories', draft, adminSession, {}, false)).status,
    403,
  );
  assert.equal(
    (
      await call('POST', '/api/v1/admin/categories', draft, adminSession, {
        origin: 'https://foreign.example.test',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        'POST',
        '/api/v1/auth/login',
        { email: adminAccount.email, password: firstPassword },
        undefined,
        {},
        false,
      )
    ).status,
    403,
  );
  assert.equal((await call('POST', '/internal/v1/sessions/introspect', {}, undefined)).status, 404);
  const payload = {
    sessionToken: adminSession.cookie.slice('bp_staff='.length),
    csrfToken: adminSession.csrf,
    origin,
    mutation: false,
  };
  assert.equal(
    (
      await call(
        'POST',
        '/internal/v1/sessions/introspect',
        payload,
        undefined,
        {},
        false,
        identityUrl,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        'POST',
        '/internal/v1/sessions/introspect',
        payload,
        undefined,
        { 'x-service-name': 'media', authorization: 'Bearer ' + security.callers.catalog },
        false,
        identityUrl,
      )
    ).status,
    403,
  );
  const verified = await call<AuthenticatedActor>(
    'POST',
    '/internal/v1/sessions/introspect',
    payload,
    undefined,
    { 'x-service-name': 'catalog', authorization: 'Bearer ' + security.callers.catalog },
    false,
    identityUrl,
  );
  assert.equal(verified.status, 200);
  assert.equal(verified.body.id, adminAccount.id);
  assert.ok(!JSON.stringify(verified.body).includes(adminAccount.email));
  assert.equal((await call('GET', '/api/v1/auth/unknown')).status, 404);
});
test('authenticated category creation and editing retain version checks and atomic outbox events', async () => {
  const created = await call<CategoryDto>(
    'POST',
    '/api/v1/admin/categories',
    { translations: [{ locale: 'ar', name: 'Authorized category' }] },
    adminSession,
  );
  assert.equal(created.status, 201);
  const edited = await call<CategoryDto>(
    'PATCH',
    '/api/v1/admin/categories/' + created.body.id,
    {
      expectedVersion: created.body.version,
      translations: [{ locale: 'ar', name: 'Authorized edit' }],
    },
    adminSession,
  );
  assert.equal(edited.status, 200);
  assert.ok(BigInt(edited.body.version) > BigInt(created.body.version));
  assert.equal(
    (
      await call(
        'PATCH',
        '/api/v1/admin/categories/' + created.body.id,
        {
          expectedVersion: created.body.version,
          translations: [{ locale: 'ar', name: 'Stale edit' }],
        },
        adminSession,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await catalogPool.query('SELECT 1 FROM ops.outbox_events WHERE aggregate_id=$1', [
        created.body.id,
      ])
    ).rowCount,
    2,
  );
});
test('invitation consumption is single-use under concurrent requests and expired links cannot activate', async () => {
  const invited = await invite('concurrent@example.test');
  const results = await Promise.allSettled([
    runtime.actions.consume(invited.token, firstPassword, 'INVITATION'),
    runtime.actions.consume(invited.token, firstPassword, 'INVITATION'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(
    results.some(
      (result) => result.status === 'rejected' && isCode('VALIDATION_FAILED')(result.reason),
    ),
  );
  const expired = await invite('expired@example.test');
  await identityPool.query(
    "UPDATE identity.staff_tokens SET expires_at=created_at+interval '1 microsecond' WHERE staff_id=$1",
    [expired.account.id],
  );
  await assert.rejects(
    runtime.actions.consume(expired.token, firstPassword, 'INVITATION'),
    isCode('VALIDATION_FAILED'),
  );
  assert.equal((await runtime.admins.detail(expired.account.id, superActor)).status, 'INVITED');
});
test('resending replaces old invitations; delivery failure preserves a recoverable account', async () => {
  const item = await invite('resend@example.test');
  const resend = await call<{ account: StaffAccountDto; delivery: string }>(
    'POST',
    '/api/v1/staff/admins/' + item.account.id + '/invitation',
    { expectedVersion: item.account.version },
    superSession,
  );
  assert.equal(resend.status, 200);
  const fresh = messages.at(-1)?.token;
  if (!fresh) throw new Error('No replacement token.');
  assert.notEqual(fresh, item.token);
  await assert.rejects(
    runtime.actions.consume(item.token, firstPassword, 'INVITATION'),
    isCode('VALIDATION_FAILED'),
  );
  await runtime.actions.consume(fresh, firstPassword, 'INVITATION');
  failMail = true;
  const failed = await call<{ account: StaffAccountDto; delivery: string }>(
    'POST',
    '/api/v1/staff/admins',
    { email: 'delivery-failed@example.test', displayName: 'Recoverable' },
    superSession,
  );
  failMail = false;
  assert.equal(failed.status, 201);
  assert.equal(failed.body.delivery, 'FAILED');
  assert.equal(failed.body.account.status, 'INVITED');
  const recovered = await call<{ delivery: string }>(
    'POST',
    '/api/v1/staff/admins/' + failed.body.account.id + '/invitation',
    { expectedVersion: failed.body.account.version },
    superSession,
  );
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.delivery, 'SENT');
});
test('password reset requests hide account state; reset tokens replace older links and revoke all sessions', async () => {
  const unknown = await call('POST', '/api/v1/auth/password/reset-request', {
      email: 'missing@example.test',
    }),
    known = await call('POST', '/api/v1/auth/password/reset-request', {
      email: adminAccount.email,
    });
  assert.equal(unknown.status, 202);
  assert.equal(known.status, 202);
  assert.deepEqual(unknown.body, known.body);
  await runtime.delivery.drain();
  const old = messages.at(-1)?.token;
  if (!old) throw new Error('No reset mail.');
  await call('POST', '/api/v1/auth/password/reset-request', { email: adminAccount.email });
  await runtime.delivery.drain();
  const current = messages.at(-1)?.token;
  if (!current) throw new Error('No fresh reset mail.');
  assert.notEqual(old, current);
  assert.equal(
    (await call('POST', '/api/v1/auth/password/reset', { token: old, password: newPassword }))
      .status,
    400,
  );
  assert.equal(
    (await call('POST', '/api/v1/auth/password/reset', { token: current, password: newPassword }))
      .status,
    200,
  );
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, adminSession)).status, 401);
  assert.equal(
    (await call('POST', '/api/v1/auth/password/reset', { token: current, password: newPassword }))
      .status,
    400,
  );
  assert.equal(
    (
      await call('POST', '/api/v1/auth/login', {
        email: adminAccount.email,
        password: firstPassword,
      })
    ).status,
    401,
  );
  adminSession = await login(adminAccount.email, newPassword);
  const expiry = await active('reset-expired@example.test');
  await runtime.actions.requestReset(expiry.email);
  await runtime.delivery.drain();
  const expiredToken = messages.at(-1)?.token;
  if (!expiredToken) throw new Error('No expiry token.');
  await identityPool.query(
    "UPDATE identity.staff_tokens SET expires_at=created_at+interval '1 microsecond' WHERE staff_id=$1",
    [expiry.id],
  );
  await assert.rejects(
    runtime.actions.consume(expiredToken, newPassword, 'PASSWORD_RESET'),
    isCode('VALIDATION_FAILED'),
  );
});
test('own password change requires the old password and revokes other sessions; logout revokes one session', async () => {
  const other = await login(adminAccount.email, newPassword);
  assert.equal(
    (
      await call(
        'POST',
        '/api/v1/auth/password/change',
        { oldPassword: 'wrong', password: firstPassword },
        adminSession,
      )
    ).status,
    401,
  );
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, adminSession)).status, 200);
  const changed = await call(
    'POST',
    '/api/v1/auth/password/change',
    { oldPassword: newPassword, password: firstPassword },
    adminSession,
  );
  assert.equal(changed.status, 200);
  assert.match(changed.cookie ?? '', /Max-Age=0/);
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, other)).status, 401);
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, adminSession)).status, 401);
  const session = await login(adminAccount.email);
  assert.equal((await call('POST', '/api/v1/auth/logout', undefined, session)).status, 204);
  await assertB4Status(session, 401);
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, session)).status, 401);
  adminSession = await login(adminAccount.email);
});
test('Admin edit, disable, and enable invalidate sessions immediately and enforce expected versions', async () => {
  let target = await runtime.admins.detail(adminAccount.id, superActor);
  const edit = await call<StaffAccountDto>(
    'PATCH',
    '/api/v1/staff/admins/' + target.id,
    {
      expectedVersion: target.version,
      email: 'admin-renamed@example.test',
      displayName: 'Renamed',
    },
    superSession,
  );
  assert.equal(edit.status, 200);
  assert.equal(edit.body.email, 'admin-renamed@example.test');
  assert.equal(
    (await call('GET', '/api/v1/admin/media/session', undefined, adminSession)).status,
    401,
  );
  adminSession = await login(edit.body.email);
  target = edit.body;
  assert.equal(
    (
      await call(
        'POST',
        '/api/v1/staff/admins/' + target.id + '/disable',
        { expectedVersion: '1' },
        superSession,
      )
    ).status,
    409,
  );
  const disabled = await call<StaffAccountDto>(
    'POST',
    '/api/v1/staff/admins/' + target.id + '/disable',
    { expectedVersion: target.version },
    superSession,
  );
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.status, 'DISABLED');
  await assertB4Status(adminSession, 401);
  assert.equal(
    (
      await call(
        'POST',
        '/api/v1/admin/categories',
        { translations: [{ locale: 'ar', name: 'Blocked after disable' }] },
        adminSession,
      )
    ).status,
    401,
  );
  const before = messages.length,
    reset = await call('POST', '/api/v1/auth/password/reset-request', { email: target.email });
  assert.equal(reset.status, 202);
  await runtime.delivery.drain();
  assert.equal(messages.length, before);
  assert.equal(
    (await call('POST', '/api/v1/auth/login', { email: target.email, password: firstPassword }))
      .status,
    401,
  );
  const enabled = await call<StaffAccountDto>(
    'POST',
    '/api/v1/staff/admins/' + target.id + '/enable',
    { expectedVersion: disabled.body.version },
    superSession,
  );
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.status, 'ACTIVE');
  assert.ok(enabled.body.updatedAt > disabled.body.updatedAt);
  const directory = await call<{ items: StaffAccountDto[] }>(
    'GET',
    '/api/v1/staff/admins?limit=100',
    undefined,
    superSession,
  );
  assert.equal(
    directory.body.items.find((row) => row.id === target.id)?.updatedAt,
    enabled.body.updatedAt,
  );
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, adminSession)).status, 401);
  adminSession = await login(target.email);
  adminAccount = enabled.body;
});
test('soft deletion retains the email, prevents login and cannot be restored through the API', async () => {
  const target = await active('deleted@example.test'),
    session = await login(target.email);
  const removed = await call<StaffAccountDto>(
    'DELETE',
    '/api/v1/staff/admins/' + target.id,
    { expectedVersion: target.version },
    superSession,
  );
  assert.equal(removed.status, 200);
  assert.equal(
    (
      await identityPool.query(
        'SELECT 1 FROM identity.staff_accounts WHERE id=$1 AND deleted_at IS NOT NULL',
        [target.id],
      )
    ).rowCount,
    1,
  );
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, session)).status, 401);
  await assertB4Status(session, 401);
  assert.equal(
    (
      await call(
        'POST',
        '/api/v1/staff/admins/' + target.id + '/enable',
        { expectedVersion: removed.body.version },
        superSession,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        'POST',
        '/api/v1/staff/admins',
        { email: target.email.toUpperCase(), displayName: 'Duplicate' },
        superSession,
      )
    ).status,
    409,
  );
});
test('session expiry, precise cursor pagination, and minimal outbox payloads are enforced', async () => {
  const target = await active('session-expiry@example.test'),
    session = await login(target.email);
  await identityPool.query(
    "UPDATE identity.staff_sessions SET expires_at=created_at+interval '1 microsecond' WHERE staff_id=$1",
    [target.id],
  );
  await assertB4Status(session, 401);
  assert.equal((await call('GET', '/api/v1/auth/session', undefined, session)).status, 401);
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: Result<{ items: StaffAccountDto[]; nextCursor: string | null }> = await call<{
      items: StaffAccountDto[];
      nextCursor: string | null;
    }>(
      'GET',
      '/api/v1/staff/admins?limit=2' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
      undefined,
      superSession,
    );
    assert.equal(page.status, 200);
    for (const item of page.body.items) {
      assert.equal(item.role, 'ADMIN');
      assert.ok(!seen.has(item.id));
      seen.add(item.id);
    }
    cursor = page.body.nextCursor;
  } while (cursor);
  assert.equal(
    seen.size,
    Number(
      (
        await identityPool.query<{ count: string }>(
          "SELECT count(*) FROM identity.staff_accounts WHERE role='ADMIN' AND deleted_at IS NULL",
        )
      ).rows[0]?.count,
    ),
  );
  const events = await identityPool.query<{ payload: { data: Record<string, unknown> } }>(
    'SELECT payload FROM ops.outbox_events',
  );
  assert.ok(events.rows.length > 0);
  for (const event of events.rows) assert.deepEqual(Object.keys(event.payload.data), ['accountId']);
  const serialized = JSON.stringify(events.rows);
  for (const message of messages) {
    assert.ok(!serialized.includes(message.token));
    assert.ok(!serialized.includes(message.email));
  }
});
test('failed Identity transactions roll back accounts, action tokens, and outbox together', async () => {
  const id = uuid(randomUUID());
  await assert.rejects(
    new PrismaIdentityUnitOfWork(identityDatabase).execute(async (repository) => {
      const row = await repository.insertAccount(
        id,
        'rolled-back@example.test',
        'Rollback',
        'ADMIN',
        null,
      );
      await repository.issueToken(
        uuid(randomUUID()),
        id,
        'INVITATION',
        '0'.repeat(64),
        new Date(Date.now() + 60000).toISOString(),
      );
      await repository.appendEvent({
        id: uuid(randomUUID()),
        type: 'identity.admin.invited.v1',
        schemaVersion: 1,
        producer: 'identity',
        occurredAt: new Date().toISOString(),
        correlationId: uuid(randomUUID()),
        aggregate: { type: 'StaffAccount', key: id, version: row.version },
        data: { accountId: id },
      });
      throw new ApplicationError('INVALID_STATE', 'Synthetic rollback.');
    }),
    isCode('INVALID_STATE'),
  );
  assert.equal(await new PrismaIdentityRepository(identityDatabase).findAccount(id), null);
  assert.equal(
    (await identityPool.query('SELECT 1 FROM identity.staff_tokens WHERE staff_id=$1', [id]))
      .rowCount,
    0,
  );
  assert.equal(
    (await identityPool.query('SELECT 1 FROM ops.outbox_events WHERE aggregate_id=$1', [id]))
      .rowCount,
    0,
  );
});

test('reset consumption races once, account mutations never target Super Admin, and login is rate-limited', async () => {
  const target = await active('reset-race@example.test');
  await runtime.actions.requestReset(target.email);
  await runtime.delivery.drain();
  const token = messages.at(-1)?.token;
  if (!token) throw new Error('Missing reset token.');
  const results = await Promise.allSettled([
    runtime.actions.consume(token, newPassword, 'PASSWORD_RESET'),
    runtime.actions.consume(token, newPassword, 'PASSWORD_RESET'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(
    results.some(
      (result) => result.status === 'rejected' && isCode('VALIDATION_FAILED')(result.reason),
    ),
  );
  for (const [method, suffix, body] of [
    ['GET', '', undefined],
    ['DELETE', '', { expectedVersion: superAccount.version }],
    ['POST', '/enable', { expectedVersion: superAccount.version }],
    ['POST', '/disable', { expectedVersion: superAccount.version }],
    ['POST', '/invitation', { expectedVersion: superAccount.version }],
  ] as const)
    assert.equal(
      (await call(method, '/api/v1/staff/admins/' + superAccount.id + suffix, body, superSession))
        .status,
      403,
    );
  for (let attempt = 0; attempt < 10; attempt++)
    assert.equal(
      (
        await call('POST', '/api/v1/auth/login', {
          email: 'rate-limit@example.test',
          password: 'wrong',
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call('POST', '/api/v1/auth/login', {
        email: 'rate-limit@example.test',
        password: 'wrong',
      })
    ).status,
    429,
  );
});

test('Identity outage rejects protected requests while anonymous Catalog reads remain available', async () => {
  await runtime.app.close();
  apps.splice(apps.indexOf(runtime.app), 1);
  await assertB4Status(adminSession, 503);
  assert.equal(
    (
      await call(
        'POST',
        '/api/v1/admin/categories',
        { translations: [{ locale: 'ar', name: 'Outage attempt' }] },
        adminSession,
      )
    ).status,
    503,
  );
  assert.equal((await call('GET', '/api/v1/categories')).status, 200);
  assert.equal((await call('GET', '/health/ready')).status, 503);
});
