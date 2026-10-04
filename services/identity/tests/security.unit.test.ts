import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import {
  ConfigurationError,
  httpConfig,
  identityClientConfig,
  identitySecurityConfig,
} from '@golden-lift/platform';
import {
  emailAddress,
  newPassword,
  displayName,
  requireSuperAdmin,
  requireAdminTarget,
} from '../src/domain/staff.js';
import { NodeArgon2, OpaqueTokens } from '../src/infrastructure/security/crypto.js';
import { ServiceCredentials } from '../src/infrastructure/security/service-credentials.js';
import { BoundedRateLimiter } from '../src/presentation/http/rate-limiter.js';
import { identityConfig } from '../src/infrastructure/config.js';
import { setCookie } from '../src/presentation/http/context.js';
import type { IdentityHttp } from '../src/presentation/http/context.js';
const isCode = (code: string) => (error: unknown) =>
  error instanceof ApplicationError && error.code === code;
const secret = 's'.repeat(43),
  callers = { catalog: 'c'.repeat(43), media: 'm'.repeat(43), inquiries: 'i'.repeat(43) };
test('staff inputs normalize email and preserve Unicode password content', () => {
  assert.equal(emailAddress(' Staff@Example.test '), 'staff@example.test');
  for (const value of ['missing', 'a@-host.test', 'a@host-.test', 'a@host..test'])
    assert.throws(() => emailAddress(value), isCode('VALIDATION_FAILED'));
  const password = ' ' + String.fromCodePoint(0x1f680).repeat(15) + ' ';
  assert.equal(newPassword(password), password);
  for (const value of ['short', ' '.repeat(20), 'x'.repeat(129)])
    assert.throws(() => newPassword(value), isCode('VALIDATION_FAILED'));
  assert.throws(() => displayName('bad\nname'), isCode('VALIDATION_FAILED'));
  const actor = { id: uuid(randomUUID()), role: 'ADMIN' as const, authVersion: version('1') };
  assert.throws(() => requireSuperAdmin(actor), isCode('FORBIDDEN'));
  assert.throws(
    () =>
      requireAdminTarget({
        id: actor.id,
        email: 'super@example.test',
        displayName: 'Super',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        passwordHash: 'synthetic',
        authVersion: actor.authVersion,
        version: version('1'),
        createdAt: new Date().toISOString(),
      }),
    isCode('FORBIDDEN'),
  );
});
test('Argon2id uses unique salts, verifies existing hashes, and bounds password work', async () => {
  const passwords = await NodeArgon2.create(2),
    password = 'A long synthetic password 42';
  const first = await passwords.hash(password),
    second = await passwords.hash(password);
  assert.notEqual(first, second);
  assert.match(first, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await passwords.verify(password, first), true);
  assert.equal(await passwords.verify('wrong', first), false);
  assert.equal(await passwords.verify(password, null), false);
  assert.equal(
    await passwords.verify(
      password,
      '$argon2id$v=19$m=999999999,t=2,p=1$' + 'a'.repeat(22) + '$' + 'b'.repeat(43),
    ),
    false,
  );
  const bounded = await NodeArgon2.create(1),
    pending = bounded.hash(password);
  await assert.rejects(bounded.hash(password), isCode('DEPENDENCY_UNAVAILABLE'));
  await pending;
});
test('random opaque tokens have digests and CSRF tokens bound to one session', () => {
  const tokens = new OpaqueTokens(secret),
    first = tokens.newToken(),
    second = tokens.newToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(tokens.digest(first).length, 64);
  assert.notEqual(tokens.digest(first), first);
  assert.equal(tokens.verifyCsrf(first, tokens.csrf(first)), true);
  assert.equal(tokens.verifyCsrf(second, tokens.csrf(first)), false);
  assert.equal(tokens.verifyCsrf(first, null), false);
  assert.equal(tokens.verifyCsrf(first, 'invalid'), false);
});
test('internal credentials cannot be exchanged between services', () => {
  const auth = new ServiceCredentials({ csrfSecret: secret, callers });
  assert.equal(auth.verify('catalog', 'Bearer ' + callers.catalog), true);
  for (const [caller, credential] of [
    ['media', callers.catalog],
    ['gateway', callers.catalog],
    ['catalog', 'wrong'],
  ])
    assert.equal(auth.verify(caller, 'Bearer ' + credential), false);
});
test('production has no local security or mail fallback and requires HTTPS', () => {
  assert.throws(() => identitySecurityConfig({ NODE_ENV: 'production' }), ConfigurationError);
  assert.throws(
    () =>
      identityClientConfig('catalog', {
        NODE_ENV: 'production',
        CATALOG_IDENTITY_SERVICE_TOKEN: callers.catalog,
        IDENTITY_SERVICE_URL: 'http://identity.test',
      }),
    ConfigurationError,
  );
  const env = {
    NODE_ENV: 'production',
    STAFF_APP_URL: 'https://staff.example.test',
    IDENTITY_CSRF_SECRET: secret,
    IDENTITY_SERVICE_CREDENTIALS: JSON.stringify(callers),
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'synthetic',
    SMTP_PASSWORD: 'synthetic',
    SMTP_FROM: 'staff@example.test',
  };
  const config = identityConfig(httpConfig('identity', env), env);
  assert.equal(config.cookieName, '__Host-gl_staff');
  assert.equal(config.mail.requireTls, true);
  assert.equal(config.secureCookie, true);
  assert.throws(
    () => identityConfig(httpConfig('identity', env), { ...env, IDENTITY_MAIL_TRANSPORT: 'local' }),
    ConfigurationError,
  );
  const cookie = setCookie(
    { cookieName: config.cookieName, secureCookie: true } as IdentityHttp,
    'opaque',
    3600,
  );
  assert.match(cookie, /; HttpOnly; SameSite=Strict; Max-Age=3600; Secure$/);
  assert.ok(!cookie.includes('Domain='));
});
test('rate limiting retains active keys, rejects capacity overflow, and expires buckets', () => {
  let now = 0;
  const limiter = new BoundedRateLimiter(() => now, 1);
  limiter.take('one', 1);
  assert.throws(() => limiter.take('one', 1), isCode('RATE_LIMITED'));
  assert.throws(() => limiter.take('two', 10), isCode('RATE_LIMITED'));
  now = 60001;
  limiter.take('two', 1);
});
