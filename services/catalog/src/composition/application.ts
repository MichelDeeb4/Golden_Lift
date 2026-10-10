import * as DeletionCases from '../application/use-cases/delete-catalog-entities.js';
import { PrismaCatalogDeletionUnitOfWork } from '../infrastructure/prisma/deletion.js';
import {
  CatalogDeletionController,
  CatalogMediaDeletionController,
  DELETION,
} from '../presentation/http/deletion-controller.js';
import { orm } from '../infrastructure/prisma/client.js';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { uuid } from '@business-platform/contracts';
import type { SessionAuthenticator } from '@business-platform/contracts';
import type { HttpConfig } from '@business-platform/platform';
import {
  databaseReady,
  closePersistence,
  httpApplication,
  IdentitySessionClient,
  identityClientConfig,
} from '@business-platform/platform';
import { PrismaCategoryRepository } from '../infrastructure/prisma/category-repository.js';
import { PrismaCategorySchemaReader } from '../infrastructure/prisma/category-schema-reader.js';
import { ReadCategorySchema } from '../application/use-cases/read-category-schema.js';
import {
  CategorySchemaController,
  CATEGORY_SCHEMA,
} from '../presentation/http/category-schema-controller.js';
import { PrismaProductManagementUnitOfWork } from '../infrastructure/prisma/product-management.js';
import { ManageProducts } from '../application/use-cases/manage-products.js';
import {
  ProductManagementController,
  PRODUCT_MANAGEMENT,
} from '../presentation/http/product-management-controller.js';
import { PrismaMediaRegistry } from '../infrastructure/prisma/media-registry.js';
import { MediaCoordination } from '../application/use-cases/media-coordination.js';
import {
  CatalogMediaController,
  MEDIA_REGISTRY,
  MEDIA_INTERNAL_TOKEN,
} from '../presentation/http/media-controller.js';
import { PrismaCatalogUnitOfWork } from '../infrastructure/prisma/unit-of-work.js';
import { ReadCategories } from '../application/use-cases/read-categories.js';
import { CreateCategory } from '../application/use-cases/create-category.js';
import { EditCategory } from '../application/use-cases/edit-category.js';
import {
  CreateAttributeDefinition,
  CreateAttributeGroup,
  CreateCanonicalUnit,
  CreateAttributeOption,
} from '../application/use-cases/create-catalog-configuration.js';
import { ReadCatalogConfiguration } from '../application/use-cases/read-catalog-configuration.js';
import { ChangeCatalogSchema } from '../application/use-cases/change-catalog-schema.js';
import { CreateProduct, EditProduct } from '../application/use-cases/save-product.js';
import { ReadProducts } from '../application/use-cases/read-products.js';
import { MoveProduct } from '../application/use-cases/move-product.js';
import { ManageCatalogRelationships } from '../application/use-cases/manage-catalog-relationships.js';
import {
  CatalogRelationshipsController,
  CATALOG_RELATIONSHIPS,
} from '../presentation/http/catalog-relationships-controller.js';
import {
  DynamicConfigurationController,
  CONFIGURATION_READER,
  CREATE_DEFINITION,
  CREATE_GROUP,
  CREATE_UNIT,
  CREATE_OPTION,
  SCHEMA_CHANGES,
} from '../presentation/http/dynamic-configuration-controller.js';
import {
  PublicProductsController,
  AdminProductsController,
  READ_PRODUCTS,
  CREATE_PRODUCT,
  EDIT_PRODUCT,
  MOVE_PRODUCT,
} from '../presentation/http/products-controller.js';
import { AuthenticateCategoryAdministrator } from '../application/use-cases/authenticate-category-administrator.js';
import { ReadCategoryNavigation } from '../application/use-cases/read-category-navigation.js';
import { MoveCategory } from '../application/use-cases/move-category.js';
import { ReorderCategories } from '../application/use-cases/reorder-categories.js';
import {
  CategoryTreeController,
  CATEGORY_NAVIGATION,
  MOVE_CATEGORY,
  REORDER_CATEGORIES,
} from '../presentation/http/category-tree-controller.js';
import {
  CategoriesController,
  READ_CATEGORIES,
} from '../presentation/http/categories-controller.js';
import {
  AdminCategoriesController,
  CREATE_CATEGORY,
  EDIT_CATEGORY,
  STAFF_AUTHENTICATOR,
} from '../presentation/http/admin-categories-controller.js';
export function catalogApplication(
  config: HttpConfig,
  pool: pg.Pool,
  authentication: SessionAuthenticator = new IdentitySessionClient(identityClientConfig('catalog')),
) {
  const database = orm(pool),
    transactions = new PrismaCatalogUnitOfWork(database),
    dynamicTransactions = new PrismaCatalogUnitOfWork(database, 3, true),
    ids = { newUuid: () => uuid(randomUUID()) },
    clock = { now: () => new Date().toISOString() };
  const deletionUow = new PrismaCatalogDeletionUnitOfWork(database);
  const deletionCases = {
    productImpact: new DeletionCases.GetProductDeletionImpact(deletionUow),
    product: new DeletionCases.DeleteProduct(deletionUow, ids),
    mediaImpact: new DeletionCases.GetMediaDeletionImpact(deletionUow),
    media: new DeletionCases.DeleteMedia(deletionUow, ids),
    attributeImpact: new DeletionCases.GetAttributeDeletionImpact(deletionUow),
    attribute: new DeletionCases.DeleteAttribute(deletionUow, ids, clock),
    groupImpact: new DeletionCases.GetAttributeGroupDeletionImpact(deletionUow),
    group: new DeletionCases.DeleteAttributeGroup(deletionUow, ids, clock),
    unitImpact: new DeletionCases.GetUnitDeletionImpact(deletionUow),
    unit: new DeletionCases.DeleteUnit(deletionUow, ids, clock),
    categoryImpact: new DeletionCases.GetCategoryDeletionImpact(deletionUow),
    category: new DeletionCases.DeleteCategoryTree(deletionUow, ids),
    operation: new DeletionCases.GetDeletionOperation(deletionUow),
  };
  return httpApplication(config, {
    ready: () => databaseReady(pool),
    shutdown: () => closePersistence(database, pool),
    controllers: [
      CatalogDeletionController,
      CatalogMediaDeletionController,
      CatalogRelationshipsController,
      CategoriesController,
      ProductManagementController,
      AdminCategoriesController,
      CategoryTreeController,
      CategorySchemaController,
      PublicProductsController,
      AdminProductsController,
      DynamicConfigurationController,
      CatalogMediaController,
    ],
    providers: [
      { provide: DELETION, useValue: deletionCases },
      {
        provide: CATALOG_RELATIONSHIPS,
        useValue: new ManageCatalogRelationships(dynamicTransactions, ids, clock),
      },
      {
        provide: CATEGORY_SCHEMA,
        useValue: new ReadCategorySchema(new PrismaCategorySchemaReader(database)),
      },
      {
        provide: MEDIA_REGISTRY,
        useValue: new MediaCoordination(new PrismaMediaRegistry(database, 300)),
      },
      { provide: MEDIA_INTERNAL_TOKEN, useValue: process.env['MEDIA_CATALOG_TOKEN'] },
      {
        provide: CONFIGURATION_READER,
        useValue: new ReadCatalogConfiguration(dynamicTransactions),
      },
      {
        provide: CREATE_DEFINITION,
        useValue: new CreateAttributeDefinition(dynamicTransactions, ids, clock),
      },
      {
        provide: CREATE_GROUP,
        useValue: new CreateAttributeGroup(dynamicTransactions, ids, clock),
      },
      { provide: CREATE_UNIT, useValue: new CreateCanonicalUnit(dynamicTransactions, ids, clock) },
      {
        provide: CREATE_OPTION,
        useValue: new CreateAttributeOption(dynamicTransactions, ids, clock),
      },
      {
        provide: SCHEMA_CHANGES,
        useValue: new ChangeCatalogSchema(dynamicTransactions, ids, clock),
      },
      {
        provide: PRODUCT_MANAGEMENT,
        useValue: new ManageProducts(new PrismaProductManagementUnitOfWork(database), ids, clock),
      },
      { provide: READ_PRODUCTS, useValue: new ReadProducts(dynamicTransactions) },
      { provide: CREATE_PRODUCT, useValue: new CreateProduct(dynamicTransactions, ids, clock) },
      { provide: EDIT_PRODUCT, useValue: new EditProduct(dynamicTransactions, ids, clock) },
      { provide: MOVE_PRODUCT, useValue: new MoveProduct(dynamicTransactions, ids, clock) },
      {
        provide: READ_CATEGORIES,
        useValue: new ReadCategories(new PrismaCategoryRepository(database)),
      },
      { provide: CREATE_CATEGORY, useValue: new CreateCategory(transactions, ids, clock) },
      { provide: EDIT_CATEGORY, useValue: new EditCategory(transactions, ids, clock) },
      { provide: CATEGORY_NAVIGATION, useValue: new ReadCategoryNavigation(transactions) },
      { provide: MOVE_CATEGORY, useValue: new MoveCategory(transactions, ids, clock) },
      { provide: REORDER_CATEGORIES, useValue: new ReorderCategories(transactions, ids, clock) },
      {
        provide: STAFF_AUTHENTICATOR,
        useValue: new AuthenticateCategoryAdministrator(authentication),
      },
    ],
  }).catch(async (error: unknown) => {
    await database.$disconnect();
    throw error;
  });
}
