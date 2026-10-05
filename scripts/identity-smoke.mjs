import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { config as databaseConfig, sql, file, grantRuntime } from '../database/scripts/db.mjs';
import { exerciseDynamicCatalog } from './dynamic-catalog-smoke.mjs';
const original = databaseConfig(),
  scratch = structuredClone(original),
  databases = [],
  children = [],
  names = ['identity', 'catalog', 'media', 'inquiries', 'gateway'],
  ports = {};
const origin = 'http://127.0.0.1:8082',
  password = 'Synthetic process password ' + randomUUID(),
  secret = () => randomBytes(32).toString('base64url'),
  csrfSecret = secret(),
  callers = { catalog: secret(), media: secret(), inquiries: secret() };
fs.mkdirSync('.local', { recursive: true });
const mailbox = fs.mkdtempSync(path.resolve('.local/identity-smoke-mail-'));
const connections = {};
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Missing port.'));
      server.close(() => resolve(address.port));
    });
  });
}
function environment(name) {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(ports[name]),
    ALLOWED_ORIGINS: origin,
    STAFF_APP_URL: origin,
    IDENTITY_MAIL_TRANSPORT: 'local',
    IDENTITY_MAILBOX_DIRECTORY: mailbox,
  };
  for (const other of names) {
    delete env[other.toUpperCase() + '_DATABASE_URL'];
    delete env[other.toUpperCase() + '_PORT'];
    delete env[other.toUpperCase() + '_IDENTITY_SERVICE_TOKEN'];
  }
  delete env.IDENTITY_CSRF_SECRET;
  delete env.IDENTITY_SERVICE_CREDENTIALS;
  delete env.BOOTSTRAP_PASSWORD;
  delete env.SMTP_PASSWORD;
  delete env.SMTP_USER;
  if (name !== 'gateway') env[name.toUpperCase() + '_DATABASE_URL'] = connections[name];
  if (name === 'identity') {
    env.IDENTITY_CSRF_SECRET = csrfSecret;
    env.IDENTITY_SERVICE_CREDENTIALS = JSON.stringify(callers);
  }
  if (callers[name]) env[name.toUpperCase() + '_IDENTITY_SERVICE_TOKEN'] = callers[name];
  for (const upstream of names.filter((name) => name !== 'gateway'))
    env[upstream.toUpperCase() + '_SERVICE_URL'] = 'http://127.0.0.1:' + ports[upstream];
  return env;
}
async function bootstrap() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.resolve('services/identity/dist/composition/bootstrap.js')],
      {
        env: {
          ...environment('identity'),
          BOOTSTRAP_EMAIL: 'process-super@example.test',
          BOOTSTRAP_DISPLAY_NAME: 'Synthetic Process Super Admin',
          BOOTSTRAP_PASSWORD: password,
        },
        cwd: path.resolve('services/identity'),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, output }));
  });
}
async function ready(name) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if (
        (
          await fetch('http://127.0.0.1:' + ports[name] + '/health/ready', {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        return;
    } catch {}
    if (
      children.some(
        (item) =>
          item.name === name && (item.child.exitCode !== null || item.child.signalCode !== null),
      )
    )
      throw new Error(name + ' process failed to start.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(name + ' readiness timed out.');
}
async function request(method, route, body, session, extra = {}) {
  const response = await fetch('http://127.0.0.1:' + ports.gateway + route, {
    method,
    headers: {
      origin,
      'content-type': 'application/json',
      ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000),
  });
  return { response, body: response.status === 204 ? null : await response.json() };
}
async function login(email) {
  const result = await request('POST', '/api/v1/auth/login', { email, password });
  assert.equal(result.response.status, 200);
  const cookie = result.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, csrf: result.body.csrfToken, account: result.body.account };
}
try {
  for (const name of names) ports[name] = await freePort();
  for (const name of names.filter((name) => name !== 'gateway')) {
    const entry = scratch.services[name];
    if (!entry) throw new Error('Missing database configuration.');
    if (['identity', 'catalog'].includes(name)) {
      const database = 'golden_lift_b3p_' + name + '_' + randomUUID().replaceAll('-', '');
      if (
        database.length > 63 ||
        !/^golden_lift_b3p_(identity|catalog)_[0-9a-f]{32}$/.test(database)
      )
        throw new Error('Unsafe scratch identifier.');
      entry.database = database;
      sql(
        original,
        null,
        'CREATE DATABASE ' +
          database +
          ' OWNER ' +
          entry.owner +
          " TEMPLATE template0 ENCODING 'UTF8'",
      );
      databases.push(database);
      file(
        scratch,
        name,
        'sql/' + (name === 'identity' ? '01_identity.sql' : '19_catalog_media_core_fresh.sql'),
        {
          owner: true,
          atomic: true,
        },
      );
      grantRuntime(scratch, name);
    }
    connections[name] =
      'postgresql://' +
      entry.user +
      ':' +
      encodeURIComponent(entry.password) +
      '@127.0.0.1:' +
      scratch.port +
      '/' +
      entry.database;
  }
  const initial = await bootstrap();
  assert.equal(initial.code, 0, initial.output.replaceAll(password, '[redacted]'));
  assert.ok(initial.output.includes('identity.bootstrap.completed'));
  assert.ok(!initial.output.includes(password));
  const repeated = await bootstrap();
  assert.equal(repeated.code, 1);
  assert.ok(repeated.output.includes('CONFLICT'));
  console.log('PASS protected operator CLI and repeat protection');
  for (const name of names) {
    const child = spawn(
      process.execPath,
      [path.resolve('services', name, 'dist/composition/main.js')],
      {
        env: environment(name),
        cwd: path.resolve('services', name),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output = (output + chunk).slice(-65536);
    });
    child.stderr.on('data', (chunk) => {
      output = (output + chunk).slice(-65536);
    });
    const done = new Promise((resolve) => {
      child.once('exit', resolve);
      child.once('error', resolve);
    });
    children.push({ name, child, done, output: () => output });
    await ready(name);
    assert.ok(output.includes('service.started'));
    console.log('PASS independent staff process: ' + name);
  }
  const superSession = await login('process-super@example.test');
  const invited = await request(
    'POST',
    '/api/v1/staff/admins',
    { email: 'process-admin@example.test', displayName: 'Synthetic Process Admin' },
    superSession,
  );
  assert.equal(invited.response.status, 201);
  assert.equal(invited.body.delivery, 'SENT');
  const files = fs.readdirSync(mailbox);
  assert.equal(files.length, 1);
  const mail = JSON.parse(fs.readFileSync(path.join(mailbox, files[0]), 'utf8')),
    link = new URL(mail.text.split('\n')[1]),
    token = new URLSearchParams(link.hash.slice(1)).get('token');
  assert.ok(token);
  assert.ok(!JSON.stringify(invited.body).includes(token));
  assert.equal(
    (await request('POST', '/api/v1/auth/invitations/accept', { token, password })).response.status,
    200,
  );
  const adminSession = await login('process-admin@example.test'),
    draft = { translations: [{ locale: 'ar', name: 'Synthetic process category' }] };
  assert.equal(
    (await request('POST', '/api/v1/admin/categories', draft, superSession)).response.status,
    403,
  );
  assert.equal(
    (await request('GET', '/api/v1/staff/admins', undefined, adminSession)).response.status,
    403,
  );
  assert.equal(
    (await request('POST', '/api/v1/admin/categories', draft, adminSession, { 'x-csrf-token': '' }))
      .response.status,
    403,
  );
  const category = await request('POST', '/api/v1/admin/categories', draft, adminSession);
  assert.equal(category.response.status, 201);
  const categoryBase = '/api/v1/admin/categories';
  const siblings = async (parentId) => {
    const result = await request(
      'GET',
      categoryBase + (parentId ? '?parentId=' + parentId : ''),
      undefined,
      adminSession,
    );
    assert.equal(result.response.status, 200);
    return result.body;
  };
  const detail = async (id) => {
    const result = await request('GET', categoryBase + '/' + id, undefined, adminSession);
    assert.equal(result.response.status, 200);
    return result.body;
  };
  const newChild = async (parentId) => {
    const parent = await detail(parentId);
    const result = await request(
      'POST',
      categoryBase,
      { parentId, expectedParentVersion: parent.version, ...draft },
      adminSession,
    );
    assert.equal(result.response.status, 201);
    return result.body;
  };
  const destination = (await request('POST', categoryBase, draft, adminSession)).body,
    branch = await newChild(category.body.id),
    descendant = await newChild(branch.id),
    sibling = await newChild(category.body.id);
  const crumbs = await request(
    'GET',
    categoryBase + '/' + descendant.id + '/breadcrumbs',
    undefined,
    adminSession,
  );
  assert.deepEqual(
    crumbs.body.items.map((row) => row.id),
    [category.body.id, branch.id, descendant.id],
  );
  const childList = await siblings(category.body.id);
  assert.equal(
    (
      await request(
        'POST',
        categoryBase + '/reorder',
        {
          parentId: category.body.id,
          orderedIds: [...childList.items].reverse().map((row) => row.id),
          expectedListRevision: childList.listRevision,
        },
        adminSession,
      )
    ).response.status,
    200,
  );
  const branchMove = async (parentId, beforeId = null) => {
    const source = await detail(branch.id),
      sourceList = await siblings(source.parentId),
      destinationList = await siblings(parentId);
    const result = await request(
      'POST',
      categoryBase + '/' + branch.id + '/move',
      {
        parentId,
        beforeId,
        expectedVersion: source.version,
        expectedSourceRevision: sourceList.listRevision,
        expectedDestinationRevision: destinationList.listRevision,
      },
      adminSession,
    );
    assert.equal(result.response.status, 200);
    assert.equal(result.body.category.parentId, parentId);
  };
  await branchMove(destination.id);
  await branchMove(null);
  await branchMove(category.body.id, sibling.id);
  assert.equal((await detail(descendant.id)).parentId, branch.id);
  const roots = await siblings(null);
  assert.equal(
    (
      await request(
        'POST',
        categoryBase + '/reorder',
        {
          parentId: null,
          orderedIds: [...roots.items].reverse().map((row) => row.id),
          expectedListRevision: roots.listRevision,
        },
        adminSession,
      )
    ).response.status,
    200,
  );
  const outboxBefore = sql(scratch, 'catalog', 'SELECT count(*) FROM ops.outbox_events', true),
    preview = await request(
      'GET',
      categoryBase + '/' + branch.id + '/deletion-preview',
      undefined,
      adminSession,
    );
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.impact.totalCategoryCount, '2');
  assert.equal(preview.body.impact.descendantCategoryCount, '1');
  assert.equal(
    sql(scratch, 'catalog', 'SELECT count(*) FROM ops.outbox_events', true),
    outboxBefore,
  );
  const selected = await detail(descendant.id);
  assert.equal(
    (
      await request(
        'PATCH',
        categoryBase + '/' + descendant.id,
        {
          expectedVersion: selected.version,
          translations: [{ locale: 'ar', name: 'Synthetic stale-preview edit' }],
        },
        adminSession,
      )
    ).response.status,
    200,
  );
  assert.equal(
    (
      await request(
        'DELETE',
        categoryBase + '/' + branch.id,
        {
          confirm: true,
          expectedVersion: preview.body.category.version,
          previewPrecondition: preview.body.previewPrecondition,
        },
        adminSession,
      )
    ).response.status,
    409,
  );
  const freshPreview = await request(
      'GET',
      categoryBase + '/' + branch.id + '/deletion-preview',
      undefined,
      adminSession,
    ),
    confirmation = {
      confirm: true,
      expectedVersion: freshPreview.body.category.version,
      previewPrecondition: freshPreview.body.previewPrecondition,
    };
  assert.equal(
    (await request('DELETE', categoryBase + '/' + branch.id, confirmation, adminSession)).response
      .status,
    200,
  );
  assert.equal(
    (await request('DELETE', categoryBase + '/' + branch.id, confirmation, adminSession)).response
      .status,
    404,
  );
  assert.equal((await request('GET', '/api/v1/categories/' + descendant.id)).response.status, 404);
  assert.equal((await request('GET', '/api/v1/categories/' + sibling.id)).response.status, 200);
  assert.equal((await request('GET', categoryBase, undefined, superSession)).response.status, 403);
  assert.equal(
    (
      await request('GET', categoryBase, undefined, undefined, {
        'x-user-role': 'ADMIN',
        'x-user-id': adminSession.account.id,
      })
    ).response.status,
    401,
  );
  assert.equal(
    (await request('POST', categoryBase + '/reorder', {}, adminSession, { 'x-csrf-token': '' }))
      .response.status,
    403,
  );
  console.log(
    'PASS B4 navigation -> nested/root reorder -> three branch move directions -> stale preview -> confirmed deletion and public exclusion',
  );
  const dynamicResults = await exerciseDynamicCatalog({
    request,
    adminSession,
    superSession,
    registerImage: async () => {
      const id = randomUUID();
      sql(
        scratch,
        'catalog',
        `BEGIN ISOLATION LEVEL SERIALIZABLE; INSERT INTO catalog.media_asset_refs(id,media_kind,source_version,ready_at) VALUES('${id}','IMAGE',1,clock_timestamp()); COMMIT;`,
        true,
      );
      return id;
    },
    retainedResources: async () =>
      JSON.parse(
        sql(
          scratch,
          'catalog',
          "SELECT jsonb_build_object('types',(SELECT count(*) FROM catalog.product_types WHERE deleted_at IS NULL),'definitions',(SELECT count(*) FROM catalog.specification_definitions WHERE deleted_at IS NULL),'groups',(SELECT count(*) FROM catalog.specification_groups WHERE deleted_at IS NULL),'assets',(SELECT count(*) FROM catalog.media_asset_refs WHERE deleted_at IS NULL))",
          true,
        ),
      ),
  });
  for (const service of ['media', 'inquiries'])
    assert.equal(
      (await request('GET', '/api/v1/admin/' + service + '/session', undefined, adminSession))
        .response.status,
      200,
    );
  const account = (
    await request('GET', '/api/v1/staff/admins/' + invited.body.account.id, undefined, superSession)
  ).body;
  assert.equal(
    (
      await request(
        'POST',
        '/api/v1/staff/admins/' + account.id + '/disable',
        { expectedVersion: account.version },
        superSession,
      )
    ).response.status,
    200,
  );
  assert.equal(
    (await request('POST', '/api/v1/admin/categories', draft, adminSession)).response.status,
    401,
  );
  assert.equal((await request('GET', '/api/v1/categories')).response.status, 200);
  assert.equal((await request('GET', categoryBase, undefined, adminSession)).response.status, 401);
  assert.equal(
    (await request('POST', '/internal/v1/sessions/introspect', {})).response.status,
    404,
  );
  console.log(
    'PASS CLI -> invitation/mailbox -> Admin login -> live service authorization -> category write -> revocation',
  );
  for (const item of children) {
    const output = item.output();
    for (const value of [
      password,
      token,
      csrfSecret,
      ...Object.values(callers),
      superSession.cookie,
      superSession.csrf,
      adminSession.cookie,
      adminSession.csrf,
      ...Object.values(original.services).map((entry) => entry.password),
    ])
      assert.ok(!output.includes(value), 'Operational output must exclude credentials and tokens.');
  }
  const identity = children.find((item) => item.name === 'identity');
  identity.child.kill();
  await identity.done;
  assert.equal((await request('GET', categoryBase, undefined, adminSession)).response.status, 503);
  assert.equal(
    (await request('POST', '/api/v1/admin/categories', draft, adminSession)).response.status,
    503,
  );
  assert.equal((await request('GET', '/api/v1/categories')).response.status, 200);
  console.log('PASS protected outage failure and independent public reads');
  fs.writeFileSync(
    '.local/identity-process-smoke.json',
    JSON.stringify(
      {
        result: 'passed',
        checkedAt: new Date().toISOString(),
        services: names,
        operatorBootstrap: true,
        invitationLocalDelivery: true,
        adminCategoryWrite: true,
        b4CategoryNavigation: true,
        b4BranchMove: true,
        b4SiblingReorder: true,
        b4StalePreviewProtection: true,
        b4ConfirmedBranchDeletion: true,
        ...dynamicResults,
        liveRevocation: true,
        roleBoundaries: true,
        csrf: true,
        identityOutagePublicRead: true,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  for (const { child } of children)
    if (child.exitCode === null && child.signalCode === null) child.kill();
  await Promise.all(children.map((item) => item.done));
  for (const database of databases)
    sql(original, null, 'DROP DATABASE ' + database + ' WITH (FORCE)');
  for (const entry of fs.readdirSync(mailbox)) fs.unlinkSync(path.join(mailbox, entry));
  fs.rmdirSync(mailbox);
}
