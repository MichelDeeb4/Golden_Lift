import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
import { ApplicationError, record, uuid } from '@golden-lift/contracts';
import type { CatalogReader } from '../../application/ports/catalog-reader.js';
export const CATALOG_READER = Symbol('CatalogReader');
function queryStrings(value: unknown): Readonly<Record<string, string>> {
  const input = record(value),
    output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string')
      throw new ApplicationError('VALIDATION_FAILED', 'Query parameters must be single strings.');
    output[key] = value;
  }
  return output;
}
@Controller('api/v1/categories')
export class CatalogController {
  constructor(@Inject(CATALOG_READER) private readonly reader: CatalogReader) {}
  @Get() list(
    @Query() query: unknown,
    @Headers('x-request-id') requestId: string | undefined,
  ): Promise<unknown> {
    return this.reader.read('/api/v1/categories', queryStrings(query), requestId);
  }
  @Get(':id') detail(
    @Param('id') id: unknown,
    @Query() query: unknown,
    @Headers('x-request-id') requestId: string | undefined,
  ): Promise<unknown> {
    return this.reader.read('/api/v1/categories/' + uuid(id), queryStrings(query), requestId);
  }
}
@Controller('api/v1/products')
export class ProductsController {
  constructor(@Inject(CATALOG_READER) private readonly reader: CatalogReader) {}
  @Get(':id') detail(
    @Param('id') id: unknown,
    @Query() query: unknown,
    @Headers('x-request-id') requestId: string | undefined,
  ): Promise<unknown> {
    return this.reader.read('/api/v1/products/' + uuid(id), queryStrings(query), requestId);
  }
}
