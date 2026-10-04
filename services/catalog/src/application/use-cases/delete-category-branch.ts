import { ApplicationError, version } from '@golden-lift/contracts';
import type {
  AuthenticatedActor,
  BranchDeletionPreview,
  BranchDeletionResult,
  DeleteBranchInput,
  Uuid,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { requireRevision } from '../../domain/category-order.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
export class PreviewCategoryDeletion {
  constructor(private readonly transactions: CatalogUnitOfWork) {}
  async execute(id: Uuid, actor: AuthenticatedActor): Promise<BranchDeletionPreview> {
    requireContentAdmin(actor);
    return this.transactions.execute(async ({ navigation }) => {
      const category = await navigation.detail(id, 'ar');
      if (!category) throw new ApplicationError('NOT_FOUND', 'Category not found.');
      const state = await navigation.deletionState(id);
      return {
        category,
        impact: state.impact,
        previewPrecondition: state.precondition,
        retention: {
          sharedTechnicalSheets: true,
          mediaRegistrationsAndFiles: true,
          modelCodesRemainReserved: true,
          restorationAvailable: false,
          mediaDeliveryRevoked: false,
        },
      };
    });
  }
}
export class DeleteCategoryBranch {
  constructor(
    private readonly transactions: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(
    id: Uuid,
    input: DeleteBranchInput,
    actor: AuthenticatedActor,
  ): Promise<BranchDeletionResult> {
    requireContentAdmin(actor);
    if (input.confirm !== true)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Explicit branch deletion confirmation is required.',
      );
    const eventId = this.ids.newUuid(),
      correlationId = this.ids.newUuid(),
      occurredAt = this.clock.now();
    return this.transactions.execute(async ({ navigation, tree, categories }) => {
      const category = await navigation.detail(id, 'ar');
      if (!category) throw new ApplicationError('NOT_FOUND', 'Category not found.');
      requireRevision(input.expectedVersion, category.version);
      const state = await navigation.deletionState(id);
      requireRevision(input.previewPrecondition, state.precondition);
      const nextVersion = version((BigInt(category.version) + 1n).toString());
      await tree.softDelete(id, category.version, {
        id: eventId,
        type: 'catalog.category.branch.deleted.v1',
        schemaVersion: 1,
        producer: 'catalog',
        occurredAt,
        correlationId,
        aggregate: { type: 'Category', key: id, version: nextVersion },
        data: {
          categoryId: id,
          categoryCount: state.impact.totalCategoryCount,
          productCount: state.impact.productCount,
        },
      });
      if (category.parentId) {
        const parent = await navigation.detail(category.parentId, 'ar');
        if (!parent) throw new ApplicationError('INVALID_STATE', 'Parent category changed.');
        await categories.touch(parent.id, parent.version);
      }
      return {
        categoryId: id,
        version: nextVersion,
        impact: state.impact,
        sourceListRevision: await navigation.revision(category.parentId),
      };
    });
  }
}
