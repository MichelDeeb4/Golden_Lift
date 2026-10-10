import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';
import { ApplicationError, record, uuid, version } from '@business-platform/contracts';
import type {
  AuthenticatedActor,
  SessionAuthenticator,
  StaffRequest,
} from '@business-platform/contracts';
import { ConfigurationError } from './config.js';
export type IdentityCaller = 'catalog' | 'media' | 'inquiries';
export interface IdentitySecurityConfig {
  readonly csrfSecret: string;
  readonly callers: Readonly<Record<IdentityCaller, string>>;
}
export interface IdentityClientConfig {
  readonly origin: string;
  readonly caller: IdentityCaller;
  readonly credential: string;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
function local(env: NodeJS.ProcessEnv): Record<string, unknown> {
  if (env['NODE_ENV'] === 'production') return {};
  const file = path.join(root, '.local/service-secrets.json');
  if (!fs.existsSync(file))
    throw new ConfigurationError('Run npm run auth:setup to initialize local service secrets.');
  return record(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown);
}
function secret(value: unknown, key: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(value))
    throw new ConfigurationError('Missing or invalid ' + key + '.');
  return value;
}
export function identitySecurityConfig(env = process.env): IdentitySecurityConfig {
  const config =
      env['IDENTITY_CSRF_SECRET'] && env['IDENTITY_SERVICE_CREDENTIALS'] ? {} : local(env),
    configured = env['IDENTITY_SERVICE_CREDENTIALS'];
  let callerObject: Record<string, unknown>;
  try {
    callerObject = record(configured ? (JSON.parse(configured) as unknown) : config['callers']);
  } catch {
    throw new ConfigurationError('Invalid IDENTITY_SERVICE_CREDENTIALS.');
  }
  const result = {
    csrfSecret: secret(env['IDENTITY_CSRF_SECRET'] ?? config['csrfSecret'], 'IDENTITY_CSRF_SECRET'),
    callers: {
      catalog: secret(callerObject['catalog'], 'Catalog service credential'),
      media: secret(callerObject['media'], 'Media service credential'),
      inquiries: secret(callerObject['inquiries'], 'Inquiries service credential'),
    },
  };
  if (new Set([result.csrfSecret, ...Object.values(result.callers)]).size !== 4)
    throw new ConfigurationError('Identity security keys must be distinct.');
  return result;
}
export function identityClientConfig(
  caller: IdentityCaller,
  env = process.env,
): IdentityClientConfig {
  const provided = env[caller.toUpperCase() + '_IDENTITY_SERVICE_TOKEN'],
    config = provided ? {} : local(env);
  const callers = provided ? {} : record(config['callers']);
  const origin = env['IDENTITY_SERVICE_URL'] ?? 'http://127.0.0.1:3001';
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ConfigurationError('Invalid IDENTITY_SERVICE_URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname) ||
    (env['NODE_ENV'] === 'production' && url.protocol !== 'https:')
  )
    throw new ConfigurationError('Invalid or unencrypted Identity service URL.');
  return {
    origin: url.origin,
    caller,
    credential: secret(
      provided ?? callers[caller],
      caller.toUpperCase() + '_IDENTITY_SERVICE_TOKEN',
    ),
  };
}
export function staffCookieName(production = process.env['NODE_ENV'] === 'production'): string {
  return production ? '__Host-bp_staff' : 'bp_staff';
}
export function staffRequest(request: IncomingMessage, mutation: boolean): StaffRequest {
  const cookies = (request.headers.cookie ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(staffCookieName() + '='));
  const token =
    cookies.length === 1 ? (cookies[0]?.slice(staffCookieName().length + 1) ?? null) : null;
  const csrf = request.headers['x-csrf-token'];
  return {
    sessionToken: token,
    csrfToken: typeof csrf === 'string' ? csrf : null,
    origin: request.headers.origin ?? null,
    mutation,
  };
}
export class IdentitySessionClient implements SessionAuthenticator {
  constructor(private readonly config: IdentityClientConfig) {}
  async authenticate(input: StaffRequest): Promise<AuthenticatedActor> {
    if (!input.sessionToken)
      throw new ApplicationError('UNAUTHENTICATED', 'A valid staff session is required.');
    try {
      const response = await fetch(this.config.origin + '/internal/v1/sessions/introspect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + this.config.credential,
          'x-service-name': this.config.caller,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(2000),
        redirect: 'error',
      });
      if (response.status === 401)
        throw new ApplicationError('UNAUTHENTICATED', 'A valid staff session is required.');
      if (response.status === 403)
        throw new ApplicationError('FORBIDDEN', 'Staff request validation failed.');
      if (!response.ok)
        throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Identity is unavailable.');
      const actor = record((await response.json()) as unknown);
      if (!['ADMIN', 'SUPER_ADMIN'].includes(String(actor['role'])))
        throw new Error('Invalid principal.');
      return {
        id: uuid(actor['id']),
        role: actor['role'] as AuthenticatedActor['role'],
        authVersion: version(actor['authVersion']),
      };
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        ['UNAUTHENTICATED', 'FORBIDDEN', 'DEPENDENCY_UNAVAILABLE'].includes(error.code)
      )
        throw error;
      throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Identity is unavailable.');
    }
  }
}
