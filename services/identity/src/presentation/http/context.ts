import type { IncomingMessage } from 'node:http';
import { ApplicationError, record } from '@business-platform/contracts';
import type { PrincipalResult, SecurityTokens } from '../../application/ports/identity.js';
import type { AuthenticateStaff } from '../../application/use-cases/authenticate-staff.js';
import type { ManageAdmins } from '../../application/use-cases/manage-admins.js';
import type { ActionTokens } from '../../application/use-cases/action-tokens.js';
export const IDENTITY_HTTP = Symbol('IdentityHttp');
export interface IdentityHttp {
  readonly authentication: AuthenticateStaff;
  readonly admins: ManageAdmins;
  readonly actions: ActionTokens;
  readonly tokens: SecurityTokens;
  readonly cookieName: string;
  readonly secureCookie: boolean;
  readonly allowedOrigins: readonly string[];
  readonly verifyService: (caller: unknown, authorization: unknown) => boolean;
  readonly rateLimit: (key: string, limit: number) => void;
}
export function body(value: unknown, fields: readonly string[]): Record<string, unknown> {
  const result = record(value);
  if (Object.keys(result).some((key) => !fields.includes(key)))
    throw new ApplicationError('VALIDATION_FAILED', 'Unsupported request field.');
  return result;
}
export function cookie(request: IncomingMessage, name: string): string | null {
  const matches = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + '='));
  return matches.length === 1 ? (matches[0]?.slice(name.length + 1) ?? null) : null;
}
export function requireOrigin(context: IdentityHttp, origin: unknown): void {
  if (typeof origin !== 'string' || !context.allowedOrigins.includes(origin))
    throw new ApplicationError('FORBIDDEN', 'An approved staff Origin is required.');
}
export async function principal(
  context: IdentityHttp,
  request: IncomingMessage,
  mutation = false,
): Promise<PrincipalResult> {
  const token = cookie(request, context.cookieName),
    result = await context.authentication.current(token);
  if (mutation) {
    requireOrigin(context, request.headers.origin);
    const value = request.headers['x-csrf-token'];
    if (!token || !context.tokens.verifyCsrf(token, typeof value === 'string' ? value : null))
      throw new ApplicationError('FORBIDDEN', 'A valid session-bound CSRF token is required.');
  }
  return result;
}
export function setCookie(context: IdentityHttp, token: string, maxAge: number): string {
  return (
    context.cookieName +
    '=' +
    token +
    '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
    maxAge +
    (context.secureCookie ? '; Secure' : '')
  );
}
