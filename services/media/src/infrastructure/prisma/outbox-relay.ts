import { randomUUID } from 'node:crypto';
import { retryTransaction } from '@business-platform/platform';
import type { OutboxRelayStore, RelayEvent } from '@business-platform/platform';
import type { PrismaClient } from './client.js';
export class MediaOutboxRelay implements OutboxRelayStore {
  constructor(private readonly database: PrismaClient) {}
  async claim() {
    const token = randomUUID();
    return retryTransaction(() =>
      this.database.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string; payload: unknown }[]
        >`WITH picked AS(SELECT id FROM ops.outbox_events
        WHERE deleted_at IS NULL AND published_at IS NULL AND available_at<=clock_timestamp() AND attempts<20
          AND (locked_until IS NULL OR locked_until<clock_timestamp())
          AND event_type IN ('media.asset.ready.v1','media.asset.security.v1','media.delete.completed.v1','media.delete.failed.v1','media.deletion.requested.v1') ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
        UPDATE ops.outbox_events e SET lease_token=${token}::uuid,locked_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1
        FROM picked p WHERE e.id=p.id RETURNING e.id,e.payload`;
        return rows[0] ? { ...rows[0], token } : null;
      }),
    );
  }
  async confirmed(event: RelayEvent) {
    await this.database.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE ops.outbox_events SET published_at=clock_timestamp(),locked_until=NULL
    WHERE id=${event.id}::uuid AND lease_token=${event.token}::uuid AND locked_until>clock_timestamp() AND published_at IS NULL`;
    });
  }
  async failed(event: RelayEvent) {
    await this.database.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE ops.outbox_events SET locked_until=NULL,
    available_at=clock_timestamp()+make_interval(secs=>LEAST(300,power(2,LEAST(attempts,8))::integer)),last_error='BROKER_UNAVAILABLE'
    WHERE id=${event.id}::uuid AND lease_token=${event.token}::uuid AND published_at IS NULL`;
    });
  }
}
