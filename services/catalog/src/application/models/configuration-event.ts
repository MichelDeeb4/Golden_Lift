import type { EventEnvelope, Version } from '@business-platform/contracts';
import type { Clock, IdGenerator } from '../ports/catalog.js';
export function configurationEvent(
  ids: IdGenerator,
  clock: Clock,
  type: string,
  key: string,
  aggregateVersion: Version,
  eventType = 'catalog.configuration.changed.v1',
): EventEnvelope {
  return {
    id: ids.newUuid(),
    type: eventType,
    schemaVersion: 1,
    producer: 'catalog',
    occurredAt: clock.now(),
    correlationId: ids.newUuid(),
    aggregate: { type, key, version: aggregateVersion },
    data: { resourceId: key },
  };
}
