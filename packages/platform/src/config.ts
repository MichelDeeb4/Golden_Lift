import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BusinessService, ServiceName } from '@golden-lift/contracts';
export class ConfigurationError extends Error {}
export interface HttpConfig {
  readonly service: ServiceName;
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
}
export interface DatabaseConfig {
  readonly service: BusinessService;
  readonly connectionString: string;
  readonly max: number;
}
export interface ServiceConfig extends HttpConfig {
  readonly database: DatabaseConfig;
}
const ports: Record<ServiceName, number> = {
  gateway: 3000,
  identity: 3001,
  catalog: 3002,
  media: 3003,
  inquiries: 3004,
};
function integer(value: string | undefined, fallback: number, key: string, max: number): number {
  const selected = value ?? String(fallback);
  if (!/^[0-9]+$/.test(selected) || Number(selected) < 1 || Number(selected) > max)
    throw new ConfigurationError('Invalid ' + key + '.');
  return Number(selected);
}
export function httpConfig(service: ServiceName, env = process.env): HttpConfig {
  let defaultOrigin = '';
  if (env['NODE_ENV'] !== 'production') {
    try {
      defaultOrigin = new URL(env['STAFF_APP_URL'] ?? 'http://127.0.0.1:8082').origin;
    } catch {
      throw new ConfigurationError('Invalid STAFF_APP_URL.');
    }
  }
  const origins = (env['ALLOWED_ORIGINS'] ?? defaultOrigin)
    .split(',')
    .filter(Boolean)
    .map((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new ConfigurationError('Invalid ALLOWED_ORIGINS.');
      }
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.origin !== value ||
        url.username ||
        url.password
      )
        throw new ConfigurationError('Invalid ALLOWED_ORIGINS.');
      return value;
    });
  return {
    service,
    host: env['HOST'] ?? '127.0.0.1',
    port: integer(
      env[service.toUpperCase() + '_PORT'] ?? env['PORT'],
      ports[service],
      'PORT',
      65535,
    ),
    allowedOrigins: origins,
  };
}
export function serviceConfig(
  service: BusinessService,
  env = process.env,
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
): ServiceConfig {
  const key = service.toUpperCase() + '_DATABASE_URL';
  let connectionString = env[key];
  if (!connectionString && env['NODE_ENV'] !== 'production') {
    const file = path.join(root, '.local', 'database.env');
    if (fs.existsSync(file))
      connectionString = fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .find((line) => line.startsWith(key + '='))
        ?.slice(key.length + 1);
  }
  if (!connectionString) throw new ConfigurationError('Missing ' + key + '.');
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new ConfigurationError('Invalid ' + key + '.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    decodeURIComponent(url.username) !== 'golden_lift_' + service + '_runtime' ||
    !url.password ||
    !url.hostname ||
    url.pathname.length < 2
  )
    throw new ConfigurationError(key + ' must use the service runtime login.');
  return {
    ...httpConfig(service, env),
    database: {
      service,
      connectionString,
      max: integer(env['DATABASE_POOL_MAX'], 5, 'DATABASE_POOL_MAX', 50),
    },
  };
}
export function upstreams(env = process.env): Readonly<Record<BusinessService, string>> {
  const result = {} as Record<BusinessService, string>;
  for (const service of ['identity', 'catalog', 'media', 'inquiries'] as const) {
    const value =
      env[service.toUpperCase() + '_SERVICE_URL'] ?? 'http://127.0.0.1:' + ports[service];
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ConfigurationError('Invalid service URL.');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['', '/'].includes(url.pathname)
    )
      throw new ConfigurationError('Invalid service URL.');
    if (env['NODE_ENV'] === 'production' && url.protocol !== 'https:')
      throw new ConfigurationError('Production upstreams require HTTPS.');
    result[service] = url.origin;
  }
  return result;
}
