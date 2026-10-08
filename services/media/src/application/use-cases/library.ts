import { ApplicationError } from '@golden-lift/contracts';
import type { AuthenticatedActor, Uuid, Version } from '@golden-lift/contracts';
import { requireAdmin } from '../../domain/staff-access.js';
import type { MediaUnitOfWork, CatalogMedia, MediaRepository } from '../ports/media.js';

export class MediaLibrary {
  async statistics(actor: AuthenticatedActor) {
    requireAdmin(actor);
    return this.transactions.execute((r) => r.statistics());
  }
  constructor(
    private readonly transactions: MediaUnitOfWork,
    private readonly catalog: CatalogMedia,
  ) {}
  async page(
    after: Uuid | null,
    limit: number,
    actor: AuthenticatedActor,
    filters: Parameters<MediaRepository['list']>[2] = {},
  ) {
    requireAdmin(actor);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (filters?.search?.length ?? 0) > 120 ||
      (filters?.kind && !['IMAGE', 'VIDEO', 'PDF'].includes(filters.kind)) ||
      (filters?.status && !['UPLOADING', 'PROCESSING', 'READY', 'FAILED'].includes(filters.status))
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid Media pagination.');
    return this.transactions.execute(async (r) => {
      const totalItems = await r.count(filters),
        rows = await r.list(after, limit + 1, filters),
        items = rows.slice(0, limit);
      return { items, totalItems, next: rows.length > limit ? items.at(-1)!.id : null };
    });
  }
  async list(
    after: Uuid | null,
    limit: number,
    actor: AuthenticatedActor,
    filters: Parameters<MediaRepository['list']>[2] = {},
  ) {
    requireAdmin(actor);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid library limit.');
    if (
      (filters?.kind && !['IMAGE', 'VIDEO', 'PDF'].includes(filters.kind)) ||
      (filters?.status && !['UPLOADING', 'PROCESSING', 'READY', 'FAILED'].includes(filters.status))
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid library filters.');
    return this.transactions.execute((r) => r.list(after, limit, filters));
  }
  async detail(id: Uuid, actor: AuthenticatedActor) {
    requireAdmin(actor);
    const asset = await this.transactions.execute((r) => r.asset(id));
    const registration = await this.catalog.registration(id);
    return { asset, registration };
  }
  async usage(id: Uuid, after: number, limit: number, actor: AuthenticatedActor) {
    requireAdmin(actor);
    if (
      !Number.isInteger(after) ||
      after < 0 ||
      after > 100000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid usage pagination.');
    await this.transactions.execute((r) => r.asset(id));
    return this.catalog.usage(id, after, limit);
  }
  async block(id: Uuid, expected: Version, actor: AuthenticatedActor) {
    requireAdmin(actor);
    return this.transactions.execute((r) => r.block(id, expected));
  }
  async retry(id: Uuid, expected: Version, actor: AuthenticatedActor) {
    requireAdmin(actor);
    return this.transactions.execute((r) => r.retry(id, expected));
  }
  async reprocess(id: Uuid, expected: Version, actor: AuthenticatedActor) {
    requireAdmin(actor);
    return this.transactions.execute((r) => r.reprocess(id, expected));
  }
  async retire(id: Uuid, expected: Version, confirmed: boolean, actor: AuthenticatedActor) {
    requireAdmin(actor);
    const asset = await this.transactions.execute((r) => r.asset(id));
    if (asset.deleted) return { status: 'RETIRED' as const };
    if (asset.version !== expected)
      throw new ApplicationError('VERSION_CONFLICT', 'Refresh the asset before retirement.');
    if (!confirmed)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Explicit retirement confirmation is required.',
      );
    // Catalog's reference check and tombstone commit together. Its outbox survives Media response/commit failure.
    const event = await this.catalog.retirement(asset);
    await this.transactions.execute((r) => r.retire(event));
    return { status: 'RETIRED' as const };
  }
}
