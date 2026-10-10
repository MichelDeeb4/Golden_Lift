import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ApplicationError, locale, uuid, version } from '@business-platform/contracts';
import type { ProductMediaDto, SessionAuthenticator, Uuid } from '@business-platform/contracts';
import { staffRequest } from '@business-platform/platform';
import type { ManageProducts } from '../../application/use-cases/manage-products.js';
import { STAFF_AUTHENTICATOR } from './admin-categories-controller.js';
import { strictRecord } from './category-query.js';
export const PRODUCT_MANAGEMENT = Symbol('ProductManagement');
function boolean(value: unknown) {
  if (typeof value !== 'boolean')
    throw new ApplicationError('VALIDATION_FAILED', 'Expected boolean.');
  return value;
}
function text(value: unknown) {
  if (typeof value !== 'string') throw new ApplicationError('VALIDATION_FAILED', 'Expected text.');
  return value;
}
function optionalFilter(value: unknown) {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ApplicationError('VALIDATION_FAILED', 'Invalid filter.');
}
@Controller('api/v1/admin/products')
export class ProductManagementController {
  constructor(
    @Inject(PRODUCT_MANAGEMENT) private readonly products: ManageProducts,
    @Inject(STAFF_AUTHENTICATOR) private readonly auth: SessionAuthenticator,
  ) {}
  @Get() async list(@Query() value: unknown, @Req() req: IncomingMessage) {
    const actor = await this.auth.authenticate(staffRequest(req, false)),
      q = strictRecord(value, [
        'locale',
        'categoryId',
        'text',
        'active',
        'featured',
        'cursor',
        'limit',
        'sort',
      ]);
    const sort = q['sort'] ?? 'id';
    if (sort !== 'id' && sort !== 'manual')
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid product sort.');
    const cursorScope = JSON.stringify(
      ['locale', 'categoryId', 'text', 'active', 'featured', 'sort'].map((key) => q[key] ?? null),
    );
    let afterId: Uuid | undefined, afterOrder: string | undefined;
    if (q['cursor']) {
      if (sort === 'id') afterId = uuid(q['cursor']);
      else {
        try {
          const cursor = text(q['cursor']);
          if (cursor.length > 1024) throw new Error();
          const parsed = strictRecord(
            JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown,
            ['id', 'order', 'scope'],
          );
          if (parsed['scope'] !== cursorScope) throw new Error();
          afterId = uuid(parsed['id']);
          afterOrder = text(parsed['order']);
          if (
            !/^-?(?:0|[1-9][0-9]{0,18})$/.test(afterOrder) ||
            BigInt(afterOrder) < -9223372036854775808n ||
            BigInt(afterOrder) > 9223372036854775807n
          )
            throw new Error();
        } catch {
          throw new ApplicationError('VALIDATION_FAILED', 'Invalid product cursor.');
        }
      }
    }
    return this.products.list(
      {
        locale: locale(q['locale']),
        limit: q['limit'] === undefined ? 25 : Number(q['limit']),
        sort,
        cursorScope,
        ...(afterId ? { afterId } : {}),
        ...(afterOrder !== undefined ? { afterOrder } : {}),
        ...(q['categoryId'] ? { categoryId: uuid(q['categoryId']) } : {}),
        ...(q['text'] ? { text: text(q['text']) } : {}),
        ...(q['active'] === undefined ? {} : { active: optionalFilter(q['active'])! }),
        ...(q['featured'] === undefined ? {} : { featured: optionalFilter(q['featured'])! }),
      },
      actor,
    );
  }
  @Get(':id/management') async detail(@Param('id') id: string, @Req() req: IncomingMessage) {
    return this.products.detail(uuid(id), await this.auth.authenticate(staffRequest(req, false)));
  }
  @Post(':id/publication') @HttpCode(200) async publication(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.authenticate(staffRequest(req, true)),
      v = strictRecord(value, [
        'expectedVersion',
        'active',
        'featured',
        'sortOrder',
        'featuredOrder',
      ]);
    return this.products.publication(
      uuid(id),
      version(v['expectedVersion']),
      {
        active: boolean(v['active']),
        featured: boolean(v['featured']),
        sortOrder: text(v['sortOrder']),
        featuredOrder: text(v['featuredOrder']),
      },
      actor,
    );
  }
  @Post(':id/media') @HttpCode(200) async media(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.authenticate(staffRequest(req, true)),
      v = strictRecord(value, ['expectedVersion', 'coverAssetId', 'media']);
    if (!Array.isArray(v['media']))
      throw new ApplicationError('VALIDATION_FAILED', 'Expected media list.');
    const media: ProductMediaDto[] = v['media'].map((raw: unknown, index: number) => {
      const m = strictRecord(raw, ['id', 'assetId', 'kind', 'translations']);
      if (
        !['IMAGE', 'VIDEO', 'PDF'].includes(String(m['kind'])) ||
        !Array.isArray(m['translations'])
      )
        throw new ApplicationError('VALIDATION_FAILED', 'Invalid media entry.');
      return {
        id: uuid(m['id']),
        assetId: uuid(m['assetId']),
        kind: m['kind'] as ProductMediaDto['kind'],
        sortOrder: String((index + 1) * 1024),
        blocked: false,
        translations: m['translations'].map((raw: unknown) => {
          const t = strictRecord(raw, ['locale', 'title', 'caption', 'altText']);
          return {
            locale: locale(t['locale']),
            title: t['title'] == null ? null : text(t['title']),
            caption: t['caption'] == null ? null : text(t['caption']),
            altText: t['altText'] == null ? null : text(t['altText']),
          };
        }),
      };
    });
    return this.products.media(
      uuid(id),
      version(v['expectedVersion']),
      uuid(v['coverAssetId']),
      media,
      actor,
    );
  }
}
