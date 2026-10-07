import { retryTransaction, sqlState } from '@golden-lift/platform';
import { ApplicationError } from '@golden-lift/contracts';
import type { CatalogRepositories, CatalogUnitOfWork } from '../../application/ports/catalog.js';
import type { PrismaClient } from './client.js';
import { PrismaCategoryRepository } from './category-repository.js';
import { PrismaOutbox } from './outbox.js';
import { PrismaCategoryNavigation } from './category-navigation.js';
import { PrismaCategoryTreeWriter } from './category-tree-writer.js';
import { PrismaProductTypeRepository } from './product-type-repository.js';
import { PrismaAttributeDefinitionRepository } from './attribute-definition-repository.js';
import { PrismaAttributeGroupRepository } from './attribute-group-repository.js';
import { PrismaUnitRepository } from './unit-repository.js';
import { PrismaProductRepository } from './product-repository.js';
import { PrismaSchemaChangeReader } from './schema-change-reader.js';
import { PrismaCategorySchemaRepository } from './category-schema-repository.js';
export function mapFailure(error: unknown): Error {
  if (error instanceof ApplicationError) return error;
  switch (sqlState(error)) {
    case '23503':
    case '23514':
    case '23502':
      return new ApplicationError('INVALID_STATE', 'The change violates Catalog integrity rules.');
    case '23505':
      return new ApplicationError('CONFLICT', 'A conflicting record already exists.');
    case '40001':
    case '40P01':
    case '55P03':
    case '57014':
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Catalog is temporarily busy or unavailable; retry the request.',
      );
    default:
      return new ApplicationError('INTERNAL_ERROR', 'The Catalog change could not be completed.');
  }
}
export class PrismaCatalogUnitOfWork implements CatalogUnitOfWork {
  constructor(
    private readonly database: PrismaClient,
    private readonly maxAttempts = 3,
    private readonly requiresDynamicCutover = false,
  ) {}
  async execute<T>(work: (repositories: CatalogRepositories) => Promise<T>): Promise<T> {
    try {
      return await retryTransaction(
        () =>
          this.database.$transaction(
            async (tx) => {
              await tx.$executeRaw`SET LOCAL lock_timeout='3s'`;
              await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
              if (this.requiresDynamicCutover) {
                const [stage] = await tx.$queryRaw<
                  { ready: boolean }[]
                >`SELECT to_regprocedure('catalog.assert_valid_category_catalog()') IS NOT NULL ready`;
                if (!stage?.ready)
                  throw new ApplicationError(
                    'INVALID_STATE',
                    'Catalog requires the approved category classification cutover.',
                  );
              }
              return work({
                categorySchemas: new PrismaCategorySchemaRepository(tx),
                productTypes: new PrismaProductTypeRepository(tx),
                definitions: new PrismaAttributeDefinitionRepository(tx),
                groups: new PrismaAttributeGroupRepository(tx),
                units: new PrismaUnitRepository(tx),
                products: new PrismaProductRepository(tx),
                schemaChanges: new PrismaSchemaChangeReader(tx),
                categories: new PrismaCategoryRepository(tx),
                navigation: new PrismaCategoryNavigation(tx),
                tree: new PrismaCategoryTreeWriter(tx),
                outbox: new PrismaOutbox(tx),
              });
            },
            { isolationLevel: 'Serializable', maxWait: 3000, timeout: 10000 },
          ),
        this.maxAttempts,
      );
    } catch (error) {
      throw mapFailure(error);
    }
  }
}
