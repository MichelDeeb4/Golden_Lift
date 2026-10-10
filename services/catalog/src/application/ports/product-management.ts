import type {
  EventEnvelope,
  EffectiveCategorySchema,
  Locale,
  ManagedProductDto,
  Page,
  ProductListItem,
  ProductMediaDto,
  Uuid,
  Version,
} from '@golden-lift/contracts';
export interface ProductListInput {
  readonly locale: Locale;
  readonly categoryId?: Uuid;
  readonly text?: string;
  readonly active?: boolean;
  readonly featured?: boolean;
  readonly afterId?: Uuid;
  readonly afterOrder?: string;
  readonly sort?: 'id' | 'manual';
  readonly cursorScope?: string;
  readonly limit: number;
}
export interface PublicationWrite {
  readonly active: boolean;
  readonly featured: boolean;
  readonly sortOrder: string;
  readonly featuredOrder: string;
}
export interface ProductManagementRepository {
  append(event: EventEnvelope): Promise<void>;
  list(input: ProductListInput): Promise<Page<ProductListItem>>;
  detail(id: Uuid): Promise<ManagedProductDto | null>;
  publicationSchema(id: Uuid): Promise<EffectiveCategorySchema>;
  publication(id: Uuid, expectedVersion: Version, input: PublicationWrite): Promise<void>;
  remove(id: Uuid, expectedVersion: Version): Promise<Version>;
  replaceMedia(
    id: Uuid,
    expectedVersion: Version,
    coverAssetId: Uuid,
    media: readonly ProductMediaDto[],
  ): Promise<void>;
}
export interface ProductManagementUnitOfWork {
  execute<T>(work: (repository: ProductManagementRepository) => Promise<T>): Promise<T>;
}
