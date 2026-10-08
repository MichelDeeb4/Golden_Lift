export const businessServices = ['identity', 'catalog', 'media', 'inquiries'] as const;
export type BusinessService = (typeof businessServices)[number];
export type ServiceName = BusinessService | 'gateway';
export const locales = ['ar', 'en', 'ckb'] as const;
export type Locale = (typeof locales)[number];
export type Uuid = string & { readonly __uuid: unique symbol };
export type Version = string & { readonly __version: unique symbol };
export type Decimal = string & { readonly __decimal: unique symbol };
export type Role = 'ADMIN' | 'SUPER_ADMIN';
export type Capability =
  | 'catalog.content.manage'
  | 'media.assets.manage'
  | 'inquiries.manage'
  | 'identity.admin_accounts.manage';
export interface AuthenticatedActor {
  readonly id: Uuid;
  readonly role: Role;
  readonly authVersion: Version;
}
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'REQUEST_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL_ERROR';
export class ApplicationError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}
export interface ApiError {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly requestId: string;
  };
}
export function uuid(value: unknown): Uuid {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Expected a UUID.');
  return value.toLowerCase() as Uuid;
}
export function version(value: unknown): Version {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Expected a positive bigint version string.');
  return value as Version;
}
export function decimal(value: unknown): Decimal {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value))
    throw new ApplicationError('VALIDATION_FAILED', 'Expected a decimal string.');
  return value as Decimal;
}
export function locale(value: unknown = 'ar'): Locale {
  if (!locales.some((item) => item === value))
    throw new ApplicationError('VALIDATION_FAILED', 'Unsupported locale.');
  return value as Locale;
}
export function revisionPrecondition(value: unknown): string {
  if (typeof value !== 'string' || !/^[lbp]1-[a-f0-9]{64}$/.test(value))
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Expected a scope-bound category precondition.',
    );
  return value;
}
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ApplicationError('VALIDATION_FAILED', 'Expected an object.');
  return value as Record<string, unknown>;
}
export interface CategoryDto {
  readonly id: Uuid;
  readonly parentId: Uuid | null;
  readonly name: string;
  readonly description: string | null;
  readonly slug: string | null;
  readonly locale: Locale;
  readonly resolvedNameLocale: Locale;
  readonly sortOrder: string;
  readonly version: Version;
  readonly coverAssetId?: Uuid | null;
}
export interface Page<T> {
  readonly totalItems?: number;
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export interface EventEnvelope {
  readonly id: Uuid;
  readonly type: string;
  readonly schemaVersion: 1;
  readonly producer: BusinessService;
  readonly occurredAt: string;
  readonly correlationId: Uuid;
  readonly aggregate: { readonly type: string; readonly key: string; readonly version: Version };
  readonly data: Readonly<Record<string, JsonValue>>;
}
function isJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJson(item, depth + 1));
  if (typeof value === 'object' && value !== null)
    return (
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((item) => isJson(item, depth + 1))
    );
  return false;
}
export function eventEnvelope(value: unknown): EventEnvelope {
  const input = record(value),
    aggregate = record(input['aggregate']),
    data = record(input['data']);
  if (
    Object.keys(input).some(
      (key) =>
        ![
          'id',
          'type',
          'schemaVersion',
          'producer',
          'occurredAt',
          'correlationId',
          'aggregate',
          'data',
        ].includes(key),
    ) ||
    Object.keys(aggregate).some((key) => !['type', 'key', 'version'].includes(key))
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Unexpected event envelope field.');
  if (
    input['schemaVersion'] !== 1 ||
    !businessServices.some((service) => service === input['producer']) ||
    typeof input['type'] !== 'string' ||
    !/^[a-z][a-z0-9.]*\.v[1-9][0-9]*$/.test(input['type']) ||
    typeof input['occurredAt'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input['occurredAt']) ||
    !Number.isFinite(Date.parse(input['occurredAt'])) ||
    typeof aggregate['type'] !== 'string' ||
    !aggregate['type'].trim() ||
    typeof aggregate['key'] !== 'string' ||
    !aggregate['key'].trim() ||
    !isJson(data)
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid event envelope.');
  return {
    id: uuid(input['id']),
    type: input['type'],
    schemaVersion: 1,
    producer: input['producer'] as BusinessService,
    occurredAt: input['occurredAt'],
    correlationId: uuid(input['correlationId']),
    aggregate: {
      type: aggregate['type'],
      key: aggregate['key'],
      version: version(aggregate['version']),
    },
    data,
  };
}

export type StaffStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';
export interface StaffAccountDto {
  readonly id: Uuid;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly status: StaffStatus;
  readonly version: Version;
  readonly createdAt: string;
}
export interface StaffSessionDto {
  readonly account: StaffAccountDto;
  readonly expiresAt: string;
  readonly csrfToken: string;
}
export interface StaffRequest {
  readonly sessionToken: string | null;
  readonly csrfToken: string | null;
  readonly origin: string | null;
  readonly mutation: boolean;
}
export interface SessionAuthenticator {
  authenticate(request: StaffRequest): Promise<AuthenticatedActor>;
}
