import { ApplicationError } from '@golden-lift/contracts';
import type {
  AuthenticatedActor,
  MoveCategoryInput,
  CategoryMoveResult,
  Uuid,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { maximumReorderSize, orderBetween, requireRevision } from '../../domain/category-order.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
export class MoveCategory {
  constructor(
    private readonly transactions: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(
    id: Uuid,
    input: MoveCategoryInput,
    actor: AuthenticatedActor,
  ): Promise<CategoryMoveResult> {
    requireContentAdmin(actor);
    const eventId = this.ids.newUuid(),
      correlationId = this.ids.newUuid(),
      occurredAt = this.clock.now();
    return this.transactions.execute(async ({ navigation, tree, categories, outbox }) => {
      const source = await navigation.detail(id, 'ar');
      if (!source) throw new ApplicationError('NOT_FOUND', 'Category not found.');
      requireRevision(input.expectedVersion, source.version);
      requireRevision(input.expectedSourceRevision, await navigation.revision(source.parentId));
      requireRevision(input.expectedDestinationRevision, await navigation.revision(input.parentId));
      if (input.parentId) {
        const parent = await navigation.detail(input.parentId, 'ar');
        if (!parent) throw new ApplicationError('NOT_FOUND', 'Destination category not found.');
        if (await navigation.isDescendant(input.parentId, id))
          throw new ApplicationError(
            'INVALID_STATE',
            'Cannot move a category into its own branch.',
          );
        if (!parent.canAddChildren)
          throw new ApplicationError(
            'INVALID_STATE',
            'A product-bearing category cannot receive child categories.',
          );
      }
      if (input.beforeId === id)
        throw new ApplicationError(
          'VALIDATION_FAILED',
          'A category cannot be its own position anchor.',
        );
      const place = await navigation.placement(input.parentId, id, input.beforeId);
      const changed = source.parentId !== input.parentId || place.currentNextId !== input.beforeId;
      if (changed) {
        let sortOrder = orderBetween(
          place.previous?.sortOrder ?? null,
          place.next?.sortOrder ?? null,
        );
        if (sortOrder === null) {
          const siblings = await navigation.siblings(input.parentId, maximumReorderSize + 1);
          if (siblings.length > maximumReorderSize)
            throw new ApplicationError(
              'INVALID_STATE',
              'Ordering gap recovery requires at most 500 siblings; this operation was not applied.',
            );
          const ordered = siblings.filter((row) => row.id !== id),
            index =
              input.beforeId === null
                ? ordered.length
                : ordered.findIndex((row) => row.id === input.beforeId);
          ordered.splice(index, 0, { id, version: source.version, sortOrder: source.sortOrder });
          if (ordered.length > maximumReorderSize)
            throw new ApplicationError(
              'INVALID_STATE',
              'Ordering gap recovery includes at most 500 siblings; this operation was not applied.',
            );
          for (const [offset, row] of ordered.entries()) {
            const order = (BigInt(offset + 1) * 1024n).toString();
            if (row.id === id) sortOrder = order;
            else if (row.sortOrder !== order)
              await tree.position(row.id, row.version, input.parentId, order);
          }
        }
        if (sortOrder === null)
          throw new ApplicationError('INTERNAL_ERROR', 'Category order could not be calculated.');
        const nextVersion = await tree.position(id, source.version, input.parentId, sortOrder);
        const parents = new Set([source.parentId, input.parentId]);
        for (const parentId of parents)
          if (parentId) {
            const parent = await navigation.detail(parentId, 'ar');
            if (!parent) throw new ApplicationError('NOT_FOUND', 'Parent category not found.');
            await categories.touch(parentId, parent.version);
          }
        await outbox.append({
          id: eventId,
          type: 'catalog.category.moved.v1',
          schemaVersion: 1,
          producer: 'catalog',
          occurredAt,
          correlationId,
          aggregate: { type: 'Category', key: id, version: nextVersion },
          data: {
            categoryId: id,
            previousParentId: source.parentId,
            parentId: input.parentId,
            beforeId: input.beforeId,
          },
        });
      }
      const category = await navigation.detail(id, 'ar');
      if (!category)
        throw new ApplicationError('INTERNAL_ERROR', 'Moved category could not be read.');
      return {
        category,
        changed,
        sourceListRevision: await navigation.revision(source.parentId),
        destinationListRevision: await navigation.revision(input.parentId),
      };
    });
  }
}
