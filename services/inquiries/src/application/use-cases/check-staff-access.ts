import type {
  AuthenticatedActor,
  SessionAuthenticator,
  StaffRequest,
} from '@golden-lift/contracts';
import { requireAdmin } from '../../domain/staff-access.js';
export class CheckStaffAccess {
  constructor(private readonly authentication: SessionAuthenticator) {}
  async execute(request: StaffRequest): Promise<AuthenticatedActor> {
    const actor = await this.authentication.authenticate(request);
    requireAdmin(actor);
    return actor;
  }
}
