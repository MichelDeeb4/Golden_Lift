import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { SessionAuthenticator } from '@golden-lift/contracts';
import { staffRequest } from '@golden-lift/platform';
import type { ReadCatalogConfiguration } from '../../application/use-cases/read-catalog-configuration.js';
import type {
  CreateAttributeDefinition,
  CreateAttributeGroup,
  CreateAttributeOption,
  CreateCanonicalUnit,
} from '../../application/use-cases/create-catalog-configuration.js';
import type { ChangeCatalogSchema } from '../../application/use-cases/change-catalog-schema.js';
import { STAFF_AUTHENTICATOR } from './admin-categories-controller.js';
import { decodeCursor, encodeCursor, pageSize, strictRecord } from './category-query.js';
import {
  canonicalUnit,
  change,
  definition,
  named,
  option,
  precondition,
  resource,
  target,
  text,
} from './dynamic-input.js';
export const CONFIGURATION_READER = Symbol('ConfigurationReader'),
  CREATE_DEFINITION = Symbol('CreateDefinition'),
  CREATE_GROUP = Symbol('CreateGroup'),
  CREATE_UNIT = Symbol('CreateUnit'),
  CREATE_OPTION = Symbol('CreateOption'),
  SCHEMA_CHANGES = Symbol('SchemaChanges');
@Controller('api/v1/admin')
export class DynamicConfigurationController {
  constructor(
    @Inject(CONFIGURATION_READER) private readonly read: ReadCatalogConfiguration,
    @Inject(CREATE_DEFINITION) private readonly definitions: CreateAttributeDefinition,
    @Inject(CREATE_GROUP) private readonly groups: CreateAttributeGroup,
    @Inject(CREATE_UNIT) private readonly units: CreateCanonicalUnit,
    @Inject(CREATE_OPTION) private readonly options: CreateAttributeOption,
    @Inject(SCHEMA_CHANGES) private readonly changes: ChangeCatalogSchema,
    @Inject(STAFF_AUTHENTICATOR) private readonly authentication: SessionAuthenticator,
  ) {}
  @Post('attributes/:id/options') async createOption(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true));
    return this.options.execute(uuid(id), option(value), actor);
  }
  @Get(':resource') async list(
    @Param('resource') name: string,
    @Query() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, false)),
      r = resource(name),
      q = strictRecord(value, [
        'limit',
        'cursor',
        'page',
        'pageSize',
        'q',
        'kind',
        'visibility',
        'state',
      ]),
      limit = pageSize(q['limit']),
      cursor = decodeCursor(q['cursor']);
    if (r === 'options')
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Options are listed within their owning attribute definition.',
      );
    if (q['page'] !== undefined || q['pageSize'] !== undefined) {
      if (
        q['cursor'] !== undefined ||
        q['limit'] !== undefined ||
        (q['kind'] !== undefined &&
          !['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE'].includes(String(q['kind']))) ||
        (q['visibility'] !== undefined &&
          !['public', 'internal'].includes(String(q['visibility']))) ||
        (q['state'] !== undefined && !['active', 'deprecated'].includes(String(q['state']))) ||
        !/^[1-9][0-9]{0,5}$/.test(String(q['page'] ?? '1'))
      )
        throw new ApplicationError('VALIDATION_FAILED', 'Invalid configuration pagination.');
      return this.read.page(
        {
          resource: r,
          page: Number(q['page'] ?? 1),
          pageSize: pageSize(q['pageSize'] ?? '25'),
          ...(q['q'] !== undefined ? { search: text(q['q'], 120) } : {}),
          ...(q['kind'] !== undefined
            ? { kind: q['kind'] as 'NUMBER' | 'BOOLEAN' | 'TEXT' | 'CHOICE' }
            : {}),
          ...(q['visibility'] !== undefined ? { public: q['visibility'] === 'public' } : {}),
          ...(q['state'] !== undefined ? { deprecated: q['state'] === 'deprecated' } : {}),
        },
        actor,
      );
    }
    if (['q', 'kind', 'visibility', 'state'].some((k) => q[k] !== undefined))
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Filtered configuration queries require numbered pagination.',
      );
    if (
      cursor &&
      (Object.keys(cursor).some((k) => !['kind', 'resource', 'after'].includes(k)) ||
        cursor['kind'] !== 'configuration' ||
        cursor['resource'] !== r)
    )
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Cursor does not match this configuration resource.',
      );
    const after = cursor
        ? r === 'units'
          ? text(cursor['after'], 128)
          : uuid(cursor['after'])
        : null,
      items = await this.read.list(r, after, limit + 1, actor),
      page = items.slice(0, limit),
      last = page.at(-1);
    return {
      items: page,
      nextCursor:
        items.length > limit && last
          ? encodeCursor({
              kind: 'configuration',
              resource: r,
              after: 'id' in last ? last.id : last.code,
            })
          : null,
    };
  }
  @Post(':resource') async create(
    @Param('resource') name: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true));
    switch (resource(name)) {
      case 'definitions':
        return this.definitions.execute(definition(value), actor);
      case 'groups':
        return this.groups.execute(named(value), actor);
      case 'units':
        return this.units.execute(canonicalUnit(value), actor);
      default:
        throw new ApplicationError(
          'VALIDATION_FAILED',
          'Create options through their owning attribute.',
        );
    }
  }
  @Get(':resource/:id') async detail(
    @Param('resource') name: string,
    @Param('id') id: string,
    @Query() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, false));
    strictRecord(value, []);
    return this.read.detail(target(name, id), actor);
  }
  @Post(':resource/:id/changes/preview') @HttpCode(200) async preview(
    @Param('resource') name: string,
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true)),
      input = this.input(value, false);
    return this.changes.preview(target(name, id), input.change, input.expected, actor);
  }
  @Post(':resource/:id/changes') @HttpCode(200) async commit(
    @Param('resource') name: string,
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(req, true)),
      input = this.input(value, true);
    if (input.body['confirm'] !== true)
      throw new ApplicationError('VALIDATION_FAILED', 'Explicit confirmation is required.');
    return this.changes.commit(
      target(name, id),
      input.change,
      input.expected,
      precondition(input.body['precondition']),
      true,
      actor,
    );
  }
  private input(value: unknown, commit: boolean) {
    const body = strictRecord(value, [
      'change',
      'expectedVersion',
      'expectedSchemaRevision',
      ...(commit ? ['precondition', 'confirm'] : []),
    ]);
    return {
      body,
      change: change(body['change']),
      expected: {
        expectedVersion: version(body['expectedVersion']),
        expectedSchemaRevision:
          body['expectedSchemaRevision'] === null ? null : version(body['expectedSchemaRevision']),
      },
    };
  }
}
