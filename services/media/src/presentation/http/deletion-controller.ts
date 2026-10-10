import { staffRequest } from '@golden-lift/platform';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ApplicationError, record, uuid, version } from '@golden-lift/contracts';
import type {
  DeleteMedia,
  GetMediaDeletionImpact,
  GetMediaDeletionOperation,
} from '../../application/use-cases/delete-media.js';
import type { CheckStaffAccess } from '../../application/use-cases/check-staff-access.js';
import { STAFF_ACCESS } from './staff-controller.js';
export const MEDIA_DELETION = Symbol('MediaDeletion');
@Controller('api/v1/admin/media')
export class MediaDeletionController {
  constructor(
    @Inject(MEDIA_DELETION)
    private readonly cases: {
      impact: GetMediaDeletionImpact;
      remove: DeleteMedia;
      operation: GetMediaDeletionOperation;
    },
    @Inject(STAFF_ACCESS) private readonly staff: CheckStaffAccess,
  ) {}
  @Get('assets/:id/deletion-impact') async impact(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.impact.execute(uuid(id), await this.staff.execute(staffRequest(req, false)));
  }
  @Delete('assets/:id') @HttpCode(202) async remove(
    @Param('id') id: string,
    @Body() value: unknown,
    @Req() req: IncomingMessage,
  ) {
    const v = record(value);
    if (
      Object.keys(v).sort().join(',') !== 'confirmed,expectedVersion,impactRevision' ||
      v['confirmed'] !== true ||
      typeof v['impactRevision'] !== 'string' ||
      !/^d1-[a-f0-9]{64}$/.test(v['impactRevision'])
    )
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Supply current deletion impact and permanent confirmation.',
      );
    return this.cases.remove.execute(
      uuid(id),
      {
        expectedVersion: version(v['expectedVersion']),
        impactRevision: v['impactRevision'],
        confirmed: true,
      },
      await this.staff.execute(staffRequest(req, true)),
    );
  }
  @Get('deletion-operations/:id') async operation(
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.cases.operation.execute(
      uuid(id),
      await this.staff.execute(staffRequest(req, false)),
    );
  }
}
