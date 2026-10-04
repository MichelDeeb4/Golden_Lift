import {
  ApplicationError,
  locale,
  record,
  uuid,
  revisionPrecondition,
} from '@golden-lift/contracts';
import type { Locale, Uuid } from '@golden-lift/contracts';
import type { CategoryCursor } from '../../application/ports/catalog.js';
export function strictRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const item = record(value);
  if (Object.keys(item).some((key) => !keys.includes(key)))
    throw new ApplicationError('VALIDATION_FAILED', 'Unsupported request field.');
  return item;
}
export function pageSize(value: unknown): number {
  const result =
    value === undefined
      ? 20
      : typeof value === 'string' && /^[0-9]{1,3}$/.test(value)
        ? Number(value)
        : 0;
  if (result < 1 || result > 100)
    throw new ApplicationError('VALIDATION_FAILED', 'Page size must be between 1 and 100.');
  return result;
}
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
export function decodeCursor(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return null;
  try {
    if (typeof value !== 'string' || value.length > 1024 || !/^[a-zA-Z0-9_-]+$/.test(value))
      throw new Error();
    return record(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown);
  } catch {
    throw new ApplicationError('VALIDATION_FAILED', 'Malformed category pagination cursor.');
  }
}
export function listQuery(value: unknown, movingId: Uuid | null) {
  const query = strictRecord(value, ['parentId', 'locale', 'limit', 'cursor']),
    parentId = query['parentId'] === undefined ? null : uuid(query['parentId']),
    language = locale(query['locale']),
    limit = pageSize(query['limit']);
  const cursor = decodeCursor(query['cursor']);
  let after: CategoryCursor | null = null,
    expectedRevision: string | null = null;
  if (cursor) {
    const order = cursor['sortOrder'];
    if (
      Object.keys(cursor).some(
        (key) =>
          !['kind', 'parentId', 'locale', 'movingId', 'id', 'sortOrder', 'revision'].includes(key),
      ) ||
      cursor['kind'] !== 'admin-list' ||
      cursor['parentId'] !== parentId ||
      cursor['locale'] !== language ||
      cursor['movingId'] !== movingId ||
      typeof order !== 'string' ||
      !/^-?(?:0|[1-9][0-9]{0,18})$/.test(order) ||
      BigInt(order) < -9223372036854775808n ||
      BigInt(order) > 9223372036854775807n
    )
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Cursor does not match this category query scope.',
      );
    after = { id: uuid(cursor['id']), sortOrder: order };
    expectedRevision = revisionPrecondition(cursor['revision']);
  }
  return { parentId, locale: language, limit, after, expectedRevision, movingId };
}
export function listCursor(
  parentId: Uuid | null,
  language: Locale,
  movingId: Uuid | null,
  last: { id: Uuid; sortOrder: string },
  revision: string,
): string {
  return encodeCursor({
    kind: 'admin-list',
    parentId,
    locale: language,
    movingId,
    id: last.id,
    sortOrder: last.sortOrder,
    revision,
  });
}
export function explicitParent(value: unknown): Uuid | null {
  if (value === undefined)
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Supply parentId explicitly; null means root level.',
    );
  return value === null ? null : uuid(value);
}
