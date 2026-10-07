import assert from 'node:assert/strict';
import { test } from 'node:test';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { runOutboxRelay } from '../src/outbox-relay.js';
import type { OutboxRelayStore, RelayEvent } from '../src/outbox-relay.js';
async function port() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
test('named local transport confirms committed consumers, retries the same event and rejects unsigned bodies', async () => {
  const sender = await port(),
    receiver = await port(),
    stop = new AbortController(),
    a = randomBytes(32).toString('base64url'),
    b = randomBytes(32).toString('base64url');
  let confirmed = false,
    failures = 0,
    applied = 0;
  const event: RelayEvent = {
    id: 'retained-event',
    token: 'lease',
    payload: { id: 'retained-event' },
  };
  const store: OutboxRelayStore = {
    claim: async () => (confirmed ? null : event),
    confirmed: async () => {
      assert.ok(applied >= 2);
      confirmed = true;
    },
    failed: async () => {
      failures++;
    },
  };
  const idle: OutboxRelayStore = {
    claim: async () => null,
    confirmed: async () => {},
    failed: async () => {},
  };
  const consumer = runOutboxRelay({
    url: '',
    service: 'catalog',
    store: idle,
    signingKey: b,
    verificationKey: a,
    signal: stop.signal,
    localHttp: { listenPort: receiver, targetPort: sender },
    apply: async (input) => {
      assert.deepEqual(input, event.payload);
      applied++;
      if (applied === 1) throw new Error('Temporary transaction failure');
    },
  });
  const producer = runOutboxRelay({
    url: '',
    service: 'media',
    store,
    signingKey: a,
    verificationKey: b,
    signal: stop.signal,
    localHttp: { listenPort: sender, targetPort: receiver },
    apply: async () => {},
  });
  try {
    const deadline = Date.now() + 5000;
    while (!confirmed && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(confirmed, true);
    assert.ok(failures >= 1);
    assert.equal(applied, 2);
    const unauthorized = await fetch(`http://127.0.0.1:${receiver}/events`, {
      method: 'POST',
      body: JSON.stringify(event.payload),
    });
    assert.equal(unauthorized.status, 400);
    assert.equal(applied, 2);
  } finally {
    stop.abort();
    await Promise.all([producer, consumer]);
  }
});
