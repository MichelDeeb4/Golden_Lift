import { setTimeout as pause } from 'node:timers/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApplicationError } from '@golden-lift/contracts';
import { RabbitMediaTransport } from './rabbitmq.js';
import { createServer } from 'node:http';
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
  localHttp?: { readonly listenPort: number; readonly targetPort: number };
}) {
  secret(options.signingKey);
  secret(options.verificationKey);
  if (options.signingKey === options.verificationKey)
    throw new Error('Producer credentials must be distinct.');
  if (options.localHttp) {
    if (process.env['NODE_ENV'] === 'production')
      throw new Error('Local HTTP event transport is development-only.');
    return runLocalHttpRelay({ ...options, localHttp: options.localHttp });
  }
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

// Named development transport: real durable outboxes, signed contracts and owning-service consumers.
// Confirmation follows the receiver's committed application result. Replay keeps the original event ID.
async function runLocalHttpRelay(options: {
  store: OutboxRelayStore;
  signingKey: string;
  verificationKey: string;
  apply: (input: unknown) => Promise<void>;
  signal: AbortSignal;
  localHttp: { readonly listenPort: number; readonly targetPort: number };
}) {
  for (const port of [options.localHttp.listenPort, options.localHttp.targetPort])
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error('Invalid local relay port.');
  const server = createServer(async (request, response) => {
    response.setHeader('cache-control', 'no-store');
    if (request.method !== 'POST' || request.url !== '/events') {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) {
          response.writeHead(413).end();
          request.destroy();
          return;
        }
        chunks.push(chunk as Buffer);
      }
      const input = verified(
        JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
        options.verificationKey,
      );
      await options.apply(input);
      response.writeHead(200).end();
    } catch (error) {
      response
        .writeHead(
          error instanceof ApplicationError && error.code === 'VALIDATION_FAILED' ? 400 : 503,
        )
        .end();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.localHttp.listenPort, '127.0.0.1', resolve);
  });
  console.log(
    JSON.stringify({ event: 'events.local-http.ready', port: options.localHttp.listenPort }),
  );
  try {
    while (!options.signal.aborted) {
      let event: RelayEvent | null = null;
      try {
        event = await options.store.claim();
        if (event) {
          const response = await fetch(`http://127.0.0.1:${options.localHttp.targetPort}/events`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(signed(event.payload, options.signingKey)),
            signal: AbortSignal.any([options.signal, AbortSignal.timeout(8000)]),
            redirect: 'error',
          });
          if (!response.ok) throw new Error('Local consumer unavailable.');
          await options.store.confirmed(event);
        }
      } catch {
        if (event) await options.store.failed(event).catch(() => undefined);
        if (!options.signal.aborted)
          console.error(JSON.stringify({ event: 'events.local-http.unavailable' }));
      }
      await pause(event ? 100 : 1000, undefined, { signal: options.signal }).catch(() => undefined);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
