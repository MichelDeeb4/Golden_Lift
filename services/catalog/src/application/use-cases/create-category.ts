import { ApplicationError, version } from '@golden-lift/contracts';
import type { AuthenticatedActor, CategoryDto, EventEnvelope } from '@golden-lift/contracts';
import { categoryDraft, requireContentAdmin } from '../../domain/category.js';
import { orderBetween } from '../../domain/category-order.js';
import type { CategoryDraft } from '../../domain/category.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
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
    return this.unitOfWork.execute(async ({ categories, navigation, outbox }) => {
      if (draft.parentId !== null && draft.expectedParentVersion !== null) {
        if (!(await categories.find(draft.parentId, 'ar')))
          throw new ApplicationError('NOT_FOUND', 'Parent category not found.');
        if (await categories.hasProducts(draft.parentId))
          throw new ApplicationError(
            'INVALID_STATE',
            'A category containing products cannot contain child categories.',
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
      const event: EventEnvelope = {
        id: eventId,
        type: 'catalog.category.created.v1',
        schemaVersion: 1,
        producer: 'catalog',
        occurredAt,
        correlationId,
        aggregate: { type: 'Category', key: id, version: version('1') },
        data: { categoryId: id, parentId: draft.parentId },
      };
      await outbox.append(event);
      const result = await categories.find(id, 'ar');
      if (!result)
        throw new ApplicationError('INTERNAL_ERROR', 'Created category could not be read.');
      return result;
    });
  }
}
