import type {
  AuthenticatedActor,
  SessionAuthenticator,
  StaffRequest,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
// Check capability before parsing editor input; use cases also enforce the policy
// so non-HTTP callers cannot bypass authorization.
export class AuthenticateCategoryAdministrator implements SessionAuthenticator {
  constructor(private readonly sessions: SessionAuthenticator) {}
  async authenticate(request: StaffRequest): Promise<AuthenticatedActor> {
    const actor = await this.sessions.authenticate(request);
    requireContentAdmin(actor);
    return actor;
  }
}
