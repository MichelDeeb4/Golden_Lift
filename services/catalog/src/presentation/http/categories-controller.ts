import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApplicationError, locale, record, uuid } from '@golden-lift/contracts';
import type { CategoryDto, Locale, Page, Uuid } from '@golden-lift/contracts';
import type { ReadCategories } from '../../application/use-cases/read-categories.js';
import type { CategoryCursor } from '../../application/ports/catalog.js';
export const READ_CATEGORIES = Symbol('ReadCategories');
function after(value: unknown, parentId: Uuid | null, language: Locale): CategoryCursor | null {
  if (value === undefined) return null;
  try {
    if (typeof value !== 'string' || value.length > 1024 || !/^[a-zA-Z0-9_-]+$/.test(value))
      throw new Error();
    const cursor = record(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown);
    const order = cursor['sortOrder'];
    if (
      cursor['parentId'] !== parentId ||
      cursor['locale'] !== language ||
      typeof order !== 'string' ||
      !/^-?(?:0|[1-9][0-9]{0,18})$/.test(order) ||
      BigInt(order) < -9223372036854775808n ||
      BigInt(order) > 9223372036854775807n
    )
      throw new Error();
    return { sortOrder: order, id: uuid(cursor['id']) };
  } catch {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Invalid pagination cursor for this category list.',
    );
  }
}
@Controller('api/v1/categories')
export class CategoriesController {
  constructor(@Inject(READ_CATEGORIES) private readonly read: ReadCategories) {}
  @Get()
  async list(@Query() value: unknown): Promise<Page<CategoryDto>> {
    const query = record(value);
    if (Object.keys(query).some((key) => !['parentId', 'locale', 'limit', 'cursor'].includes(key)))
      throw new ApplicationError('VALIDATION_FAILED', 'Unsupported category query parameter.');
    const language = locale(query['locale']),
      parentId = query['parentId'] === undefined ? null : uuid(query['parentId']);
    const limit =
      query['limit'] === undefined
        ? 20
        : typeof query['limit'] === 'string' && /^[0-9]{1,3}$/.test(query['limit'])
          ? Number(query['limit'])
          : 0;
    if (limit < 1 || limit > 100)
      throw new ApplicationError('VALIDATION_FAILED', 'Page size must be between 1 and 100.');
    const rows = await this.read.list({
      parentId,
      locale: language,
      limit: limit + 1,
      after: after(query['cursor'], parentId, language),
    });
    const items = rows.slice(0, limit),
      last = items.at(-1);
    const nextCursor =
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ parentId, locale: language, sortOrder: last.sortOrder, id: last.id }),
          ).toString('base64url')
        : null;
    return { items, nextCursor };
  }
  @Get(':id')
  async detail(@Param('id') id: unknown, @Query() value: unknown): Promise<CategoryDto> {
    const query = record(value);
    if (Object.keys(query).some((key) => key !== 'locale'))
      throw new ApplicationError('VALIDATION_FAILED', 'Unsupported category query parameter.');
    return this.read.detail(uuid(id), locale(query['locale']));
  }
}
