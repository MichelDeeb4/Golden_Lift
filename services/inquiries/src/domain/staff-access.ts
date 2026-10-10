import { ApplicationError } from '@business-platform/contracts';
import type { AuthenticatedActor } from '@business-platform/contracts';
export function requireAdmin(actor: AuthenticatedActor): void {
  if (actor.role !== 'ADMIN')
    throw new ApplicationError('FORBIDDEN', 'This service requires an Admin account.');
}
