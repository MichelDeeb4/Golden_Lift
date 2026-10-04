import { ApplicationError, eventEnvelope, version } from '@golden-lift/contracts';
import type { EventEnvelope, Uuid, Version } from '@golden-lift/contracts';
import type { CategoryTreeWriter } from '../../application/ports/category-tree.js';
import type { Database } from './client.js';
import type { Prisma } from './generated/client.js';
export class PrismaCategoryTreeWriter implements CategoryTreeWriter {
  constructor(private readonly database: Database) {}
  async position(
    id: Uuid,
    expectedVersion: Version,
    parentId: Uuid | null,
    sortOrder: string,
  ): Promise<Version> {
    const [row] = await this.database.categories.updateManyAndReturn({
      where: { id, version: BigInt(expectedVersion), deleted_at: null },
      data: { parent_id: parentId, sort_order: BigInt(sortOrder) },
      select: { version: true },
    });
    if (!row)
      throw new ApplicationError(
        'VERSION_CONFLICT',
        'Category changed; reload before moving or ordering.',
      );
    return version(row.version.toString());
  }
  async softDelete(id: Uuid, expectedVersion: Version, input: EventEnvelope): Promise<void> {
    const event = eventEnvelope(input);
    await this.database
      .$queryRaw`SELECT catalog.soft_delete_branch(${id}::uuid,${expectedVersion}::bigint)`;
    // The reviewed routine owns deletion and inserts exactly one bounded event. Normalize
    // that unpublished transaction-local record instead of appending a duplicate event.
    const existing = await this.database.outboxEvents.findFirst({
      where: {
        aggregate_id: id,
        aggregate_version: BigInt(event.aggregate.version),
        event_type: 'CatalogBranchSoftDeleted',
        published_at: null,
      },
      select: { id: true },
    });
    if (!existing)
      throw new ApplicationError('INTERNAL_ERROR', 'Branch deletion event was not recorded.');
    await this.database.outboxEvents.update({
      where: { id: existing.id },
      data: {
        event_type: event.type,
        payload: {
          ...event,
          id: existing.id,
          aggregate: { ...event.aggregate },
          data: event.data as Prisma.InputJsonObject,
        },
      },
      select: { id: true },
    });
  }
}
