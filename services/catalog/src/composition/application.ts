import { orm } from '../infrastructure/prisma/client.js';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { uuid } from '@golden-lift/contracts';
import type { SessionAuthenticator } from '@golden-lift/contracts';
import type { HttpConfig } from '@golden-lift/platform';
import {
  databaseReady,
  closePersistence,
  httpApplication,
  IdentitySessionClient,
  identityClientConfig,
} from '@golden-lift/platform';
import { PrismaCategoryRepository } from '../infrastructure/prisma/category-repository.js';
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
  CreateProductType,
  CreateAttributeDefinition,
  CreateAttributeGroup,
  CreateCanonicalUnit,
  CreateAttributeOption,
} from '../application/use-cases/create-catalog-configuration.js';
import { ReadCatalogConfiguration } from '../application/use-cases/read-catalog-configuration.js';
import { ChangeCatalogSchema } from '../application/use-cases/change-catalog-schema.js';
import { CreateProduct, EditProduct } from '../application/use-cases/save-product.js';
import { ChangeProductType } from '../application/use-cases/change-product-type.js';
import { ReadProducts } from '../application/use-cases/read-products.js';
import { MoveProduct } from '../application/use-cases/move-product.js';
import {
  DynamicConfigurationController,
  CONFIGURATION_READER,
  CREATE_TYPE,
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
  CHANGE_PRODUCT_TYPE,
  MOVE_PRODUCT,
} from '../presentation/http/products-controller.js';
import { AuthenticateCategoryAdministrator } from '../application/use-cases/authenticate-category-administrator.js';
import { ReadCategoryNavigation } from '../application/use-cases/read-category-navigation.js';
import { MoveCategory } from '../application/use-cases/move-category.js';
import { ReorderCategories } from '../application/use-cases/reorder-categories.js';
import {
  DeleteCategoryBranch,
  PreviewCategoryDeletion,
} from '../application/use-cases/delete-category-branch.js';
import {
  CategoryTreeController,
  CATEGORY_NAVIGATION,
  MOVE_CATEGORY,
  REORDER_CATEGORIES,
  PREVIEW_DELETION,
  DELETE_BRANCH,
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
  return httpApplication(config, {
    ready: () => databaseReady(pool),
    shutdown: () => closePersistence(database, pool),
    controllers: [
      CategoriesController,
      AdminCategoriesController,
      CategoryTreeController,
      PublicProductsController,
      AdminProductsController,
      DynamicConfigurationController,
      CatalogMediaController,
    ],
    providers: [
      {
        provide: MEDIA_REGISTRY,
        useValue: new MediaCoordination(new PrismaMediaRegistry(database, 300)),
      },
      { provide: MEDIA_INTERNAL_TOKEN, useValue: process.env['MEDIA_CATALOG_TOKEN'] },
      {
        provide: CONFIGURATION_READER,
        useValue: new ReadCatalogConfiguration(dynamicTransactions),
      },
      { provide: CREATE_TYPE, useValue: new CreateProductType(dynamicTransactions, ids, clock) },
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
      { provide: READ_PRODUCTS, useValue: new ReadProducts(dynamicTransactions) },
      { provide: CREATE_PRODUCT, useValue: new CreateProduct(dynamicTransactions, ids, clock) },
      { provide: EDIT_PRODUCT, useValue: new EditProduct(dynamicTransactions, ids, clock) },
      {
        provide: CHANGE_PRODUCT_TYPE,
        useValue: new ChangeProductType(dynamicTransactions, ids, clock),
      },
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
      { provide: PREVIEW_DELETION, useValue: new PreviewCategoryDeletion(transactions) },
      { provide: DELETE_BRANCH, useValue: new DeleteCategoryBranch(transactions, ids, clock) },
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
