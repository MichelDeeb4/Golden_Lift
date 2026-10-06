import type {
  CatalogTranslation,
  EffectiveTypeSchema,
  ProductAttributeValue,
  ProductDto,
  Uuid,
  Version,
} from '@golden-lift/contracts';
export interface ProductCreate {
  readonly active?: boolean;
  readonly categoryId: Uuid;
  readonly productTypeId: Uuid;
  readonly coverAssetId: Uuid;
  readonly modelCode: string | null;
  readonly translations: readonly CatalogTranslation[];
  readonly expectedSchemaRevision: Version;
  readonly expectedCategoryVersion: Version;
  readonly values: readonly ProductAttributeValue[];
}
export interface ProductWrite {
  readonly translations?: readonly CatalogTranslation[];
  readonly coverAssetId?: Uuid;
  readonly modelCode?: string | null;
  readonly values: readonly ProductAttributeValue[];
}
export interface ProductRepository {
  find(id: Uuid): Promise<ProductDto | null>;
  create(id: Uuid, mediaId: Uuid, codeId: Uuid, input: ProductCreate): Promise<void>;
  save(id: Uuid, expectedVersion: Version, input: ProductWrite): Promise<void>;
  productsByType(typeId: Uuid, limit: number): Promise<readonly ProductDto[]>;
  impactState(typeIds: readonly Uuid[]): Promise<string>;
  retainedDefinitionUsage(id: Uuid): Promise<boolean>;
  technicalTypeChangeBlocked(productId: Uuid): Promise<boolean>;
  changeType(
    id: Uuid,
    typeId: Uuid,
    expectedVersion: Version,
    values: readonly ProductAttributeValue[],
  ): Promise<void>;
  move(id: Uuid, categoryId: Uuid, expectedVersion: Version): Promise<void>;
  validateLocalReferences(input: Pick<ProductCreate, 'categoryId' | 'coverAssetId'>): Promise<void>;
  schemaFor(id: Uuid): Promise<EffectiveTypeSchema>;
}
