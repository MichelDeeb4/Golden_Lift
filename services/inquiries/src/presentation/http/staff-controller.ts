import type { IncomingMessage } from 'node:http';
import { Controller, Get, Inject, Req } from '@nestjs/common';
import { staffRequest } from '@business-platform/platform';
import type { CheckStaffAccess } from '../../application/use-cases/check-staff-access.js';
export const STAFF_ACCESS = Symbol('StaffAccess');
@Controller('api/v1/admin/inquiries')
export class StaffController {
  constructor(@Inject(STAFF_ACCESS) private readonly access: CheckStaffAccess) {}
  @Get('session') async current(@Req() request: IncomingMessage) {
    const actor = await this.access.execute(staffRequest(request, false));
    return { actor: { id: actor.id, role: actor.role } };
  }
}
