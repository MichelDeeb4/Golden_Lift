import type { IncomingMessage } from 'node:http';
import { Body, Controller, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApplicationError, locale, record, uuid, version } from '@golden-lift/contracts';
import type { CategoryDto, SessionAuthenticator } from '@golden-lift/contracts';
import { staffRequest } from '@golden-lift/platform';
import type { CreateCategory } from '../../application/use-cases/create-category.js';
import type { EditCategory } from '../../application/use-cases/edit-category.js';
import { array } from './dynamic-input.js';
export const CREATE_CATEGORY = Symbol('CreateCategory'),
  EDIT_CATEGORY = Symbol('EditCategory'),
  STAFF_AUTHENTICATOR = Symbol('StaffAuthenticator');
function body(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const item = record(value);
  if (Object.keys(item).some((key) => !keys.includes(key)))
    throw new ApplicationError('VALIDATION_FAILED', 'Unsupported request field.');
  return item;
}
function translations(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3)
    throw new ApplicationError('VALIDATION_FAILED', 'Supply one to three translations.');
  return value.map((value: unknown) => {
    const item = body(value, ['locale', 'name', 'description', 'slug']);
    if (item['locale'] === undefined)
      throw new ApplicationError('VALIDATION_FAILED', 'A translation locale is required.');
    if (
      typeof item['name'] !== 'string' ||
      (item['description'] !== undefined &&
        item['description'] !== null &&
        typeof item['description'] !== 'string') ||
      (item['slug'] !== undefined && item['slug'] !== null && typeof item['slug'] !== 'string')
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid translation.');
    return {
      locale: locale(item['locale']),
      name: item['name'],
      description: typeof item['description'] === 'string' ? item['description'] : null,
      slug: typeof item['slug'] === 'string' ? item['slug'] : null,
    };
  });
}
@Controller('api/v1/admin/categories')
export class AdminCategoriesController {
  constructor(
    @Inject(CREATE_CATEGORY) private readonly create: CreateCategory,
    @Inject(EDIT_CATEGORY) private readonly edit: EditCategory,
    @Inject(STAFF_AUTHENTICATOR) private readonly authentication: SessionAuthenticator,
  ) {}
  @Post() async insert(
    @Body() value: unknown,
    @Req() request: IncomingMessage,
  ): Promise<CategoryDto> {
    const actor = await this.authentication.authenticate(staffRequest(request, true)),
      item = body(value, [
        'parentId',
        'expectedParentVersion',
        'translations',
        'coverAssetId',
        'groupIds',
      ]);
    return this.create.execute(
      {
        ...(item['groupIds'] === undefined
          ? {}
          : { groupIds: array(item['groupIds'], 500).map(uuid) }),
        parentId: item['parentId'] == null ? null : uuid(item['parentId']),
        expectedParentVersion:
          item['expectedParentVersion'] == null ? null : version(item['expectedParentVersion']),
        translations: translations(item['translations']),
        ...(item['coverAssetId'] === undefined
          ? {}
          : { coverAssetId: item['coverAssetId'] === null ? null : uuid(item['coverAssetId']) }),
      },
      actor,
    );
  }
  @Patch(':id') async update(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() request: IncomingMessage,
  ): Promise<CategoryDto> {
    const actor = await this.authentication.authenticate(staffRequest(request, true)),
      item = body(value, ['expectedVersion', 'translations', 'coverAssetId']);
    return this.edit.execute(
      uuid(id),
      version(item['expectedVersion']),
      translations(item['translations']),
      actor,
      item['coverAssetId'] === undefined
        ? undefined
        : item['coverAssetId'] === null
          ? null
          : uuid(item['coverAssetId']),
    );
  }
}
