import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type {
  AuthenticatedActor,
  DeleteCommand,
  SessionAuthenticator,
} from '@golden-lift/contracts';
import { requireInternalToken, staffRequest } from '@golden-lift/platform';
import type * as Cases from '../../application/use-cases/delete-catalog-entities.js';
import { STAFF_AUTHENTICATOR } from './admin-categories-controller.js';
import { MEDIA_INTERNAL_TOKEN } from './media-controller.js';
import { strictRecord } from './category-query.js';

export const DELETION = Symbol('CatalogDeletion');
export interface DeletionUseCases {
  productImpact: Cases.GetProductDeletionImpact;
  product: Cases.DeleteProduct;
  mediaImpact: Cases.GetMediaDeletionImpact;
  media: Cases.DeleteMedia;
  attributeImpact: Cases.GetAttributeDeletionImpact;
  attribute: Cases.DeleteAttribute;
  groupImpact: Cases.GetAttributeGroupDeletionImpact;
  group: Cases.DeleteAttributeGroup;
  unitImpact: Cases.GetUnitDeletionImpact;
  unit: Cases.DeleteUnit;
  categoryImpact: Cases.GetCategoryDeletionImpact;
  category: Cases.DeleteCategoryTree;
  operation: Cases.GetDeletionOperation;
}
function command(value: unknown): DeleteCommand {
  const v = strictRecord(value, ['expectedVersion', 'impactRevision', 'confirmed']);
  if (
    v['confirmed'] !== true ||
    typeof v['impactRevision'] !== 'string' ||
    !/^d1-[a-f0-9]{64}$/.test(v['impactRevision'])
  )
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Supply a current impact revision and permanent deletion confirmation.',
    );
  return {
    expectedVersion: version(v['expectedVersion']),
    impactRevision: v['impactRevision'],
    confirmed: true,
  };
}
@Controller('api/v1/admin')
export class CatalogDeletionController {
  constructor(
    @Inject(DELETION) private readonly cases: DeletionUseCases,
    @Inject(STAFF_AUTHENTICATOR) private readonly auth: SessionAuthenticator,
  ) {}
  @Get('products/:id/deletion-impact') async productImpact(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.productImpact.execute(
      uuid(id),
      await this.auth.authenticate(staffRequest(req, false)),
    );
  }
  @Delete('products/:id') @HttpCode(202) async product(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.product.execute(
      uuid(id),
      command(body),
      await this.auth.authenticate(staffRequest(req, true)),
    );
  }
  @Get('attributes/:id/deletion-impact') async attributeImpact(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.attributeImpact.execute(
      uuid(id),
      await this.auth.authenticate(staffRequest(req, false)),
    );
  }
  @Delete('attributes/:id') @HttpCode(200) async attribute(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.attribute.execute(
      uuid(id),
      command(body),
      await this.auth.authenticate(staffRequest(req, true)),
    );
  }
  @Get('attribute-groups/:id/deletion-impact') async groupImpact(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.groupImpact.execute(
      uuid(id),
      await this.auth.authenticate(staffRequest(req, false)),
    );
  }
  @Delete('attribute-groups/:id') @HttpCode(200) async group(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.group.execute(
      uuid(id),
      command(body),
      await this.auth.authenticate(staffRequest(req, true)),
    );
  }
  @Get('units/:id/deletion-impact') async unitImpact(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.unitImpact.execute(
      id,
      await this.auth.authenticate(staffRequest(req, false)),
    );
  }
  @Delete('units/:id') @HttpCode(200) async unit(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.unit.execute(
      id,
      command(body),
      await this.auth.authenticate(staffRequest(req, true)),
    );
  }
  @Get('categories/:id/deletion-impact') async categoryImpact(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.categoryImpact.execute(
      uuid(id),
      await this.auth.authenticate(staffRequest(req, false)),
    );
  }
  @Delete('categories/:id') @HttpCode(202) async category(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.category.execute(
      uuid(id),
      command(body),
      await this.auth.authenticate(staffRequest(req, true)),
    );
  }
  @Get('products/deletion-operations/:id') async operation(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.operation.execute(
      uuid(id),
      await this.auth.authenticate(staffRequest(req, false)),
    );
  }
}
@Controller('internal/v1/media')
export class CatalogMediaDeletionController {
  constructor(
    @Inject(DELETION) private readonly cases: DeletionUseCases,
    @Inject(MEDIA_INTERNAL_TOKEN) private readonly token: string | undefined,
  ) {}
  private actor(req: IncomingMessage, id: string): AuthenticatedActor {
    requireInternalToken(req.headers.authorization, this.token);
    return { id: uuid(id), role: 'ADMIN', authVersion: version('1') };
  }
  @Get(':id/deletion-impact') async impact(@Param('id') id: string, @Req() req: IncomingMessage) {
    return this.cases.mediaImpact.execute(uuid(id), this.actor(req, id));
  }
}
