import type pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';
import type { Prisma } from './generated/client.js';
/** Composition creates one client for this service; Prisma owns transaction clients. */
export function orm(pool: pg.Pool): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: false }),
    log: [],
    errorFormat: 'minimal',
  });
}
export type Database = Prisma.TransactionClient;
export type { PrismaClient } from './generated/client.js';
