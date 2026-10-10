import { ApplicationError } from '@business-platform/contracts';
import type { DeletionImpact, Uuid } from '@business-platform/contracts';
import type { CatalogDeletionImpact } from '../../application/use-cases/delete-media.js';
export class HttpCatalogDeletionImpact implements CatalogDeletionImpact {
  constructor(
    private readonly origin: string,
    private readonly token: string | undefined,
  ) {}
  async impact(id: Uuid): Promise<DeletionImpact> {
    if (!this.token)
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Media–Catalog coordination is not configured.',
      );
    try {
      const response = await fetch(this.origin + '/internal/v1/media/' + id + '/deletion-impact', {
        headers: { authorization: 'Bearer ' + this.token },
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (response.status === 409)
        throw new ApplicationError(
          'DELETE_ALREADY_IN_PROGRESS',
          'Media deletion is already in progress.',
        );
      if (!response.ok) throw new Error('Catalog unavailable');
      const value = (await response.json()) as unknown;
      if (!isImpact(value)) throw new Error('Invalid Catalog response');
      return value;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Media deletion impact is unavailable.');
    }
  }
}
function isImpact(value: unknown): value is DeletionImpact {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v['allowed'] !== 'boolean' ||
    v['permanent'] !== true ||
    typeof v['expectedVersion'] !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(v['expectedVersion']) ||
    typeof v['impactRevision'] !== 'string' ||
    !/^d1-[a-f0-9]{64}$/.test(v['impactRevision'])
  )
    return false;
  for (const key of [
    'blockingDependencies',
    'cascadingDeletes',
    'detachedReferences',
    'unaffectedEntities',
  ])
    if (
      !Array.isArray(v[key]) ||
      !v[key].every(
        (x: unknown) =>
          typeof x === 'object' &&
          x !== null &&
          'type' in x &&
          typeof x.type === 'string' &&
          (!('count' in x) || typeof x.count === 'string'),
      )
    )
      return false;
  const e = v['entity'];
  return (
    typeof e === 'object' &&
    e !== null &&
    'id' in e &&
    typeof e.id === 'string' &&
    'displayName' in e &&
    typeof e.displayName === 'string' &&
    'type' in e &&
    e.type === 'MEDIA' &&
    Array.isArray(v['warnings']) &&
    v['warnings'].every((w: unknown) => typeof w === 'string')
  );
}
