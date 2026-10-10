import type { EffectiveCategorySchema, Uuid, Version } from '@business-platform/contracts';

export type RelationshipTarget = {
  readonly resource: 'categories' | 'groups' | 'definitions';
  readonly id: Uuid;
};
export interface RelationshipSnapshot {
  readonly version: Version;
  readonly orderedIds: readonly Uuid[];
  readonly state: string;
  readonly categoryIds: readonly Uuid[];
}
/** Ordered replacements of the same two joins; removing links retains entities and values. */
export interface CatalogRelationships {
  snapshot(
    target: RelationshipTarget,
    proposedIds?: readonly Uuid[],
  ): Promise<RelationshipSnapshot>;
  replace(target: RelationshipTarget, orderedIds: readonly Uuid[]): Promise<void>;
  prospectiveSchema(
    categoryId: Uuid,
    target: RelationshipTarget,
    orderedIds: readonly Uuid[],
  ): Promise<EffectiveCategorySchema>;
}
