import type { EventEnvelope } from '@golden-lift/contracts';
import type { StaffAccount } from '../../domain/staff.js';
import type { Ids, Clock } from './identity.js';
export function staffEvent(
  type: string,
  account: StaffAccount,
  ids: Ids,
  clock: Clock,
): EventEnvelope {
  return {
    id: ids.uuid(),
    type,
    schemaVersion: 1,
    producer: 'identity',
    occurredAt: clock.now(),
    correlationId: ids.uuid(),
    aggregate: { type: 'StaffAccount', key: account.id, version: account.version },
    data: { accountId: account.id },
  };
}
