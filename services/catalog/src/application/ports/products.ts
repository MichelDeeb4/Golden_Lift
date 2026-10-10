import type {
  CatalogTranslation,
  EffectiveCategorySchema,
  ProductAttributeValue,
  ProductDto,
  Uuid,
  Version,
  PublicProductQuery,
  PublicProductMedia,
  Locale,
  ProductNavigation,
} from '@golden-lift/contracts';
export interface ProductCreate {
  readonly categoryId: Uuid;
  readonly modelCode: string | null;
  readonly translations: readonly CatalogTranslation[];
}
export interface ProductWrite {
  readonly translations?: readonly CatalogTranslation[];
  readonly coverAssetId?: Uuid;
  readonly modelCode?: string | null;
  readonly values: readonly ProductAttributeValue[];
}
export interface ProductRepository {
  publicNavigation(id: Uuid, language: Locale): Promise<ProductNavigation>;
  publicPage(input: PublicProductQuery): Promise<{
    readonly ids: readonly Uuid[];
    readonly hasNextPage: boolean;
    readonly filterIds: readonly Uuid[];
  }>;
  publicContext(
    id: Uuid,
    language: Locale,
  ): Promise<{
    readonly categoryName: string;
    readonly media: readonly PublicProductMedia[];
    readonly documents: readonly {
      readonly assetId: Uuid;
      readonly sheetId: Uuid;
      readonly title: string;
    }[];
  } | null>;
  find(id: Uuid): Promise<ProductDto | null>;
  create(id: Uuid, codeId: Uuid, input: ProductCreate): Promise<void>;
  save(id: Uuid, expectedVersion: Version, input: ProductWrite): Promise<void>;
  productsByCategory(categoryId: Uuid, limit: number): Promise<readonly ProductDto[]>;
  impactState(categoryIds: readonly Uuid[]): Promise<string>;
  retainedDefinitionUsage(id: Uuid): Promise<boolean>;
  move(id: Uuid, categoryId: Uuid, expectedVersion: Version): Promise<void>;
  validateLocalReferences(input: {
    readonly categoryId: Uuid;
    readonly coverAssetId?: Uuid | null;
  }): Promise<void>;
  schemaFor(id: Uuid): Promise<EffectiveCategorySchema>;
}
