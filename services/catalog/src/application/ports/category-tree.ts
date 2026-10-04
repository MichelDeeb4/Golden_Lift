import type {
  AdminCategoryDto,
  BranchDeletionImpact,
  CategoryDto,
  EventEnvelope,
  Locale,
  Uuid,
  Version,
} from '@golden-lift/contracts';
import type { CategoryCursor } from './category-query.js';
export interface Sibling {
  readonly id: Uuid;
  readonly sortOrder: string;
  readonly version: Version;
}
export interface CategoryNavigation {
  detail(id: Uuid, locale: Locale): Promise<AdminCategoryDto | null>;
  list(
    parentId: Uuid | null,
    locale: Locale,
    limit: number,
    after: CategoryCursor | null,
    movingId: Uuid | null,
  ): Promise<readonly AdminCategoryDto[]>;
  revision(parentId: Uuid | null): Promise<string>;
  ancestors(
    id: Uuid,
    locale: Locale,
    afterDepth: string,
    limit: number,
  ): Promise<{
    readonly items: readonly CategoryDto[];
    readonly depths: readonly string[];
    readonly revision: string;
  }>;
  isDescendant(id: Uuid, ancestorId: Uuid): Promise<boolean>;
  siblings(parentId: Uuid | null, limit: number): Promise<readonly Sibling[]>;
  placement(
    parentId: Uuid | null,
    movingId: Uuid,
    beforeId: Uuid | null,
  ): Promise<{
    readonly previous: Sibling | null;
    readonly next: Sibling | null;
    readonly currentNextId: Uuid | null;
  }>;
  deletionState(
    id: Uuid,
  ): Promise<{ readonly impact: BranchDeletionImpact; readonly precondition: string }>;
}
export interface CategoryTreeWriter {
  position(
    id: Uuid,
    expectedVersion: Version,
    parentId: Uuid | null,
    sortOrder: string,
  ): Promise<Version>;
  softDelete(id: Uuid, expectedVersion: Version, event: EventEnvelope): Promise<void>;
}
