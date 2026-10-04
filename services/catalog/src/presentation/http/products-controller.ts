import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ApplicationError, locale, uuid, version } from '@golden-lift/contracts';
import type { SessionAuthenticator } from '@golden-lift/contracts';
import { staffRequest } from '@golden-lift/platform';
import type { ReadProducts } from '../../application/use-cases/read-products.js';
import type { CreateProduct, EditProduct } from '../../application/use-cases/save-product.js';
import type { ReadCatalogConfiguration } from '../../application/use-cases/read-catalog-configuration.js';
import type {
  ChangeProductType,
  ProductTypeChange,
} from '../../application/use-cases/change-product-type.js';
import type { MoveProduct } from '../../application/use-cases/move-product.js';
import { STAFF_AUTHENTICATOR } from './admin-categories-controller.js';
import { CONFIGURATION_READER } from './dynamic-configuration-controller.js';
import { strictRecord } from './category-query.js';
import { nullableText, precondition, translations, values } from './dynamic-input.js';
export const READ_PRODUCTS = Symbol('ReadProducts'),
  CREATE_PRODUCT = Symbol('CreateProduct'),
  EDIT_PRODUCT = Symbol('EditProduct'),
  CHANGE_PRODUCT_TYPE = Symbol('ChangeProductType'),
  MOVE_PRODUCT = Symbol('MoveProduct');
@Controller('api/v1/products')
export class PublicProductsController {
  constructor(@Inject(READ_PRODUCTS) private readonly read: ReadProducts) {}
  @Get(':id') detail(@Param('id') id: string, @Query() value: unknown) {
    const q = strictRecord(value, ['locale']);
    return this.read.public(uuid(id), locale(q['locale']));
  }
}
@Controller('api/v1/admin/products')
export class AdminProductsController {
  constructor(
    @Inject(READ_PRODUCTS) private readonly read: ReadProducts,
    @Inject(CREATE_PRODUCT) private readonly create: CreateProduct,
    @Inject(EDIT_PRODUCT) private readonly edit: EditProduct,
    @Inject(CONFIGURATION_READER) private readonly schema: ReadCatalogConfiguration,
    @Inject(CHANGE_PRODUCT_TYPE) private readonly types: ChangeProductType,
    @Inject(MOVE_PRODUCT) private readonly move: MoveProduct,
    @Inject(STAFF_AUTHENTICATOR) private readonly authentication: SessionAuthenticator,
  ) {}
  @Get(':id') async detail(
    @Param('id') id: string,
    @Query() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, false));
    strictRecord(value, []);
    return this.read.admin(uuid(id), actor);
  }
  @Get(':id/edit-schema') async editSchema(
    @Param('id') id: string,
    @Query() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, false)),
      q = strictRecord(value, ['locale']);
    return this.schema.productSchema(uuid(id), locale(q['locale']), actor);
  }
  @Post() async creation(@Body() value: unknown, @Req() req: IncomingMessage) {
    const actor = await this.authentication.authenticate(staffRequest(req, true)),
      v = strictRecord(value, [
        'categoryId',
        'productTypeId',
        'coverAssetId',
        'modelCode',
        'translations',
        'expectedSchemaRevision',
        'expectedCategoryVersion',
        'values',
      ]),
      changes = values(v['values']);
    if (changes.some((c) => c.value === null))
      throw new ApplicationError('VALIDATION_FAILED', 'Creation values cannot be removals.');
    return this.create.execute(
      {
        categoryId: uuid(v['categoryId']),
        productTypeId: uuid(v['productTypeId']),
        coverAssetId: uuid(v['coverAssetId']),
        modelCode: v['modelCode'] === undefined ? null : nullableText(v['modelCode'], 128),
        translations: translations(v['translations']),
        expectedSchemaRevision: version(v['expectedSchemaRevision']),
        expectedCategoryVersion: version(v['expectedCategoryVersion']),
        values: changes.map((c) => {
          if (!c.value) throw new ApplicationError('VALIDATION_FAILED', 'Expected a typed value.');
          return { definitionId: c.definitionId, value: c.value };
        }),
      },
      actor,
    );
  }
  @Patch(':id') async update(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true)),
      v = strictRecord(value, [
        'expectedVersion',
        'expectedSchemaRevision',
        'translations',
        'coverAssetId',
        'modelCode',
        'values',
      ]);
    return this.edit.execute(
      uuid(id),
      {
        expectedVersion: version(v['expectedVersion']),
        expectedSchemaRevision: version(v['expectedSchemaRevision']),
        values: v['values'] === undefined ? [] : values(v['values']),
        ...(v['translations'] !== undefined
          ? { translations: translations(v['translations']) }
          : {}),
        ...(v['coverAssetId'] !== undefined ? { coverAssetId: uuid(v['coverAssetId']) } : {}),
        ...(v['modelCode'] !== undefined ? { modelCode: nullableText(v['modelCode'], 128) } : {}),
      },
      actor,
    );
  }
  @Post(':id/placement') @HttpCode(200) async placement(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true)),
      v = strictRecord(value, [
        'categoryId',
        'expectedVersion',
        'expectedSchemaRevision',
        'expectedCategoryVersion',
      ]);
    return this.move.execute(
      uuid(id),
      {
        categoryId: uuid(v['categoryId']),
        expectedVersion: version(v['expectedVersion']),
        expectedSchemaRevision: version(v['expectedSchemaRevision']),
        expectedCategoryVersion: version(v['expectedCategoryVersion']),
      },
      actor,
    );
  }
  @Post(':id/type-change/preview') @HttpCode(200) async typePreview(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true));
    return this.types.preview(uuid(id), this.typeInput(value, false).input, actor);
  }
  @Post(':id/type-change') @HttpCode(200) async typeChange(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true)),
      parsed = this.typeInput(value, true);
    if (parsed.body['confirm'] !== true)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Explicit type-change confirmation is required.',
      );
    return this.types.commit(
      uuid(id),
      parsed.input,
      precondition(parsed.body['precondition']),
      true,
      actor,
    );
  }
  private typeInput(value: unknown, commit: boolean) {
    const body = strictRecord(value, [
        'productTypeId',
        'expectedVersion',
        'expectedSchemaRevision',
        'expectedDestinationSchemaRevision',
        'values',
        ...(commit ? ['precondition', 'confirm'] : []),
      ]),
      input: ProductTypeChange = {
        productTypeId: uuid(body['productTypeId']),
        expectedVersion: version(body['expectedVersion']),
        expectedSchemaRevision: version(body['expectedSchemaRevision']),
        expectedDestinationSchemaRevision: version(body['expectedDestinationSchemaRevision']),
        values: values(body['values']),
      };
    return { body, input };
  }
}
