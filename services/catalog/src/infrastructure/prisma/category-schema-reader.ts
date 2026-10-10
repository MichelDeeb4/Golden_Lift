import type { EffectiveCategorySchema, Uuid } from '@business-platform/contracts';
import type { CategorySchemaReader } from '../../application/ports/category-schema.js';
import type { PrismaClient } from './client.js';
import { mapFailure } from './unit-of-work.js';
import { PrismaCategorySchemaRepository } from './category-schema-repository.js';
export class PrismaCategorySchemaReader implements CategorySchemaReader {
  constructor(private readonly database: PrismaClient) {}
  async schema(categoryId: Uuid): Promise<EffectiveCategorySchema> {
    try {
      return await this.database.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
          return new PrismaCategorySchemaRepository(tx).schema(categoryId);
        },
        { isolationLevel: 'RepeatableRead', maxWait: 3000, timeout: 10000 },
      );
    } catch (error) {
      throw mapFailure(error);
    }
  }
}
