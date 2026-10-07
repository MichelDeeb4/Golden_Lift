import type { Locale, Uuid, Version } from './core.js';
import type { MediaKind } from './media.js';
import type { ProductDto } from './dynamic-catalog.js';
export interface ProductMediaDto {
  readonly id: Uuid;
  readonly assetId: Uuid;
  readonly kind: MediaKind;
  readonly sortOrder: string;
  readonly blocked: boolean;
  readonly translations: readonly {
    readonly locale: Locale;
    readonly title: string | null;
    readonly altText: string | null;
    readonly caption: string | null;
  }[];
}
export interface ManagedProductDto extends ProductDto {
  readonly active: boolean;
  readonly featured: boolean;
  readonly sortOrder: string;
  readonly featuredOrder: string;
  readonly updatedAt: string;
  readonly media: readonly ProductMediaDto[];
}
export interface ProductListItem {
  readonly id: Uuid;
  readonly name: string;
  readonly modelCode: string | null;
  readonly categoryId: Uuid;
  readonly categoryName: string;
  readonly coverAssetId: Uuid | null;
  readonly active: boolean;
  readonly featured: boolean;
  readonly version: Version;
  readonly sortOrder: string;
  readonly updatedAt: string;
}
