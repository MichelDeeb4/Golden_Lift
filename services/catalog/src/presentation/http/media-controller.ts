import type { IncomingMessage } from 'node:http';
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApplicationError, record, uuid, version } from '@golden-lift/contracts';
import type { MediaKind, MediaContext, MediaAction } from '@golden-lift/contracts';
import { requireInternalToken } from '@golden-lift/platform';
import type { MediaCoordination } from '../../application/use-cases/media-coordination.js';
export const MEDIA_REGISTRY = Symbol('MediaRegistry'),
  MEDIA_INTERNAL_TOKEN = Symbol('MediaInternalToken');
@Controller('internal/v1/media')
export class CatalogMediaController {
  constructor(
    @Inject(MEDIA_REGISTRY) private readonly registry: MediaCoordination,
    @Inject(MEDIA_INTERNAL_TOKEN) private readonly token: string | undefined,
  ) {}
  private authenticated(request: IncomingMessage) {
    requireInternalToken(request.headers.authorization, this.token);
  }
  @Get(':id/registration') registration(@Param('id') id: string, @Req() req: IncomingMessage) {
    this.authenticated(req);
    return this.registry.registration(uuid(id));
  }
  @Get(':id/usage') usage(
    @Param('id') id: string,
    @Query('after') after: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: IncomingMessage,
  ) {
    this.authenticated(req);
    return this.registry.usage(uuid(id), Number(after ?? 0), Number(limit ?? 25));
  }
  @Post(':id/authorize') authorize(
    @Param('id') id: string,
    @Body() input: unknown,
    @Req() req: IncomingMessage,
  ) {
    this.authenticated(req);
    const item = record(input),
      context = record(item['context']);
    if (
      Object.keys(item).some((k) => !['context', 'action'].includes(k)) ||
      Object.keys(context).some((k) => !['ownerType', 'ownerId'].includes(k)) ||
      !['CATEGORY', 'PRODUCT', 'PAGE', 'SITE_LOGO', 'TECHNICAL_SOURCE'].includes(
        String(context['ownerType']),
      ) ||
      !['PREVIEW', 'DOWNLOAD'].includes(String(item['action']))
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid media context.');
    return this.registry.authorize(
      uuid(id),
      {
        ownerType: context['ownerType'] as MediaContext['ownerType'],
        ownerId: context['ownerId'] == null ? null : uuid(context['ownerId']),
      },
      item['action'] as MediaAction,
    );
  }
  @Post(':id/retire') retire(
    @Param('id') id: string,
    @Body() input: unknown,
    @Req() req: IncomingMessage,
  ) {
    this.authenticated(req);
    const item = record(input);
    if (
      Object.keys(item).some((k) => !['kind', 'sourceVersion'].includes(k)) ||
      !['IMAGE', 'VIDEO', 'PDF'].includes(String(item['kind']))
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid retirement request.');
    return this.registry.retire(
      uuid(id),
      item['kind'] as MediaKind,
      version(item['sourceVersion']),
    );
  }
}
