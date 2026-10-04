import assert from 'node:assert/strict';
import test from 'node:test';
import { retryTransaction, sqlState, closePersistence } from '../src/transactions.js';
test('Prisma and raw/adapter SQL failures retain their structured SQL states', () => {
  for (const [error, expected] of [
    [{ code: 'P2034' }, '40001'],
    [{ code: 'P2002' }, '23505'],
    [{ code: 'P2003' }, '23503'],
    [{ code: 'P2010', meta: { code: '23514' } }, '23514'],
    [
      { code: 'P2004', meta: { driverAdapterError: { cause: { originalCode: '23514' } } } },
      '23514',
    ],
    [new Error('Wrapped', { cause: { code: '40P01' } }), '40P01'],
    [{ code: 'ECONNREFUSED' }, 'ECONNREFUSED'],
  ] as const)
    assert.equal(sqlState(error), expected);
});
test('failure inspection rejects invalid states and handles cyclic causes', () => {
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  for (const input of [cycle, null, 'failure', { code: 40001 }, { code: 'P9999' }])
    assert.equal(sqlState(input), undefined);
});
test('serialization/deadlock failures retry complete transactions including commit', async () => {
  let transactions = 0,
    work = 0;
  const result = await retryTransaction(async () => {
    transactions++;
    work++;
    if (transactions === 1) throw { code: 'P2034' };
    if (transactions === 2) throw new Error('Commit', { cause: { code: '40P01' } });
    return 'committed';
  });
  assert.equal(result, 'committed');
  assert.equal(work, 3);
  assert.equal(transactions, 3);
});
test('retries are bounded and preserve the final driver failure', async () => {
  let attempts = 0;
  const failure = { code: 'P2034' };
  await assert.rejects(
    retryTransaction(async () => {
      attempts++;
      throw failure;
    }, 2),
    (error: unknown) => error === failure,
  );
  assert.equal(attempts, 2);
});
test('business and unrelated dependency failures are never retried', async () => {
  for (const failure of [new Error('Business'), { code: 'P2002' }, { code: 'ECONNREFUSED' }]) {
    let attempts = 0;
    await assert.rejects(
      retryTransaction(async () => {
        attempts++;
        throw failure;
      }),
      (error: unknown) => error === failure,
    );
    assert.equal(attempts, 1);
  }
});
test('invalid attempt limits fail before running any transaction', async () => {
  let attempts = 0;
  for (const limit of [0, 6, 1.5, NaN])
    await assert.rejects(retryTransaction(async () => ++attempts, limit));
  assert.equal(attempts, 0);
});
test('database shutdown closes the external pool even if Prisma disconnect fails', async () => {
  const order: string[] = [];
  const failure = new Error('Disconnect');
  await assert.rejects(
    closePersistence(
      {
        $disconnect: async () => {
          order.push('prisma');
          throw failure;
        },
      },
      {
        end: async () => {
          order.push('pool');
        },
      },
    ),
    (error: unknown) => error === failure,
  );
  assert.deepEqual(order, ['prisma', 'pool']);
});
