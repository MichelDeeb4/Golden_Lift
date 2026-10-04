import { setTimeout } from 'node:timers/promises';
/** Extract PostgreSQL states from driver/Prisma errors without inspecting sensitive messages. */
export function sqlState(error: unknown): string | undefined {
  const pending: unknown[] = [error],
    seen = new Set<object>();
  let prismaCode: string | undefined;
  for (let visited = 0; pending.length && visited < 16; visited++) {
    const current = pending.shift();
    if (typeof current !== 'object' || current === null || seen.has(current)) continue;
    seen.add(current);
    for (const key of ['originalCode', 'sqlState', 'code']) {
      if (key in current) {
        const value = Reflect.get(current, key);
        if (typeof value !== 'string') continue;
        if (/^P\d{4}$/.test(value)) prismaCode ??= value;
        else if (/^[0-9A-Z]{5}$/.test(value) || value === 'ECONNREFUSED' || value === 'ETIMEDOUT')
          return value;
      }
    }
    for (const key of ['cause', 'meta', 'driverAdapterError'])
      if (key in current) pending.push(Reflect.get(current, key));
  }
  switch (prismaCode) {
    case 'P2034':
      return '40001';
    case 'P2002':
      return '23505';
    case 'P2003':
      return '23503';
    case 'P2011':
      return '23502';
    case 'P1001':
    case 'P1002':
    case 'P2024':
    case 'P2028':
      return 'ETIMEDOUT';
    default:
      return undefined;
  }
}
/** Prisma owns connection/commit/rollback. Retry complete transactions, including COMMIT failures. */
export async function retryTransaction<T>(run: () => Promise<T>, maxAttempts = 3): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5)
    throw new Error('Transaction attempts must be between 1 and 5.');
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const code = sqlState(error);
      if ((code !== '40001' && code !== '40P01') || attempt === maxAttempts) throw error;
      await setTimeout(Math.min(200, 20 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 20));
    }
  }
}
export async function closePersistence(
  client: { $disconnect(): Promise<void> },
  pool: { end(): Promise<void> },
): Promise<void> {
  try {
    await client.$disconnect();
  } finally {
    await pool.end();
  }
}
