import { ApplicationError } from '@golden-lift/contracts';
import type { AuthenticatedActor } from '@golden-lift/contracts';
export function requireAdmin(actor: AuthenticatedActor): void {
  if (actor.role !== 'ADMIN')
    throw new ApplicationError('FORBIDDEN', 'This service requires an Admin account.');
}
