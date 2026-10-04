import { ApplicationError } from '@golden-lift/contracts';
import type { Uuid } from '@golden-lift/contracts';
const minimum = -9223372036854775808n,
  maximum = 9223372036854775807n;
export const maximumReorderSize = 500;
export function orderBetween(previous: string | null, next: string | null): string | null {
  const left = previous === null ? null : BigInt(previous),
    right = next === null ? null : BigInt(next);
  const result =
    left === null
      ? right === null
        ? 1024n
        : right - 1024n
      : right === null
        ? left + 1024n
        : left + (right - left) / 2n;
  return result < minimum ||
    result > maximum ||
    (left !== null && result <= left) ||
    (right !== null && result >= right)
    ? null
    : result.toString();
}
export function requireRevision(expected: string, actual: string): void {
  if (expected !== actual)
    throw new ApplicationError(
      'VERSION_CONFLICT',
      'Category scope changed; reload the list or preview.',
    );
}
export function orderedMembership(ids: readonly Uuid[], current: readonly Uuid[]): void {
  if (ids.length > maximumReorderSize)
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Reorder supports at most 500 siblings per request.',
    );
  if (new Set(ids).size !== ids.length)
    throw new ApplicationError('VALIDATION_FAILED', 'Duplicate category IDs.');
  const present = new Set(current);
  if (ids.length !== current.length || ids.some((id) => !present.has(id)))
    throw new ApplicationError(
      'INVALID_STATE',
      'Supply the complete active sibling set for this parent.',
    );
}
