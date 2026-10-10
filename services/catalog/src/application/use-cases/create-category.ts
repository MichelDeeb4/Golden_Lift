import { ApplicationError } from '@business-platform/contracts';
import type { AuthenticatedActor, CategoryDto, EventEnvelope } from '@business-platform/contracts';
import { categoryDraft, requireContentAdmin } from '../../domain/category.js';
import { orderBetween } from '../../domain/category-order.js';
import type { CategoryDraft } from '../../domain/category.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
import { relationshipIds } from './manage-catalog-relationships.js';
export class CreateCategory {
  constructor(
    private readonly unitOfWork: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: CategoryDraft, actor: AuthenticatedActor): Promise<CategoryDto> {
    requireContentAdmin(actor);
    const draft = categoryDraft(input),
      id = this.ids.newUuid(),
      eventId = this.ids.newUuid(),
      correlationId = this.ids.newUuid(),
      occurredAt = this.clock.now();
    const groupIds = relationshipIds(draft.groupIds ?? []);
    return this.unitOfWork.execute(async ({ categories, navigation, outbox, relationships }) => {
      if (draft.parentId !== null && draft.expectedParentVersion !== null) {
        if (!(await categories.find(draft.parentId, 'ar')))
          throw new ApplicationError('NOT_FOUND', 'Parent category not found.');
        if (await categories.hasLeafContent(draft.parentId))
          throw new ApplicationError(
            'INVALID_STATE',
            'A category containing products or attribute groups cannot contain child categories.',
          );
        await categories.touch(draft.parentId, draft.expectedParentVersion);
      }
      const placement = await navigation.placement(draft.parentId, id, null);
      const sortOrder = orderBetween(placement.previous?.sortOrder ?? null, null);
      if (sortOrder === null)
        throw new ApplicationError(
          'INVALID_STATE',
          'Sibling order is exhausted; review and reorder the sibling list before creating another category.',
        );
      await categories.insert(id, draft.parentId, draft.coverAssetId ?? null, sortOrder);
      await categories.putTranslations(id, draft.translations);
      if (groupIds.length) await relationships.replace({ resource: 'categories', id }, groupIds);
      const result = await categories.find(id, 'ar');
      if (!result)
        throw new ApplicationError('INTERNAL_ERROR', 'Created category could not be read.');
      const event: EventEnvelope = {
        id: eventId,
        type: 'catalog.category.created.v1',
        schemaVersion: 1,
        producer: 'catalog',
        occurredAt,
        correlationId,
        aggregate: { type: 'Category', key: id, version: result.version },
        data: { categoryId: id, parentId: draft.parentId },
      };
      await outbox.append(event);
      return result;
    });
  }
}
