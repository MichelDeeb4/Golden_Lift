import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { ManagedProductDto, ProductMediaDto, Uuid, Version } from '@golden-lift/contracts';
import { retryTransaction } from '@golden-lift/platform';
import type {
  ProductListInput,
  ProductManagementRepository,
  ProductManagementUnitOfWork,
  PublicationWrite,
} from '../../application/ports/product-management.js';
import type { Database, PrismaClient } from './client.js';
import type { Prisma } from './generated/client.js';
import { PrismaProductRepository } from './product-repository.js';
import { mapFailure } from './unit-of-work.js';
import { PrismaOutbox } from './outbox.js';

class Repository implements ProductManagementRepository {
  constructor(private readonly tx: Database) {}
  append(event: Parameters<ProductManagementRepository['append']>[0]) {
    return new PrismaOutbox(this.tx).append(event);
  }
  async list(input: ProductListInput) {
    const where: Prisma.ProductsWhereInput = {
      deleted_at: null,
      ...(input.categoryId ? { category_id: input.categoryId } : {}),
      ...(input.productTypeId ? { product_type_id: input.productTypeId } : {}),
      ...(input.active !== undefined ? { is_active: input.active } : {}),
      ...(input.featured !== undefined ? { is_featured: input.featured } : {}),
      ...(input.text
        ? {
            OR: [
              {
                product_translations: {
                  some: { deleted_at: null, name: { contains: input.text, mode: 'insensitive' } },
                },
              },
              {
                product_code_reservations_products_id_current_model_code_idToproduct_code_reservations:
                  { code: { contains: input.text, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };
    const totalItems = await this.tx.products.count({ where });
    const rows = await this.tx.products.findMany({
      where: {
        ...where,
        ...(input.afterId
          ? input.sort === 'manual'
            ? {
                AND: [
                  {
                    OR: [
                      { sort_order: { gt: BigInt(input.afterOrder!) } },
                      { sort_order: BigInt(input.afterOrder!), id: { gt: input.afterId } },
                    ],
                  },
                ],
              }
            : { id: { gt: input.afterId } }
          : {}),
      },
      orderBy: input.sort === 'manual' ? [{ sort_order: 'asc' }, { id: 'asc' }] : { id: 'asc' },
      take: input.limit + 1,
      include: {
        categories: { include: { category_translations: { where: { deleted_at: null } } } },
        product_translations: { where: { deleted_at: null } },
        product_media_products_id_cover_media_idToproduct_media: true,
        product_code_reservations_products_id_current_model_code_idToproduct_code_reservations: true,
      },
    });
    const page = rows.slice(0, input.limit);
    return {
      totalItems,
      items: page.map((p) => ({
        id: uuid(p.id),
        name:
          (
            p.product_translations.find((t) => t.locale === input.locale) ??
            p.product_translations.find((t) => t.locale === 'ar')
          )?.name ?? '',
        modelCode:
          p.product_code_reservations_products_id_current_model_code_idToproduct_code_reservations
            ?.code ?? null,
        categoryId: uuid(p.category_id),
        categoryName:
          (
            p.categories.category_translations.find((t) => t.locale === input.locale) ??
            p.categories.category_translations.find((t) => t.locale === 'ar')
          )?.name ?? '',
        coverAssetId: p.product_media_products_id_cover_media_idToproduct_media
          ? uuid(p.product_media_products_id_cover_media_idToproduct_media.asset_id)
          : null,
        active: p.is_active,
        featured: p.is_featured,
        version: version(p.version.toString()),
        sortOrder: p.sort_order.toString(),
        updatedAt: p.updated_at.toISOString(),
      })),
      nextCursor:
        rows.length > input.limit
          ? input.sort === 'manual'
            ? Buffer.from(
                JSON.stringify({
                  id: page.at(-1)!.id,
                  order: page.at(-1)!.sort_order.toString(),
                  scope: input.cursorScope,
                }),
              ).toString('base64url')
            : page.at(-1)!.id
          : null,
    };
  }
  async detail(id: Uuid): Promise<ManagedProductDto | null> {
    const product = await new PrismaProductRepository(this.tx).find(id);
    if (!product) return null;
    const row = await this.tx.products.findUniqueOrThrow({ where: { id } });
    const media = await this.tx.productMedia.findMany({
      where: { product_id: id, deleted_at: null },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      include: {
        media_asset_refs: true,
        product_media_translations: { where: { deleted_at: null } },
      },
    });
    return {
      ...product,
      active: row.is_active,
      featured: row.is_featured,
      sortOrder: row.sort_order.toString(),
      featuredOrder: row.featured_order.toString(),
      updatedAt: row.updated_at.toISOString(),
      media: media.map((m) => ({
        id: uuid(m.id),
        assetId: uuid(m.asset_id),
        kind: m.media_asset_refs.media_kind as ProductMediaDto['kind'],
        sortOrder: m.sort_order.toString(),
        blocked: m.media_asset_refs.security_blocked,
        translations: m.product_media_translations.map((t) => ({
          locale: t.locale as ProductMediaDto['translations'][number]['locale'],
          title: t.title,
          caption: t.caption,
          altText: t.alt_text,
        })),
      })),
    };
  }
  async publicationSchema(id: Uuid) {
    return new PrismaProductRepository(this.tx).schemaFor(id);
  }
  async publication(id: Uuid, expectedVersion: Version, input: PublicationWrite) {
    const changed = await this.tx.products.updateMany({
      where: { id, deleted_at: null, version: BigInt(expectedVersion) },
      data: {
        is_active: input.active,
        is_featured: input.featured,
        sort_order: BigInt(input.sortOrder),
        featured_order: BigInt(input.featuredOrder),
      },
    });
    if (changed.count !== 1)
      throw new ApplicationError('VERSION_CONFLICT', 'Product changed; reload before saving.');
  }
  async remove(id: Uuid, expectedVersion: Version) {
    const changed = await this.tx.products.updateMany({
      where: { id, deleted_at: null, version: BigInt(expectedVersion) },
      data: { deleted_at: new Date(), is_active: false },
    });
    if (changed.count !== 1)
      throw new ApplicationError('VERSION_CONFLICT', 'Product changed; reload before deleting.');
    const deleted = await this.tx.products.findUniqueOrThrow({ where: { id } });
    return version(deleted.version.toString());
  }
  async replaceMedia(
    id: Uuid,
    expectedVersion: Version,
    coverAssetId: Uuid,
    media: readonly ProductMediaDto[],
  ) {
    const product = await this.detail(id);
    if (!product) throw new ApplicationError('NOT_FOUND', 'Product not found.');
    if (product.version !== expectedVersion)
      throw new ApplicationError('VERSION_CONFLICT', 'Product changed; reload before saving.');
    const old = await this.tx.productMedia.findMany({
      where: { product_id: id, deleted_at: null },
    });
    let coverId: string | null = null;
    for (const [index, item] of media.entries()) {
      const prior = old.find((m) => m.asset_id === item.assetId);
      const asset = await this.tx.mediaAssetRefs.findUnique({ where: { id: item.assetId } });
      if (
        !asset ||
        asset.deleted_at ||
        !asset.ready_at ||
        asset.media_kind !== item.kind ||
        asset.security_blocked
      )
        throw new ApplicationError(
          'INVALID_STATE',
          'Media is not ready or allowed for this product.',
        );
      const entry = prior
        ? await this.tx.productMedia.update({
            where: { id: prior.id },
            data: { sort_order: BigInt((index + 1) * 1024) },
          })
        : await this.tx.productMedia.create({
            data: {
              product_id: id,
              asset_id: item.assetId,
              sort_order: BigInt((index + 1) * 1024),
            },
          });
      if (item.assetId === coverAssetId) coverId = entry.id;
      await this.tx.productMediaTranslations.updateMany({
        where: { product_media_id: entry.id, deleted_at: null },
        data: { deleted_at: new Date() },
      });
      for (const t of item.translations)
        await this.tx.productMediaTranslations.create({
          data: {
            product_media_id: entry.id,
            locale: t.locale,
            title: t.title,
            caption: t.caption,
            alt_text: t.altText,
          },
        });
    }
    if (!coverId) throw new ApplicationError('VALIDATION_FAILED', 'Ready image cover required.');
    const changed = await this.tx.products.updateMany({
      where: { id, deleted_at: null, version: BigInt(expectedVersion) },
      data: { cover_media_id: coverId },
    });
    if (changed.count !== 1)
      throw new ApplicationError('VERSION_CONFLICT', 'Product changed; reload before saving.');
    await this.tx.productMedia.updateMany({
      where: { product_id: id, deleted_at: null, asset_id: { notIn: media.map((m) => m.assetId) } },
      data: { deleted_at: new Date() },
    });
  }
}
export class PrismaProductManagementUnitOfWork implements ProductManagementUnitOfWork {
  constructor(private readonly db: PrismaClient) {}
  async execute<T>(work: (repository: ProductManagementRepository) => Promise<T>): Promise<T> {
    try {
      return await retryTransaction(
        () =>
          this.db.$transaction(
            async (tx) => {
              await tx.$executeRaw`SET LOCAL lock_timeout='3s'`;
              await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
              return work(new Repository(tx));
            },
            { isolationLevel: 'Serializable', timeout: 10000, maxWait: 3000 },
          ),
        3,
      );
    } catch (error) {
      throw mapFailure(error);
    }
  }
}
