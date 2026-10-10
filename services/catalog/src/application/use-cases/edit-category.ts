import { ApplicationError } from '@business-platform/contracts';
import type { AuthenticatedActor, CategoryDto, Uuid, Version } from '@business-platform/contracts';
import { categoryDraft, requireContentAdmin } from '../../domain/category.js';
import type { Translation } from '../../domain/category.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
export class EditCategory {
  constructor(
    private readonly unitOfWork: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(
    id: Uuid,
    expectedVersion: Version,
    translations: readonly Translation[],
    actor: AuthenticatedActor,
    coverAssetId?: Uuid | null,
  ): Promise<CategoryDto> {
    requireContentAdmin(actor);
    const draft = categoryDraft({ parentId: null, expectedParentVersion: null, translations });
    const eventId = this.ids.newUuid(),
      correlationId = this.ids.newUuid(),
      occurredAt = this.clock.now();
    return this.unitOfWork.execute(async ({ categories, outbox }) => {
      if (!(await categories.find(id, 'ar')))
        throw new ApplicationError('NOT_FOUND', 'Category not found.');
      const nextVersion = await categories.touch(id, expectedVersion, coverAssetId);
      await categories.putTranslations(id, draft.translations);
      await outbox.append({
        id: eventId,
        type: 'catalog.category.updated.v1',
        schemaVersion: 1,
        producer: 'catalog',
        occurredAt,
        correlationId,
        aggregate: { type: 'Category', key: id, version: nextVersion },
        data: { categoryId: id },
      });
      const result = await categories.find(id, 'ar');
      if (!result)
        throw new ApplicationError('INTERNAL_ERROR', 'Edited category could not be read.');
      return result;
    });
  }
}
