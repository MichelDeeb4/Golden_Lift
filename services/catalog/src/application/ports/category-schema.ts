import type { EffectiveCategorySchema, Uuid } from '@golden-lift/contracts';

/** Owning-service snapshot of the complete bounded category schema. */
export interface CategorySchemaReader {
  schema(categoryId: Uuid): Promise<EffectiveCategorySchema>;
}
