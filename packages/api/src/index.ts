import { z } from 'zod';
export const publicProductFilterSchema = z.discriminatedUnion('kind', [
  z
    .object({
      definitionId: z.string().uuid(),
      kind: z.literal('NUMBER'),
      minimum: z.string().max(22).optional(),
      maximum: z.string().max(22).optional(),
    })
    .strict(),
  z
    .object({ definitionId: z.string().uuid(), kind: z.literal('BOOLEAN'), value: z.boolean() })
    .strict(),
  z
    .object({
      definitionId: z.string().uuid(),
      kind: z.literal('TEXT'),
      value: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      definitionId: z.string().uuid(),
      kind: z.literal('CHOICE'),
      optionId: z.string().uuid(),
    })
    .strict(),
]);
import { apiOrigin } from './origin';
export type Language = 'ar' | 'en' | 'ckb';
export interface MediaReference {
  readonly id: string;
  readonly kind: 'image' | 'video' | 'document';
  readonly alt: string;
  readonly profile: string;
  readonly ownerType: 'CATEGORY' | 'PRODUCT' | 'TECHNICAL_SOURCE';
  readonly ownerId: string;
  readonly demoUrl?: string;
  readonly mime?: string;
}
export interface MediaCapability {
  readonly url: string;
  readonly expiresAt: string | null;
}
export interface MediaResolver {
  resolve(
    reference: MediaReference,
    action: 'PREVIEW' | 'DOWNLOAD',
    signal?: AbortSignal,
  ): Promise<MediaCapability>;
}
export interface Category {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly image: MediaReference | null;
}
export interface TechnicalAttribute {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
}
export interface TechnicalDocument {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly media: MediaReference;
  readonly permitted: boolean;
}
export interface Product {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  readonly model: string | null;
  readonly categoryName: string;
  readonly productTypeName?: string;
  readonly media: readonly MediaReference[];
  readonly attributes: readonly TechnicalAttribute[];
  readonly documents: readonly TechnicalDocument[];
}
export interface CatalogPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly total: number | null;
  readonly filters?: readonly PublicFilterDefinition[];
}
export interface PublicFilterDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: 'NUMBER' | 'BOOLEAN' | 'TEXT' | 'CHOICE';
  readonly unitSymbol: string | null;
  readonly minimum: string | null;
  readonly maximum: string | null;
  readonly options: readonly { readonly id: string; readonly label: string }[];
}
export type PublicProductFilter =
  | {
      readonly definitionId: string;
      readonly kind: 'NUMBER';
      readonly minimum?: string;
      readonly maximum?: string;
    }
  | { readonly definitionId: string; readonly kind: 'BOOLEAN'; readonly value: boolean }
  | { readonly definitionId: string; readonly kind: 'TEXT'; readonly value: string }
  | { readonly definitionId: string; readonly kind: 'CHOICE'; readonly optionId: string };
export interface ProductQuery {
  readonly text?: string;
  readonly categoryId?: string;
  readonly sort?: 'featured' | 'name';
  readonly page?: number;
  readonly productTypeId?: string;
  readonly filters?: readonly PublicProductFilter[];
}
export interface CatalogDataSource {
  readonly identity: string;
  readonly demo: boolean;
  categories(
    language: Language,
    parentId: string | null,
    signal?: AbortSignal,
    cursor?: string,
  ): Promise<CatalogPage<Category>>;
  category(id: string, language: Language, signal?: AbortSignal): Promise<Category>;
  products(
    language: Language,
    query: ProductQuery,
    signal?: AbortSignal,
  ): Promise<CatalogPage<Product>>;
  product(id: string, language: Language, signal?: AbortSignal): Promise<Product>;
}
export class ApiError extends Error {
  constructor(
    readonly code: 'network' | 'not-found' | 'invalid' | 'unsupported' | 'forbidden',
    readonly status: number = 0,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}
export class PublicApiClient {
  readonly origin: string;
  constructor(origin: string) {
    this.origin = apiOrigin(origin);
  }
  async get<T>(
    path: string,
    query: Readonly<Record<string, string>>,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const u = new URL(path, this.origin);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    try {
      const r = await fetch(u, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
          : AbortSignal.timeout(6000),
        credentials: 'omit',
        redirect: 'error',
        headers: { accept: 'application/json' },
      });
      if (!r.ok)
        throw new ApiError(
          r.status === 404 ? 'not-found' : r.status === 403 ? 'forbidden' : 'network',
          r.status,
        );
      const parsed = schema.safeParse(await r.json());
      if (!parsed.success) throw new ApiError('invalid');
      return parsed.data;
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ApiError) throw e;
      throw new ApiError('network');
    }
  }
}
const categorySchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  resolvedNameLocale: z.enum(['ar', 'en', 'ckb']),
  coverAssetId: z.string().uuid().nullable().optional(),
});
const categoryPage = z.object({
  items: z.array(categorySchema).max(100),
  nextCursor: z.string().nullable(),
});
const valueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NUMBER'), number: z.string() }),
  z.object({ kind: z.literal('BOOLEAN'), boolean: z.boolean() }),
  z.object({ kind: z.literal('TEXT'), text: z.string() }),
  z.object({
    kind: z.literal('CHOICE'),
    options: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
  }),
]);
const productSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  modelCode: z.string().nullable(),
  coverAssetId: z.string().uuid(),
  categoryName: z.string(),
  productTypeName: z.string(),
  media: z.array(
    z.object({
      assetId: z.string().uuid(),
      kind: z.enum(['IMAGE', 'VIDEO', 'PDF']),
      title: z.string(),
      altText: z.string(),
    }),
  ),
  documents: z.array(
    z.object({ assetId: z.string().uuid(), sheetId: z.string().uuid(), title: z.string() }),
  ),
  attributes: z.array(
    z.object({
      definitionId: z.string().uuid(),
      label: z.string(),
      unitSymbol: z.string().nullable(),
      value: valueSchema,
    }),
  ),
});
export class ApiCatalogDataSource implements CatalogDataSource {
  readonly identity = 'api';
  readonly demo = false;
  constructor(private readonly client: PublicApiClient) {}
  private categoryModel(c: z.infer<typeof categorySchema>): Category {
    return {
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      description: c.description,
      image: c.coverAssetId
        ? {
            id: c.coverAssetId,
            kind: 'image',
            alt: c.name,
            profile: 'card',
            ownerType: 'CATEGORY',
            ownerId: c.id,
          }
        : null,
    };
  }
  async categories(
    language: Language,
    parentId: string | null,
    signal?: AbortSignal,
    cursor?: string,
  ) {
    const p = await this.client.get(
      '/api/v1/categories',
      {
        locale: language,
        limit: '12',
        ...(parentId ? { parentId } : {}),
        ...(cursor ? { cursor } : {}),
      },
      categoryPage,
      signal,
    );
    return {
      items: p.items.map((c) => this.categoryModel(c)),
      nextCursor: p.nextCursor,
      total: null,
    };
  }
  async category(id: string, language: Language, signal?: AbortSignal) {
    return this.categoryModel(
      await this.client.get(
        '/api/v1/categories/' + encodeURIComponent(id),
        { locale: language },
        categorySchema,
        signal,
      ),
    );
  }
  async products(
    language: Language,
    query: ProductQuery,
    signal?: AbortSignal,
  ): Promise<CatalogPage<Product>> {
    const p = await this.client.get(
      '/api/v1/products',
      {
        locale: language,
        page: String(query.page ?? 1),
        pageSize: '12',
        sort: query.sort ?? 'featured',
        ...(query.text?.trim() ? { search: query.text.trim() } : {}),
        ...(query.categoryId ? { category: query.categoryId } : {}),
        ...(query.productTypeId ? { productType: query.productTypeId } : {}),
        ...(query.filters?.length ? { filters: JSON.stringify(query.filters) } : {}),
      },
      z.object({
        items: z.array(productSchema).max(100),
        page: z.number().int(),
        pageSize: z.number().int(),
        hasNextPage: z.boolean(),
        filters: z.array(
          z.object({
            id: z.string().uuid(),
            label: z.string(),
            kind: z.enum(['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE']),
            unitSymbol: z.string().nullable(),
            minimum: z.string().nullable(),
            maximum: z.string().nullable(),
            options: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
          }),
        ),
      }),
      signal,
    );
    return {
      items: p.items.map((item) => this.productModel(item, language)),
      nextCursor: p.hasNextPage ? String(p.page + 1) : null,
      total: null,
      filters: p.filters,
    };
  }
  async product(id: string, language: Language, signal?: AbortSignal): Promise<Product> {
    const p = await this.client.get(
      '/api/v1/products/' + encodeURIComponent(id),
      { locale: language },
      productSchema,
      signal,
    );
    return this.productModel(p, language);
  }
  private productModel(p: z.infer<typeof productSchema>, language: Language): Product {
    return {
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      description: p.description ?? '',
      model: p.modelCode,
      categoryName: p.categoryName,
      productTypeName: p.productTypeName,
      media: [
        ...p.media.filter((m) => m.assetId === p.coverAssetId),
        ...p.media.filter((m) => m.assetId !== p.coverAssetId),
      ]
        .filter((m) => m.kind !== 'PDF')
        .map((m) => ({
          id: m.assetId,
          kind: m.kind === 'VIDEO' ? 'video' : 'image',
          alt: m.altText || m.title || p.name,
          profile: m.kind === 'VIDEO' ? 'playback' : 'detail',
          ownerType: 'PRODUCT',
          ownerId: p.id,
        })),
      attributes: p.attributes.map((a) => ({
        id: a.definitionId,
        label: a.label,
        unit: a.unitSymbol,
        value:
          a.value.kind === 'NUMBER'
            ? a.value.number
            : a.value.kind === 'BOOLEAN'
              ? language === 'en'
                ? a.value.boolean
                  ? 'Yes'
                  : 'No'
                : language === 'ckb'
                  ? a.value.boolean
                    ? 'بەڵێ'
                    : 'نەخێر'
                  : a.value.boolean
                    ? 'نعم'
                    : 'لا'
              : a.value.kind === 'TEXT'
                ? a.value.text
                : a.value.options.map((o) => o.label).join('، '),
      })),
      documents: p.documents.map((d) => ({
        id: d.sheetId + ':' + d.assetId,
        title: d.title,
        type: 'PDF',
        permitted: true,
        media: {
          id: d.assetId,
          kind: 'document',
          alt: d.title,
          profile: 'original',
          ownerType: 'TECHNICAL_SOURCE',
          ownerId: d.sheetId,
          mime: 'application/pdf',
        },
      })),
    };
  }
}
export class ApiMediaResolver implements MediaResolver {
  constructor(private readonly client: PublicApiClient) {}
  async resolve(r: MediaReference, action: 'PREVIEW' | 'DOWNLOAD', signal?: AbortSignal) {
    const c = await this.client.get(
      `/api/v1/media/assets/${encodeURIComponent(r.id)}/variants/${encodeURIComponent(r.profile)}/authorization`,
      { action, ownerType: r.ownerType, ownerId: r.ownerId },
      z.object({
        url: z.string().url(),
        expiresAt: z.string().datetime(),
        method: z.literal('GET'),
      }),
      signal,
    );
    const u = new URL(c.url);
    if (
      !(
        u.protocol === 'https:' ||
        (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))
      ) ||
      u.username ||
      u.password ||
      Date.parse(c.expiresAt) <= Date.now()
    )
      throw new ApiError('invalid');
    return { url: c.url, expiresAt: c.expiresAt };
  }
}
export const catalogKeys = {
  categories: (source: string, locale: Language, parent: string | null, cursor?: string) =>
    ['catalog', source, locale, 'categories', parent, cursor ?? null] as const,
  category: (source: string, locale: Language, id: string) =>
    ['catalog', source, locale, 'category', id] as const,
  products: (source: string, locale: Language, q: ProductQuery) =>
    ['catalog', source, locale, 'products', q] as const,
  product: (source: string, locale: Language, id: string) =>
    ['catalog', source, locale, 'product', id] as const,
};
export * from './staff';
