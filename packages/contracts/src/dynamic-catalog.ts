import type { Locale, Uuid, Version } from './core.js';
export type AttributeKind = 'NUMBER' | 'BOOLEAN' | 'TEXT' | 'CHOICE';
export interface CatalogTranslation {
  readonly locale: Locale;
  readonly name: string;
  readonly description: string | null;
}
export interface NamedConfiguration {
  readonly id: Uuid;
  readonly code: string;
  readonly version: Version;
  readonly translations: readonly CatalogTranslation[];
  readonly missingTranslationLocales: readonly Locale[];
}
export interface ProductTypeDto extends NamedConfiguration {
  readonly schemaRevision: Version;
  readonly deprecated: boolean;
}
export type AttributeGroupDto = NamedConfiguration;
export interface UnitDto {
  readonly code: string;
  readonly symbol: string;
  readonly dimension: string;
  readonly version: Version;
  readonly translations: readonly CatalogTranslation[];
  readonly missingTranslationLocales: readonly Locale[];
}
export interface AttributeOptionDto extends NamedConfiguration {
  readonly definitionId: Uuid;
  readonly sortOrder: string;
  readonly deprecated: boolean;
}
export interface AttributeDefinitionDto extends NamedConfiguration {
  readonly kind: AttributeKind;
  readonly unit: UnitDto | null;
  readonly minimum: string | null;
  readonly maximum: string | null;
  readonly allowMultiple: boolean;
  readonly public: boolean;
  readonly filterable: boolean;
  readonly deprecated: boolean;
  readonly textMultiline: boolean;
  readonly textMaxLength: number;
  readonly options: readonly AttributeOptionDto[];
}
export interface SchemaGroupDto {
  readonly id: Uuid;
  readonly group: AttributeGroupDto;
  readonly sortOrder: string;
  readonly version: Version;
}
export type TypeGroupDto = SchemaGroupDto;
export interface EffectiveAttributeDto {
  readonly id: Uuid;
  readonly definition: AttributeDefinitionDto;
  readonly groupPlacementId: Uuid | null;
  readonly sortOrder: string;
  readonly version: Version;
  readonly required: boolean;
  readonly public: boolean;
  readonly searchable: boolean;
  readonly filterable: boolean;
  readonly comparable: boolean;
}
export type TypeAttributeDto = EffectiveAttributeDto;
export interface EffectiveCategorySchema {
  readonly categoryId: Uuid;
  readonly categoryVersion: Version;
  readonly schemaRevision: Version;
  readonly leaf: boolean;
  readonly groups: readonly SchemaGroupDto[];
  readonly attributes: readonly EffectiveAttributeDto[];
}
export interface EffectiveTypeSchema {
  readonly type: ProductTypeDto;
  readonly groups: readonly TypeGroupDto[];
  readonly attributes: readonly TypeAttributeDto[];
}
export type AttributeValue =
  | { readonly kind: 'NUMBER'; readonly number: string }
  | { readonly kind: 'BOOLEAN'; readonly boolean: boolean }
  | {
      readonly kind: 'TEXT';
      readonly translations: readonly { readonly locale: Locale; readonly text: string }[];
    }
  | { readonly kind: 'CHOICE'; readonly optionIds: readonly Uuid[] };
export interface ProductAttributeValue {
  readonly definitionId: Uuid;
  readonly value: AttributeValue;
}
export interface AttributeValueMutation {
  readonly definitionId: Uuid;
  readonly value: AttributeValue | null;
}
export interface ProductDto {
  readonly active: boolean;
  readonly id: Uuid;
  readonly categoryId: Uuid;
  readonly coverAssetId: Uuid | null;
  readonly modelCode: string | null;
  readonly version: Version;
  readonly schemaRevision: Version;
  readonly translations: readonly CatalogTranslation[];
  readonly missingTranslationLocales: readonly Locale[];
  readonly values: readonly ProductAttributeValue[];
}
export interface FormField {
  readonly assignmentId: Uuid;
  readonly definitionId: Uuid;
  readonly code: string;
  readonly label: string;
  readonly description: string | null;
  readonly resolvedLabelLocale: Locale;
  readonly kind: AttributeKind;
  readonly control: 'number' | 'checkbox' | 'text' | 'textarea' | 'select' | 'multiselect';
  readonly required: boolean;
  readonly groupPlacementId: Uuid | null;
  readonly sortOrder: string;
  readonly unit: { readonly code: string; readonly symbol: string; readonly label: string } | null;
  readonly minimum: string | null;
  readonly maximum: string | null;
  readonly allowMultiple: boolean;
  readonly textMaxLength: number;
  readonly deprecated: boolean;
  readonly options: readonly {
    readonly id: Uuid;
    readonly label: string;
    readonly deprecated: boolean;
  }[];
  readonly savedTranslations: readonly CatalogTranslation[];
  readonly missingTranslationLocales: readonly Locale[];
}
export interface ProductFormSchema {
  readonly productTypeId: Uuid;
  readonly schemaRevision: Version;
  readonly groups: readonly {
    readonly id: Uuid;
    readonly label: string;
    readonly sortOrder: string;
  }[];
  readonly fields: readonly FormField[];
}
export interface CategoryFormSchema {
  readonly categoryId: Uuid;
  readonly schemaRevision: Version;
  readonly groups: ProductFormSchema['groups'];
  readonly fields: readonly FormField[];
}
export interface CategorySchemaResponse {
  readonly configuration: EffectiveCategorySchema;
  readonly form: CategoryFormSchema;
}
export interface SchemaChangeImpact {
  readonly precondition: string;
  readonly affectedProductCount: string;
  readonly invalidProductCount: string;
  readonly blockers: readonly string[];
  readonly downloadableDocumentCount: string;
  readonly fileContentsRedacted: false;
}
export interface PublicProductDto {
  readonly id: Uuid;
  readonly categoryId: Uuid;
  readonly name: string;
  readonly description: string | null;
  readonly resolvedNameLocale: Locale;
  readonly coverAssetId: Uuid;
  readonly modelCode: string | null;
  readonly categoryName: string;
  readonly media: readonly PublicProductMedia[];
  readonly documents: readonly {
    readonly assetId: Uuid;
    readonly sheetId: Uuid;
    readonly title: string;
  }[];
  readonly attributes: readonly {
    readonly definitionId: Uuid;
    readonly label: string;
    readonly unitSymbol: string | null;
    readonly value: PublicAttributeValue;
  }[];
}
export interface PublicProductMedia {
  readonly assetId: Uuid;
  readonly kind: 'IMAGE' | 'VIDEO' | 'PDF';
  readonly title: string;
  readonly altText: string;
}
export type PublicProductFilter =
  | {
      readonly definitionId: Uuid;
      readonly kind: 'NUMBER';
      readonly minimum?: string;
      readonly maximum?: string;
    }
  | { readonly definitionId: Uuid; readonly kind: 'BOOLEAN'; readonly value: boolean }
  | { readonly definitionId: Uuid; readonly kind: 'TEXT'; readonly value: string }
  | { readonly definitionId: Uuid; readonly kind: 'CHOICE'; readonly optionId: Uuid };
export interface PublicFilterDefinition {
  readonly id: Uuid;
  readonly label: string;
  readonly kind: AttributeKind;
  readonly unitSymbol: string | null;
  readonly minimum: string | null;
  readonly maximum: string | null;
  readonly options: readonly { readonly id: Uuid; readonly label: string }[];
}
export interface PublicProductQuery {
  readonly locale: Locale;
  readonly page: number;
  readonly pageSize: number;
  readonly categoryId?: Uuid;
  readonly productTypeId?: Uuid;
  readonly search?: string;
  readonly sort: 'featured' | 'name';
  readonly filters: readonly PublicProductFilter[];
}
export interface PublicProductPage {
  readonly items: readonly PublicProductDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
  readonly filters: readonly PublicFilterDefinition[];
}
export type PublicAttributeValue =
  | Extract<AttributeValue, { readonly kind: 'NUMBER' | 'BOOLEAN' }>
  | { readonly kind: 'TEXT'; readonly text: string; readonly resolvedValueLocale: Locale }
  | {
      readonly kind: 'CHOICE';
      readonly options: readonly {
        readonly id: Uuid;
        readonly label: string;
        readonly resolvedLabelLocale: Locale;
      }[];
    };
