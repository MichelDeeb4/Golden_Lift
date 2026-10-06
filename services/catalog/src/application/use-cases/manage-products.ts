import { ApplicationError } from '@golden-lift/contracts';
import type { AuthenticatedActor, ProductMediaDto, Uuid, Version } from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import type {
  ProductListInput,
  ProductManagementUnitOfWork,
  PublicationWrite,
} from '../ports/product-management.js';
import type { Clock, IdGenerator } from '../ports/catalog.js';
import { configurationEvent } from '../models/configuration-event.js';
export class ManageProducts {
  constructor(
    private readonly uow: ProductManagementUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async list(input: ProductListInput, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    if (
      (input.sort !== undefined && !['id', 'manual'].includes(input.sort)) ||
      (input.sort === 'manual' &&
        input.afterId &&
        (!input.afterOrder ||
          !/^-?(?:0|[1-9][0-9]{0,18})$/.test(input.afterOrder) ||
          BigInt(input.afterOrder) < -9223372036854775808n ||
          BigInt(input.afterOrder) > 9223372036854775807n))
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid product order cursor.');
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100 ||
      (input.text?.length ?? 0) > 120
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid product list request.');
    return this.uow.execute((r) => r.list(input));
  }
  async detail(id: Uuid, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => {
      const product = await r.detail(id);
      if (!product) throw new ApplicationError('NOT_FOUND', 'Product not found.');
      return product;
    });
  }
  async publication(
    id: Uuid,
    expectedVersion: Version,
    input: PublicationWrite,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    for (const order of [input.sortOrder, input.featuredOrder]) {
      if (
        !/^-?(?:0|[1-9][0-9]{0,18})$/.test(order) ||
        BigInt(order) < -9223372036854775808n ||
        BigInt(order) > 9223372036854775807n
      )
        throw new ApplicationError('VALIDATION_FAILED', 'Order must be an exact bigint string.');
    }
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Product',
      id,
      expectedVersion,
      'catalog.product.publication.v1',
    );
    return this.uow.execute(async (r) => {
      const product = await r.detail(id);
      if (!product) throw new ApplicationError('NOT_FOUND', 'Product not found.');
      if (input.active && product.media.some((m) => m.blocked))
        throw new ApplicationError('INVALID_STATE', 'Blocked media prevents publication.');
      await r.publication(id, expectedVersion, input);
      const result = await r.detail(id);
      if (!result) throw new ApplicationError('INTERNAL_ERROR', 'Product could not be read.');
      await r.append({ ...event, aggregate: { ...event.aggregate, version: result.version } });
      return result;
    });
  }
  async remove(id: Uuid, expectedVersion: Version, confirmed: boolean, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    if (!confirmed)
      throw new ApplicationError('VALIDATION_FAILED', 'Explicit deletion confirmation required.');
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Product',
      id,
      expectedVersion,
      'catalog.product.deleted.v1',
    );
    return this.uow.execute(async (r) => {
      const deletedVersion = await r.remove(id, expectedVersion);
      await r.append({ ...event, aggregate: { ...event.aggregate, version: deletedVersion } });
    });
  }
  async media(
    id: Uuid,
    expectedVersion: Version,
    coverAssetId: Uuid,
    media: readonly ProductMediaDto[],
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    if (
      media.length < 1 ||
      media.length > 100 ||
      new Set(media.map((m) => m.assetId)).size !== media.length ||
      !media.some((m) => m.assetId === coverAssetId && m.kind === 'IMAGE')
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Supply unique media and an image cover.');
    for (const item of media) {
      if (
        item.translations.length > 3 ||
        new Set(item.translations.map((t) => t.locale)).size !== item.translations.length ||
        item.translations.some((t) =>
          [t.title, t.altText, t.caption].some(
            (v) => v != null && (v.length > 4000 || /[\u0000-\u0008]/.test(v)),
          ),
        )
      )
        throw new ApplicationError('VALIDATION_FAILED', 'Invalid media translations.');
    }
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Product',
      id,
      expectedVersion,
      'catalog.product.media.v1',
    );
    return this.uow.execute(async (r) => {
      await r.replaceMedia(id, expectedVersion, coverAssetId, media);
      const result = await r.detail(id);
      if (!result) throw new ApplicationError('INTERNAL_ERROR', 'Product could not be read.');
      await r.append({ ...event, aggregate: { ...event.aggregate, version: result.version } });
      return result;
    });
  }
}
