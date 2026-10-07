import type { IncomingMessage } from 'node:http';
import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { locale, uuid } from '@golden-lift/contracts';
import type { CategorySchemaResponse, SessionAuthenticator } from '@golden-lift/contracts';
import { staffRequest } from '@golden-lift/platform';
import type { ReadCategorySchema } from '../../application/use-cases/read-category-schema.js';
import { STAFF_AUTHENTICATOR } from './admin-categories-controller.js';
import { strictRecord } from './category-query.js';

export const CATEGORY_SCHEMA = Symbol('ReadCategorySchema');
@Controller('api/v1/admin/categories')
export class CategorySchemaController {
  constructor(
    @Inject(CATEGORY_SCHEMA) private readonly read: ReadCategorySchema,
    @Inject(STAFF_AUTHENTICATOR) private readonly authentication: SessionAuthenticator,
  ) {}
  @Get(':id/schema') async schema(
    @Param('id') id: string,
    @Query() value: unknown,
    @Req() request: IncomingMessage,
  ): Promise<CategorySchemaResponse> {
    const actor = await this.authentication.authenticate(staffRequest(request, false));
    const query = strictRecord(value, ['locale']);
    return this.read.execute(uuid(id), locale(query['locale'] ?? 'ar'), actor);
  }
}
