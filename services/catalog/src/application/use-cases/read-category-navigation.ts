import { ApplicationError } from '@business-platform/contracts';
import type { AuthenticatedActor, Locale, Uuid } from '@business-platform/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { requireRevision } from '../../domain/category-order.js';
import type { CatalogUnitOfWork, CategoryCursor } from '../ports/catalog.js';
export class ReadCategoryNavigation {
  constructor(private readonly transactions: CatalogUnitOfWork) {}
  detail(id: Uuid, language: Locale, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.transactions.execute(async ({ navigation }) => {
      const category = await navigation.detail(id, language);
      if (!category) throw new ApplicationError('NOT_FOUND', 'Category not found.');
      return category;
    });
  }
  list(
    input: {
      readonly parentId: Uuid | null;
      readonly locale: Locale;
      readonly limit: number;
      readonly after: CategoryCursor | null;
      readonly expectedRevision: string | null;
      readonly movingId: Uuid | null;
    },
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    return this.transactions.execute(async ({ navigation }) => {
      if (input.parentId && !(await navigation.detail(input.parentId, input.locale)))
        throw new ApplicationError('NOT_FOUND', 'Parent category not found.');
      if (input.movingId) {
        if (!(await navigation.detail(input.movingId, input.locale)))
          throw new ApplicationError('NOT_FOUND', 'Moving category not found.');
        if (input.parentId && (await navigation.isDescendant(input.parentId, input.movingId)))
          throw new ApplicationError(
            'INVALID_STATE',
            'Cannot navigate destinations inside the moving branch.',
          );
      }
      const revision = await navigation.revision(input.parentId);
      if (input.expectedRevision) requireRevision(input.expectedRevision, revision);
      return {
        items: await navigation.list(
          input.parentId,
          input.locale,
          input.limit,
          input.after,
          input.movingId,
        ),
        revision,
        rootRevision: input.movingId ? await navigation.revision(null) : null,
      };
    });
  }
  breadcrumbs(
    id: Uuid,
    language: Locale,
    afterDepth: string,
    limit: number,
    expectedRevision: string | null,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    return this.transactions.execute(async ({ navigation }) => {
      if (!(await navigation.detail(id, language)))
        throw new ApplicationError('NOT_FOUND', 'Category not found.');
      const result = await navigation.ancestors(id, language, afterDepth, limit);
      if (expectedRevision) requireRevision(expectedRevision, result.revision);
      return result;
    });
  }
}
