import { setTimeout as pause } from 'node:timers/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApplicationError } from '@golden-lift/contracts';
import { RabbitMediaTransport } from './rabbitmq.js';
export interface RelayEvent {
  readonly id: string;
  readonly token: string;
  readonly payload: unknown;
}
export interface OutboxRelayStore {
  claim(): Promise<RelayEvent | null>;
  confirmed(event: RelayEvent): Promise<void>;
  failed(event: RelayEvent): Promise<void>;
}
function secret(key: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(key)) throw new Error('Invalid Media event credential.');
}
function signed(payload: unknown, key: string) {
  secret(key);
  return {
    payload,
    signature: createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex'),
  };
}
function verified(input: unknown, key: string): unknown {
  secret(key);
  if (
    typeof input !== 'object' ||
    input === null ||
    !('payload' in input) ||
    !('signature' in input) ||
    typeof input.signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.signature)
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid event signature.');
  const expected = createHmac('sha256', key).update(JSON.stringify(input.payload)).digest(),
    supplied = Buffer.from(input.signature, 'hex');
  if (!timingSafeEqual(expected, supplied))
    throw new ApplicationError('VALIDATION_FAILED', 'Untrusted event producer.');
  return input.payload;
}
export async function runOutboxRelay(options: {
  url: string;
  service: 'catalog' | 'media';
  store: OutboxRelayStore;
  signingKey: string;
  verificationKey: string;
  apply: (input: unknown) => Promise<void>;
  signal: AbortSignal;
}) {
  secret(options.signingKey);
  secret(options.verificationKey);
  if (options.signingKey === options.verificationKey)
    throw new Error('Producer credentials must be distinct.');
  while (!options.signal.aborted) {
    let broker: RabbitMediaTransport | undefined;
    try {
      broker = await RabbitMediaTransport.connect(options.url);
      await broker.consume(options.service, (input) =>
        options.apply(verified(input, options.verificationKey)),
      );
      while (!options.signal.aborted && !broker.closed) {
        const event = await options.store.claim();
        if (!event) {
          await pause(1000, undefined, { signal: options.signal }).catch(() => undefined);
          continue;
        }
        try {
          await broker.publish(
            options.service === 'catalog' ? 'media' : 'catalog',
            event.id,
            signed(event.payload, options.signingKey),
          );
          await options.store.confirmed(event);
        } catch {
          await options.store.failed(event);
          throw new Error('Event publication unavailable.');
        }
      }
    } catch {
      console.error(
        JSON.stringify({ event: 'media.events.unavailable', service: options.service }),
      );
    } finally {
      await broker?.close().catch(() => undefined);
    }
    if (!options.signal.aborted)
      await pause(1000, undefined, { signal: options.signal }).catch(() => undefined);
  }
}
