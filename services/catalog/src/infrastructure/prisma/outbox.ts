import { eventEnvelope } from '@business-platform/contracts';
import type { EventEnvelope } from '@business-platform/contracts';
import type { Outbox } from '../../application/ports/catalog.js';
import type { Database } from './client.js';
import type { Prisma } from './generated/client.js';
export class PrismaOutbox implements Outbox {
  constructor(private readonly database: Database) {}
  async append(input: EventEnvelope): Promise<void> {
    const event = eventEnvelope(input);
    const aggregateId = /^[0-9a-f-]{36}$/i.test(event.aggregate.key) ? event.aggregate.key : null;
    await this.database.outboxEvents.create({
      data: {
        id: event.id,
        aggregate_type: event.aggregate.type,
        aggregate_id: aggregateId,
        aggregate_version: BigInt(event.aggregate.version),
        event_type: event.type,
        // eventEnvelope validated the data as JSON; ORM serialization remains in infrastructure.
        payload: {
          ...event,
          aggregate: { ...event.aggregate },
          data: event.data as Prisma.InputJsonObject,
        },
      },
      select: { id: true },
    });
  }
}
