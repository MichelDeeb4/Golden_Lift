import amqp from 'amqplib';
import { setTimeout as pause } from 'node:timers/promises';
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ApplicationError } from '@business-platform/contracts';

// Migration guard only: these immutable names identify the pre-rename durable queues.
const legacyMediaQueues = [
  'golden-lift.media.catalog.v1',
  'golden-lift.media.media.v1',
  'golden-lift.media.dead.v1',
];
export async function assertLegacyMediaQueuesDrained(
  connection: Pick<ChannelModel, 'createChannel'>,
) {
  for (const queue of legacyMediaQueues) {
    const probe = await connection.createChannel();
    probe.on('error', () => undefined);
    let absent = false;
    try {
      const state = await probe.checkQueue(queue);
      if (state.messageCount !== 0 || state.consumerCount !== 0)
        throw new Error(
          'Pause legacy relays and drain legacy Media queues before identity cutover.',
        );
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 404)
        absent = true;
      else throw error;
    } finally {
      if (!absent) await probe.close();
    }
  }
}

/** Only B5-supported routes are published. Queue authority remains each service's PostgreSQL outbox/inbox. */
export class RabbitMediaTransport {
  closed = false;
  private constructor(
    private readonly connection: ChannelModel,
    private readonly channel: ConfirmChannel,
  ) {
    connection.on('close', () => {
      this.closed = true;
    });
    channel.on('close', () => {
      this.closed = true;
    });
  }
  static async connect(url: string) {
    const parsed = new URL(url);
    if (!['amqp:', 'amqps:'].includes(parsed.protocol)) throw new Error('Invalid broker protocol.');
    const connection = await amqp.connect(url, { timeout: 10000 }),
      channel = await connection.createConfirmChannel();
    try {
      await assertLegacyMediaQueuesDrained(connection);
    } catch (error) {
      await connection.close();
      throw error;
    }
    const transport = new RabbitMediaTransport(connection, channel);
    connection.on('error', () => undefined);
    channel.on('error', () => undefined);
    await channel.assertExchange('business-platform.media.v1', 'direct', { durable: true });
    await channel.assertExchange('business-platform.media.dead.v1', 'fanout', { durable: true });
    await channel.assertQueue('business-platform.media.dead.v1', {
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });
    await channel.bindQueue(
      'business-platform.media.dead.v1',
      'business-platform.media.dead.v1',
      '',
    );
    for (const consumer of ['catalog', 'media']) {
      const queue = 'business-platform.media.' + consumer + '.v1';
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'business-platform.media.dead.v1',
          'x-delivery-limit': 5,
          'x-dead-letter-strategy': 'at-least-once',
          'x-overflow': 'reject-publish',
        },
      });
      await channel.bindQueue(queue, 'business-platform.media.v1', consumer);
    }
    await channel.prefetch(1);
    return transport;
  }
  async publish(consumer: 'catalog' | 'media', id: string, body: unknown) {
    // The runner serializes publications on this channel, so a return cannot be attributed to another in-flight event.
    let returned = false;
    const onReturn = (message: ConsumeMessage) => {
      if (message.properties.messageId === id) returned = true;
    };
    this.channel.on('return', onReturn);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Publisher confirmation timed out.')),
          10000,
        );
        this.channel.publish(
          'business-platform.media.v1',
          consumer,
          Buffer.from(JSON.stringify(body)),
          {
            persistent: true,
            mandatory: true,
            messageId: id,
            contentType: 'application/json',
            type: 'media.v1',
          },
          (error) => {
            clearTimeout(timer);
            if (error) reject(error);
            else resolve();
          },
        );
      });
      if (returned)
        throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Media event is unroutable.');
    } finally {
      this.channel.removeListener('return', onReturn);
    }
  }
  async consume(consumer: 'catalog' | 'media', apply: (input: unknown) => Promise<void>) {
    await this.channel.consume(
      'business-platform.media.' + consumer + '.v1',
      (message) => {
        if (!message) return;
        void (async () => {
          try {
            if (
              message.content.length > 65536 ||
              message.properties.contentType !== 'application/json'
            )
              throw new ApplicationError('VALIDATION_FAILED', 'Invalid broker envelope.');
            await apply(JSON.parse(message.content.toString('utf8')) as unknown);
            this.channel.ack(message);
          } catch (error) {
            const permanent =
              error instanceof SyntaxError ||
              (error instanceof ApplicationError &&
                ['VALIDATION_FAILED', 'INVALID_STATE'].includes(error.code));
            if (!permanent)
              await pause(
                Math.min(
                  30000,
                  1000 *
                    2 ** Math.min(5, Number(message.properties.headers?.['x-delivery-count'] ?? 0)),
                ),
              );
            this.channel.nack(message, false, !permanent);
          }
        })().catch(() => undefined);
      },
      { noAck: false },
    );
  }
  async close() {
    try {
      await this.channel.close();
    } finally {
      await this.connection.close();
    }
  }
}
