import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChannelModel } from 'amqplib';
import { assertLegacyMediaQueuesDrained } from '../src/rabbitmq.js';
function fixture(messageCount: number, consumerCount: number, failure?: number) {
  const checked: string[] = [];
  let closed = 0;
  const connection = {
    async createChannel() {
      return {
        on() {},
        async checkQueue(queue: string) {
          checked.push(queue);
          if (failure) throw Object.assign(new Error('broker failure'), { code: failure });
          return { messageCount, consumerCount };
        },
        async close() {
          closed++;
        },
      };
    },
  } as unknown as Pick<ChannelModel, 'createChannel'>;
  return { connection, checked, closed: () => closed };
}
test('identity cutover refuses pending messages or legacy consumers including dead letters', async () => {
  for (const counts of [
    [1, 0],
    [0, 1],
  ]) {
    const f = fixture(counts[0]!, counts[1]!);
    await assert.rejects(assertLegacyMediaQueuesDrained(f.connection), /drain legacy Media queues/);
    assert.equal(f.closed(), 1);
  }
  const dead = fixture(0, 0);
  await assertLegacyMediaQueuesDrained(dead.connection);
  assert.deepEqual(dead.checked, [
    'golden-lift.media.catalog.v1',
    'golden-lift.media.media.v1',
    'golden-lift.media.dead.v1',
  ]);
  assert.equal(dead.closed(), 3);
});
test('absent legacy queues allow fresh installation but broker failures fail closed', async () => {
  await assertLegacyMediaQueuesDrained(fixture(0, 0, 404).connection);
  await assert.rejects(
    assertLegacyMediaQueuesDrained(fixture(0, 0, 403).connection),
    /broker failure/,
  );
});
