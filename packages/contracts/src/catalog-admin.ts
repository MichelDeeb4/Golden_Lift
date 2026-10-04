import type { CategoryDto, Locale, Page, Uuid, Version } from './core.js';
export interface StoredCategoryTranslation {
  readonly locale: Locale;
  readonly name: string;
  readonly description: string | null;
  readonly slug: string | null;
  readonly version: Version;
}
export interface AdminCategoryDto extends CategoryDto {
  readonly coverAssetId: Uuid | null;
  readonly translations: readonly StoredCategoryTranslation[];
  readonly missingTranslationLocales: readonly Locale[];
  readonly activeChildCount: string;
  readonly activeProductCount: string;
  readonly canAddChildren: boolean;
  readonly canAddProducts: boolean;
}
export interface CategoryCollectionPage extends Page<AdminCategoryDto> {
  readonly parentId: Uuid | null;
  readonly listRevision: string;
}
export interface MoveDestinationPage extends CategoryCollectionPage {
  readonly rootDestination: { readonly parentId: null; readonly listRevision: string };
}
export interface BreadcrumbPage extends Page<CategoryDto> {
  readonly pathRevision: string;
}
export interface MoveCategoryInput {
  readonly parentId: Uuid | null;
  readonly beforeId: Uuid | null;
  readonly expectedVersion: Version;
  readonly expectedSourceRevision: string;
  readonly expectedDestinationRevision: string;
}
export interface ReorderCategoriesInput {
  readonly parentId: Uuid | null;
  readonly orderedIds: readonly Uuid[];
  readonly expectedListRevision: string;
}
export interface CategoryMoveResult {
  readonly category: AdminCategoryDto;
  readonly changed: boolean;
  readonly sourceListRevision: string;
  readonly destinationListRevision: string;
}
export interface CategoryOrderResult {
  readonly parentId: Uuid | null;
  readonly changed: boolean;
  readonly listRevision: string;
  readonly items: readonly {
    readonly id: Uuid;
    readonly version: Version;
    readonly sortOrder: string;
  }[];
}
export interface BranchDeletionImpact {
  readonly totalCategoryCount: string;
  readonly descendantCategoryCount: string;
  readonly productCount: string;
  readonly categoryTranslationCount: string;
  readonly categorySpecificationCount: string;
  readonly categoryCoverCount: string;
  readonly categoryTechnicalLinkCount: string;
  readonly productTranslationCount: string;
  readonly productCodeReservationCount: string;
  readonly productMediaCount: string;
  readonly productMediaTranslationCount: string;
  readonly productSpecificationValueCount: string;
  readonly productSpecificationTextCount: string;
  readonly productSpecificationChoiceCount: string;
  readonly productTechnicalLinkCount: string;
  readonly productTechnicalConfigurationCount: string;
}
export interface BranchDeletionPreview {
  readonly category: AdminCategoryDto;
  readonly impact: BranchDeletionImpact;
  readonly previewPrecondition: string;
  readonly retention: {
    readonly sharedTechnicalSheets: true;
    readonly mediaRegistrationsAndFiles: true;
    readonly modelCodesRemainReserved: true;
    readonly restorationAvailable: false;
    readonly mediaDeliveryRevoked: false;
  };
}
export interface DeleteBranchInput {
  readonly confirm: true;
  readonly expectedVersion: Version;
  readonly previewPrecondition: string;
}
export interface BranchDeletionResult {
  readonly categoryId: Uuid;
  readonly version: Version;
  readonly impact: BranchDeletionImpact;
  readonly sourceListRevision: string;
}
