import type { CategoryDto, EventEnvelope, Locale, Uuid, Version } from '@golden-lift/contracts';
import type { ConfigurationCollectionReader } from './configuration-collection.js';
import type { CatalogRelationships } from './catalog-relationships.js';
import type { Translation } from '../../domain/category.js';
import type { CategoryNavigation, CategoryTreeWriter } from './category-tree.js';
import type { CategoryList } from './category-query.js';
import type {
  AttributeDefinitionRepository,
  AttributeGroupRepository,
  SchemaChangeReader,
  UnitRepository,
} from './product-schema.js';
import type { CategorySchemaReader } from './category-schema.js';
import type { ProductRepository } from './products.js';
export type { CategoryCursor, CategoryList } from './category-query.js';
export interface CategoryRepository {
  find(id: Uuid, locale: Locale): Promise<CategoryDto | null>;
  list(input: CategoryList): Promise<readonly CategoryDto[]>;
  hasLeafContent(id: Uuid): Promise<boolean>;
  touch(id: Uuid, expectedVersion: Version, coverAssetId?: Uuid | null): Promise<Version>;
  insert(
    id: Uuid,
    parentId: Uuid | null,
    coverAssetId?: Uuid | null,
    sortOrder?: string,
  ): Promise<void>;
  putTranslations(id: Uuid, translations: readonly Translation[]): Promise<void>;
}
export interface Outbox {
  append(event: EventEnvelope): Promise<void>;
}
export interface CatalogRepositories {
  readonly relationships: CatalogRelationships;
  readonly configurationCollection: ConfigurationCollectionReader;
  readonly categorySchemas: CategorySchemaReader;
  readonly definitions: AttributeDefinitionRepository;
  readonly groups: AttributeGroupRepository;
  readonly units: UnitRepository;
  readonly products: ProductRepository;
  readonly schemaChanges: SchemaChangeReader;
  readonly categories: CategoryRepository;
  readonly navigation: CategoryNavigation;
  readonly tree: CategoryTreeWriter;
  readonly outbox: Outbox;
}
export interface CatalogUnitOfWork {
  execute<T>(work: (repositories: CatalogRepositories) => Promise<T>): Promise<T>;
}
export interface IdGenerator {
  newUuid(): Uuid;
}
export interface Clock {
  now(): string;
}

export type CategoryReader = Pick<CategoryRepository, 'find' | 'list'>;
