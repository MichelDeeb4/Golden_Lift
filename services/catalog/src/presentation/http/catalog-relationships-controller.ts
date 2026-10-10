import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { SessionAuthenticator } from '@golden-lift/contracts';
import { staffRequest } from '@golden-lift/platform';
import type { ManageCatalogRelationships } from '../../application/use-cases/manage-catalog-relationships.js';
import type { RelationshipTarget } from '../../application/ports/catalog-relationships.js';
import { STAFF_AUTHENTICATOR } from './admin-categories-controller.js';
import { array, precondition } from './dynamic-input.js';
import { strictRecord } from './category-query.js';
export const CATALOG_RELATIONSHIPS = Symbol('CatalogRelationships');
function target(resource: string, id: string): RelationshipTarget {
  const names = {
    categories: 'categories',
    'attribute-groups': 'groups',
    attributes: 'definitions',
  } as const;
  const name = names[resource as keyof typeof names];
  if (!name) throw new ApplicationError('NOT_FOUND', 'Relationship resource not found.');
  return { resource: name, id: uuid(id) };
}
@Controller('api/v1/admin')
export class CatalogRelationshipsController {
  constructor(
    @Inject(CATALOG_RELATIONSHIPS) private readonly useCase: ManageCatalogRelationships,
    @Inject(STAFF_AUTHENTICATOR) private readonly authentication: SessionAuthenticator,
  ) {}
  @Get(':resource/:id/memberships') async read(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.useCase.read(
      target(resource, id),
      await this.authentication.authenticate(staffRequest(req, false)),
    );
  }
  @Post(':resource/:id/memberships/preview') @HttpCode(200) async preview(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true)),
      input = strictRecord(value, ['orderedIds', 'expectedVersion']);
    return this.useCase.preview(
      target(resource, id),
      array(input['orderedIds'], 500).map(uuid),
      version(input['expectedVersion']),
      actor,
    );
  }
  @Post(':resource/:id/memberships') @HttpCode(200) async commit(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true)),
      input = strictRecord(value, ['orderedIds', 'expectedVersion', 'precondition', 'confirm']);
    return this.useCase.commit(
      target(resource, id),
      array(input['orderedIds'], 500).map(uuid),
      version(input['expectedVersion']),
      precondition(input['precondition']),
      input['confirm'] === true,
      actor,
    );
  }
}
