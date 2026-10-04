import { ApplicationError } from '@golden-lift/contracts';
import type {
  AuthenticatedActor,
  ReorderCategoriesInput,
  CategoryOrderResult,
  Uuid,
  Version,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import {
  maximumReorderSize,
  orderedMembership,
  requireRevision,
} from '../../domain/category-order.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
export class ReorderCategories {
  constructor(
    private readonly transactions: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(
    input: ReorderCategoriesInput,
    actor: AuthenticatedActor,
  ): Promise<CategoryOrderResult> {
    requireContentAdmin(actor);
    const eventId = this.ids.newUuid(),
      correlationId = this.ids.newUuid(),
      occurredAt = this.clock.now();
    return this.transactions.execute(async ({ navigation, tree, categories, outbox }) => {
      const parent = input.parentId ? await navigation.detail(input.parentId, 'ar') : null;
      if (input.parentId && !parent)
        throw new ApplicationError('NOT_FOUND', 'Parent category not found.');
      requireRevision(input.expectedListRevision, await navigation.revision(input.parentId));
      const siblings = await navigation.siblings(input.parentId, maximumReorderSize + 1);
      if (siblings.length > maximumReorderSize)
        throw new ApplicationError(
          'INVALID_STATE',
          'Complete-set reorder supports at most 500 siblings; use anchored moves for larger lists.',
        );
      orderedMembership(
        input.orderedIds,
        siblings.map((row) => row.id),
      );
      const changed = input.orderedIds.some((id, index) => siblings[index]?.id !== id);
      if (changed) {
        const byId = new Map(siblings.map((row) => [row.id, row]));
        let changedAnchor: { readonly id: Uuid; readonly version: Version } | null = null;
        for (const [index, id] of input.orderedIds.entries()) {
          const row = byId.get(id);
          if (!row) throw new ApplicationError('INVALID_STATE', 'Category membership changed.');
          const order = (BigInt(index + 1) * 1024n).toString();
          if (order !== row.sortOrder) {
            const nextVersion = await tree.position(id, row.version, input.parentId, order);
            changedAnchor ??= { id, version: nextVersion };
          }
        }
        if (!changedAnchor)
          throw new ApplicationError('INTERNAL_ERROR', 'Reordered category anchor is unavailable.');
        const aggregate = parent
          ? { id: parent.id, version: await categories.touch(parent.id, parent.version) }
          : changedAnchor;
        await outbox.append({
          id: eventId,
          type: 'catalog.categories.reordered.v1',
          schemaVersion: 1,
          producer: 'catalog',
          occurredAt,
          correlationId,
          aggregate: { type: 'Category', key: aggregate.id, version: aggregate.version },
          data: {
            categoryId: aggregate.id,
            parentId: input.parentId,
            count: siblings.length,
            listRevision: await navigation.revision(input.parentId),
          },
        });
      }
      return {
        parentId: input.parentId,
        changed,
        listRevision: await navigation.revision(input.parentId),
        items: await navigation.siblings(input.parentId, maximumReorderSize),
      };
    });
  }
}
