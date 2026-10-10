import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConfigurationError,
  identitySecurityConfig,
  staffCookieName,
} from '@business-platform/platform';
import type { HttpConfig, IdentitySecurityConfig } from '@business-platform/platform';
import type { IdentityPolicy } from '../application/ports/identity.js';
export interface MailConfig {
  readonly mode: 'local' | 'smtp';
  readonly directory: string;
  readonly staffAppUrl: string;
  readonly sender: string;
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly requireTls: boolean;
  readonly user: string | undefined;
  readonly password: string | undefined;
}
export interface IdentityConfig {
  readonly http: HttpConfig;
  readonly policy: IdentityPolicy;
  readonly security: IdentitySecurityConfig;
  readonly cookieName: string;
  readonly secureCookie: boolean;
  readonly passwordConcurrency: number;
  readonly mail: MailConfig;
}
function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  key: string,
): number {
  const selected = value ?? String(fallback);
  if (!/^[0-9]+$/.test(selected) || Number(selected) < min || Number(selected) > max)
    throw new ConfigurationError('Invalid ' + key + '.');
  return Number(selected);
}
export function identityConfig(http: HttpConfig, env = process.env): IdentityConfig {
  const production = env['NODE_ENV'] === 'production',
    value = env['STAFF_APP_URL'] ?? (production ? '' : 'http://127.0.0.1:8082');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError('Set a valid STAFF_APP_URL.');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['http:', 'https:'].includes(url.protocol) ||
    (production && url.protocol !== 'https:')
  )
    throw new ConfigurationError('Invalid STAFF_APP_URL.');
  const mode = env['IDENTITY_MAIL_TRANSPORT'] ?? (production ? 'smtp' : 'local');
  if (!['local', 'smtp'].includes(mode) || (production && mode !== 'smtp'))
    throw new ConfigurationError('Production requires SMTP delivery.');
  if (
    production &&
    (!env['SMTP_HOST'] || !env['SMTP_USER'] || !env['SMTP_PASSWORD'] || !env['SMTP_FROM'])
  )
    throw new ConfigurationError('Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM.');
  const port = integer(env['SMTP_PORT'], 465, 1, 65535, 'SMTP_PORT');
  const origins = http.allowedOrigins.length ? http.allowedOrigins : [url.origin];
  return {
    http: { ...http, allowedOrigins: origins },
    policy: {
      sessionSeconds: integer(
        env['IDENTITY_SESSION_SECONDS'],
        28800,
        30,
        86400,
        'IDENTITY_SESSION_SECONDS',
      ),
      invitationSeconds: integer(
        env['IDENTITY_INVITATION_SECONDS'],
        86400,
        60,
        604800,
        'IDENTITY_INVITATION_SECONDS',
      ),
      resetSeconds: integer(
        env['IDENTITY_RESET_SECONDS'],
        1800,
        60,
        7200,
        'IDENTITY_RESET_SECONDS',
      ),
    },
    security: identitySecurityConfig(env),
    cookieName: staffCookieName(production),
    secureCookie: production,
    passwordConcurrency: integer(
      env['IDENTITY_PASSWORD_CONCURRENCY'],
      4,
      1,
      16,
      'IDENTITY_PASSWORD_CONCURRENCY',
    ),
    mail: {
      mode: mode as MailConfig['mode'],
      directory:
        env['IDENTITY_MAILBOX_DIRECTORY'] ??
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.local/mailbox'),
      staffAppUrl: url.href.endsWith('/') ? url.href : url.href + '/',
      sender: env['SMTP_FROM'] ?? 'no-reply@business-platform.local',
      host: env['SMTP_HOST'] ?? '127.0.0.1',
      port,
      secure: port === 465,
      requireTls: production,
      user: env['SMTP_USER'],
      password: env['SMTP_PASSWORD'],
    },
  };
}
