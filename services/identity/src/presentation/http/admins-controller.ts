import type { IncomingMessage } from 'node:http';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Inject,
  Body,
  Req,
  Param,
  Query,
  HttpCode,
} from '@nestjs/common';
import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { DirectoryCursor } from '../../application/ports/identity.js';
import { IDENTITY_HTTP, body, principal } from './context.js';
import type { IdentityHttp } from './context.js';
@Controller('api/v1/staff/admins')
export class AdminsController {
  constructor(@Inject(IDENTITY_HTTP) private readonly context: IdentityHttp) {}
  @Get() async list(@Query() value: unknown, @Req() request: IncomingMessage) {
    const query = body(value, ['limit', 'cursor']),
      actor = (await principal(this.context, request)).actor;
    const limit =
      query['limit'] === undefined
        ? 20
        : typeof query['limit'] === 'string' && /^[0-9]{1,3}$/.test(query['limit'])
          ? Number(query['limit'])
          : 0;
    if (limit < 1 || limit > 100)
      throw new ApplicationError('VALIDATION_FAILED', 'Page size must be between 1 and 100.');
    let cursor: DirectoryCursor | null = null;
    if (query['cursor'] !== undefined) {
      try {
        if (typeof query['cursor'] !== 'string' || query['cursor'].length > 512) throw new Error();
        const decoded = body(
          JSON.parse(Buffer.from(query['cursor'], 'base64url').toString('utf8')) as unknown,
          ['createdAt', 'id'],
        );
        if (
          typeof decoded['createdAt'] !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(decoded['createdAt']) ||
          !Number.isFinite(Date.parse(decoded['createdAt'])) ||
          new Date(decoded['createdAt']).toISOString() !== decoded['createdAt'].slice(0, 23) + 'Z'
        )
          throw new Error();
        cursor = { createdAt: decoded['createdAt'], id: uuid(decoded['id']) };
      } catch {
        throw new ApplicationError('VALIDATION_FAILED', 'Invalid staff pagination cursor.');
      }
    }
    const rows = await this.context.admins.list(limit + 1, cursor, actor),
      items = rows.slice(0, limit),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString(
              'base64url',
            )
          : null,
    };
  }
  @Get(':id') async detail(@Param('id') id: unknown, @Req() request: IncomingMessage) {
    return this.context.admins.detail(uuid(id), (await principal(this.context, request)).actor);
  }
  @Post() async create(@Body() value: unknown, @Req() request: IncomingMessage) {
    const input = body(value, ['email', 'displayName']);
    return this.context.admins.invite(
      input['email'],
      input['displayName'],
      (await principal(this.context, request, true)).actor,
    );
  }
  @Patch(':id') async edit(
    @Param('id') id: unknown,
    @Body() value: unknown,
    @Req() request: IncomingMessage,
  ) {
    const input = body(value, ['expectedVersion', 'email', 'displayName']);
    if (input['email'] === undefined && input['displayName'] === undefined)
      throw new ApplicationError('VALIDATION_FAILED', 'Provide an account field to edit.');
    return this.context.admins.change(
      uuid(id),
      version(input['expectedVersion']),
      'edit',
      {
        ...(input['email'] === undefined ? {} : { email: input['email'] }),
        ...(input['displayName'] === undefined ? {} : { displayName: input['displayName'] }),
      },
      (await principal(this.context, request, true)).actor,
    );
  }
  @Delete(':id') @HttpCode(200) async remove(
    @Param('id') id: unknown,
    @Body() value: unknown,
    @Req() request: IncomingMessage,
  ) {
    return this.change(id, value, request, 'delete');
  }
  @Post(':id/disable') @HttpCode(200) async disable(
    @Param('id') id: unknown,
    @Body() value: unknown,
    @Req() request: IncomingMessage,
  ) {
    return this.change(id, value, request, 'disable');
  }
  @Post(':id/enable') @HttpCode(200) async enable(
    @Param('id') id: unknown,
    @Body() value: unknown,
    @Req() request: IncomingMessage,
  ) {
    return this.change(id, value, request, 'enable');
  }
  private async change(
    id: unknown,
    value: unknown,
    request: IncomingMessage,
    operation: 'disable' | 'enable' | 'delete',
  ) {
    const input = body(value, ['expectedVersion']);
    return this.context.admins.change(
      uuid(id),
      version(input['expectedVersion']),
      operation,
      {},
      (await principal(this.context, request, true)).actor,
    );
  }
  @Post(':id/invitation') @HttpCode(200) async resend(
    @Param('id') id: unknown,
    @Body() value: unknown,
    @Req() request: IncomingMessage,
  ) {
    const input = body(value, ['expectedVersion']);
    return this.context.admins.resend(
      uuid(id),
      version(input['expectedVersion']),
      (await principal(this.context, request, true)).actor,
    );
  }
}
