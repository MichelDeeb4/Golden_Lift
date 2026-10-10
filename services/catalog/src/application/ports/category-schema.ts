import type { EffectiveCategorySchema, Uuid } from '@business-platform/contracts';

/** Owning-service snapshot of the complete bounded category schema. */
export interface CategorySchemaReader {
  schema(categoryId: Uuid): Promise<EffectiveCategorySchema>;
}
