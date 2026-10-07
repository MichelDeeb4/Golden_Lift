import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { All, Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApplicationError, record, uuid, version } from '@golden-lift/contracts';
import type { MediaAction, MediaContext, MediaKind } from '@golden-lift/contracts';
import { staffRequest } from '@golden-lift/platform';
import type { Uploads } from '../../application/use-cases/uploads.js';
import type { MediaLibrary } from '../../application/use-cases/library.js';
import type { AuthorizeDelivery } from '../../application/use-cases/delivery.js';
import type { CheckStaffAccess } from '../../application/use-cases/check-staff-access.js';
import type { PrivateStorage } from '../../application/ports/storage.js';
import type { SecurityPrerequisites } from '../../application/ports/processing.js';
import type { MediaPolicy } from '../../application/ports/media.js';
import { singleRange } from '../../application/models/delivery.js';
import { STAFF_ACCESS } from './staff-controller.js';
export const UPLOADS = Symbol('Uploads'),
  LIBRARY = Symbol('MediaLibrary'),
  DELIVERY = Symbol('Delivery'),
  STORAGE = Symbol('Storage'),
  MEDIA_OPTIONS = Symbol('MediaOptions'),
  SECURITY_PREREQUISITES = Symbol('SecurityPrerequisites');
interface Options {
  readonly policy: MediaPolicy;
  readonly origin: string;
  readonly delivery: string;
}
function body(input: unknown, keys: readonly string[]) {
  const value = record(input);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new ApplicationError('VALIDATION_FAILED', 'Unsupported Media field.');
  return value;
}
function publicAsset(asset: Awaited<ReturnType<MediaLibrary['list']>>[number]) {
  return {
    id: asset.id,
    name: asset.originalName,
    purpose: asset.purpose,
    updatedAt: asset.updatedAt,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    kind: asset.kind,
    status: asset.status,
    security: asset.security,
    version: asset.version,
    deleted: asset.deleted,
    byteSize: asset.bytes,
    failureCode: asset.failure,
    jobs: asset.jobs,
    variants: asset.variants.map((v) => ({
      profile: v.profile,
      mime: v.mime,
      bytes: v.bytes,
      width: v.width,
      height: v.height,
      duration: v.duration,
    })),
  };
}
@Controller('api/v1/admin/media')
export class AdminMediaController {
  constructor(
    @Inject(STAFF_ACCESS) private readonly auth: CheckStaffAccess,
    @Inject(UPLOADS) private readonly uploads: Uploads,
    @Inject(LIBRARY) private readonly library: MediaLibrary,
    @Inject(MEDIA_OPTIONS) private readonly options: Options,
    @Inject(SECURITY_PREREQUISITES) private readonly security: SecurityPrerequisites,
  ) {}
  private instructions(row: Awaited<ReturnType<Uploads['status']>>) {
    return {
      id: row.id,
      assetId: row.assetId,
      status: row.status,
      expiresAt: row.expires,
      version: row.version,
      bytes: row.bytes,
      parts: Object.entries(row.parts).map(([number, part]) => ({
        number: Number(number),
        bytes: part.bytes,
        sha256: part.sha256,
      })),
      upload: {
        method: 'POST',
        url: this.options.origin + '/api/v1/admin/media/uploads/' + row.id + '/parts/{number}',
        headers: { 'content-type': 'application/octet-stream' },
        credentials: 'include',
        csrfHeader: 'x-csrf-token',
        partBytes: this.options.policy.partBytes,
        partCount: Math.ceil(Number(row.bytes) / this.options.policy.partBytes),
      },
    };
  }
  @Get('statistics') statistics(@Req() req: IncomingMessage) {
    return this.auth
      .execute(staffRequest(req, false))
      .then((actor) => this.library.statistics(actor));
  }
  @Get('capabilities') async capabilities(@Req() req: IncomingMessage) {
    await this.auth.execute(staffRequest(req, false));
    return {
      formats: {
        IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
        VIDEO: ['MP4/MOV with H.264/HEVC and optional AAC/PCM'],
        PDF: ['unencrypted PDF'],
      },
      mimeTypes: {
        IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
        VIDEO: ['video/mp4', 'video/quicktime'],
        PDF: ['application/pdf'],
      },
      purposes: ['CATALOG', 'TECHNICAL_SOURCE'],
      limits: this.options.policy,
      scannerAvailable: await this.security.ready(),
      uploads: 'bounded-resumable-parts',
      delivery: this.options.delivery,
      revalidationSupported: false,
    };
  }
  @Post('uploads') async initiate(@Body() input: unknown, @Req() req: IncomingMessage) {
    const actor = await this.auth.execute(staffRequest(req, true)),
      value = body(input, ['kind', 'name', 'bytes', 'purpose', 'sha256', 'idempotencyKey']);
    if (!(await this.security.ready()))
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Mandatory malware scanner is unavailable.',
      );
    if (
      typeof value['name'] !== 'string' ||
      typeof value['bytes'] !== 'string' ||
      typeof value['idempotencyKey'] !== 'string' ||
      (value['sha256'] != null && typeof value['sha256'] !== 'string')
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid upload metadata.');
    return this.instructions(
      await this.uploads.initiate(
        {
          kind: value['kind'] as MediaKind,
          name: value['name'],
          bytes: value['bytes'],
          purpose: value['purpose'] as 'CATALOG' | 'TECHNICAL_SOURCE',
          sha256: typeof value['sha256'] === 'string' ? value['sha256'] : null,
          idempotencyKey: value['idempotencyKey'],
        },
        actor,
      ),
    );
  }
  @Get('uploads/:id') async status(@Param('id') id: string, @Req() req: IncomingMessage) {
    return this.instructions(
      await this.uploads.status(uuid(id), await this.auth.execute(staffRequest(req, false))),
    );
  }
  @Post('uploads/:id/authorize') async authorize(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    const row = await this.uploads.status(
      uuid(id),
      await this.auth.execute(staffRequest(req, true)),
    );
    if (row.status !== 'OPEN' || Date.parse(row.expires) <= Date.now())
      throw new ApplicationError('INVALID_STATE', 'Upload is closed.');
    return this.instructions(row);
  }
  @Post('uploads/:id/parts/:number') async part(
    @Param('id') id: string,
    @Param('number') number: string,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.execute(staffRequest(req, true));
    await this.uploads.status(uuid(id), actor);
    if (req.headers['content-type'] !== 'application/octet-stream' || !/^\d{1,3}$/.test(number))
      throw new ApplicationError('VALIDATION_FAILED', 'Expected a binary upload part.');
    const chunks: Buffer[] = [];
    let count = 0;
    const timeout = setTimeout(() => req.destroy(), 30000);
    try {
      for await (const value of req) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
        count += chunk.length;
        if (count > this.options.policy.partBytes)
          throw new ApplicationError('REQUEST_TOO_LARGE', 'Part exceeds its bound.');
        chunks.push(chunk);
      }
    } finally {
      clearTimeout(timeout);
    }
    return this.instructions(
      await this.uploads.part(uuid(id), Number(number), Buffer.concat(chunks), actor),
    );
  }
  @Post('uploads/:id/complete') async complete(
    @Param('id') id: string,
    @Body() input: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.execute(staffRequest(req, true)),
      value = body(input, ['expectedVersion']);
    return this.instructions(
      await this.uploads.complete(uuid(id), version(value['expectedVersion']), actor),
    );
  }
  @Post('uploads/:id/cancel') async cancel(
    @Param('id') id: string,
    @Body() input: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.execute(staffRequest(req, true)),
      value = body(input, ['expectedVersion']);
    return this.instructions(
      await this.uploads.cancel(uuid(id), version(value['expectedVersion']), actor),
    );
  }
  @Get('assets') async list(
    @Query('after') after: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: IncomingMessage,
  ) {
    if (
      (kind !== undefined && !['IMAGE', 'VIDEO', 'PDF'].includes(kind)) ||
      (status !== undefined && !['UPLOADING', 'PROCESSING', 'READY', 'FAILED'].includes(status))
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid Media filter.');
    const assets = await this.library.list(
      after ? uuid(after) : null,
      Number(limit ?? 25),
      await this.auth.execute(staffRequest(req, false)),
      {
        ...(kind ? { kind: kind as MediaKind } : {}),
        ...(status ? { status: status as 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' } : {}),
      },
    );
    return { items: assets.map(publicAsset), next: assets.at(-1)?.id ?? null };
  }
  @Get('assets/:id') async detail(@Param('id') id: string, @Req() req: IncomingMessage) {
    const result = await this.library.detail(
      uuid(id),
      await this.auth.execute(staffRequest(req, false)),
    );
    return { asset: publicAsset(result.asset), registration: result.registration };
  }
  @Get('assets/:id/usage') async usage(
    @Param('id') id: string,
    @Query('after') after: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: IncomingMessage,
  ) {
    return this.library.usage(
      uuid(id),
      Number(after ?? 0),
      Number(limit ?? 25),
      await this.auth.execute(staffRequest(req, false)),
    );
  }
  @Post('assets/:id/block') async block(
    @Param('id') id: string,
    @Body() input: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.execute(staffRequest(req, true)),
      value = body(input, ['expectedVersion']);
    return publicAsset(
      await this.library.block(uuid(id), version(value['expectedVersion']), actor),
    );
  }
  @Post('assets/:id/retry') async retry(
    @Param('id') id: string,
    @Body() input: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.execute(staffRequest(req, true)),
      value = body(input, ['expectedVersion']);
    return publicAsset(
      await this.library.retry(uuid(id), version(value['expectedVersion']), actor),
    );
  }
  @Post('assets/:id/reprocess') async reprocess(
    @Param('id') id: string,
    @Body() input: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.execute(staffRequest(req, true)),
      value = body(input, ['expectedVersion']);
    return publicAsset(
      await this.library.reprocess(uuid(id), version(value['expectedVersion']), actor),
    );
  }
  @Post('assets/:id/retire') async retire(
    @Param('id') id: string,
    @Body() input: unknown,
    @Req() req: IncomingMessage,
  ) {
    const actor = await this.auth.execute(staffRequest(req, true)),
      value = body(input, ['expectedVersion', 'confirmed']);
    return this.library.retire(
      uuid(id),
      version(value['expectedVersion']),
      value['confirmed'] === true,
      actor,
    );
  }
}
@Controller('api/v1')
export class MediaDeliveryController {
  constructor(
    @Inject(STAFF_ACCESS) private readonly auth: CheckStaffAccess,
    @Inject(DELIVERY) private readonly delivery: AuthorizeDelivery,
    @Inject(STORAGE) private readonly storage: PrivateStorage,
    @Inject(MEDIA_OPTIONS) private readonly options: Options,
  ) {}
  private async grant(id: string, profile: string, req: IncomingMessage) {
    const url = new URL(req.url ?? '/', 'http://media.local'),
      admin = url.pathname.startsWith('/api/v1/admin/');
    const action = url.searchParams.get('action') ?? 'PREVIEW';
    if (
      !['PREVIEW', 'DOWNLOAD'].includes(action) ||
      !/^(thumbnail|card|detail|large|playback|poster|preview|original)$/.test(profile)
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid media action or profile.');
    let context: MediaContext | null = null;
    if (!admin) {
      const type = url.searchParams.get('ownerType');
      if (!['CATEGORY', 'PRODUCT', 'PAGE', 'SITE_LOGO', 'TECHNICAL_SOURCE'].includes(type ?? ''))
        throw new ApplicationError('VALIDATION_FAILED', 'Invalid media context.');
      context = {
        ownerType: type as MediaContext['ownerType'],
        ownerId: url.searchParams.has('ownerId') ? uuid(url.searchParams.get('ownerId')) : null,
      };
    }
    return this.delivery.execute(
      uuid(id),
      profile,
      action as MediaAction,
      context,
      admin ? await this.auth.execute(staffRequest(req, false)) : null,
    );
  }
  @Get([
    'admin/media/assets/:id/variants/:profile/authorization',
    'media/assets/:id/variants/:profile/authorization',
  ])
  async authorize(
    @Param('id') id: string,
    @Param('profile') profile: string,
    @Req() req: IncomingMessage,
  ) {
    const grant = await this.grant(id, profile, req),
      seconds = Math.floor((Date.parse(grant.expires) - Date.now()) / 1000);
    if (seconds < 1) throw new ApplicationError('FORBIDDEN', 'Media authorization expired.');
    const parsed = new URL(req.url ?? '/', 'http://media.local');
    const url =
      this.options.delivery === 's3' && this.storage.sign
        ? await this.storage.sign(
            grant.key,
            seconds,
            grant.mime,
            grant.action === 'DOWNLOAD',
            grant.objectVersion,
          )
        : this.options.origin +
          parsed.pathname.replace(/authorization$/, 'content') +
          parsed.search;
    return { url, expiresAt: grant.expires, method: 'GET' };
  }
  @All([
    'admin/media/assets/:id/variants/:profile/content',
    'media/assets/:id/variants/:profile/content',
  ])
  async content(
    @Param('id') id: string,
    @Param('profile') profile: string,
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
  ) {
    if (req.method !== 'GET' && req.method !== 'HEAD')
      throw new ApplicationError('NOT_FOUND', 'Resource not found.');
    const grant = await this.grant(id, profile, req),
      size = Number(grant.bytes),
      etag = '"' + grant.sha256 + '"';
    if (Date.parse(grant.expires) <= Date.now())
      throw new ApplicationError('FORBIDDEN', 'Media authorization expired.');
    res.setHeader('content-type', grant.mime);
    res.setHeader('etag', etag);
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader(
      'content-disposition',
      `${grant.action === 'DOWNLOAD' ? 'attachment' : 'inline'}; filename="media"`,
    );
    res.setHeader('content-security-policy', "default-src 'none'; sandbox");
    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return;
    }
    let range: ReturnType<typeof singleRange>;
    try {
      range = singleRange(
        typeof req.headers.range === 'string' &&
          (!req.headers['if-range'] || req.headers['if-range'] === etag)
          ? req.headers.range
          : undefined,
        size,
      );
    } catch {
      res.statusCode = 416;
      res.setHeader('content-range', `bytes */${size}`);
      res.setHeader('content-length', '0');
      res.end();
      return;
    }
    res.statusCode = range ? 206 : 200;
    if (range) res.setHeader('content-range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('content-length', range ? range.end - range.start + 1 : size);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    await pipeline(
      Readable.from(await this.storage.read(grant.key, range ?? undefined, grant.objectVersion)),
      res,
    );
  }
}
