import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../.generated/client/index.js';
export interface DatabaseProfile {
  id: string;
  connectionString: string;
  credentialVersion: number;
  mode: 'pooled' | 'dedicated';
  expectedTenant: string | null;
}
export interface ExecutionScope {
  tenantId: string;
  generation: bigint;
}
export interface ConnectionLimits {
  maxPools: number;
  maxProfiles: number;
  perPool: number;
  globalConnections: number;
  maxWaiters: number;
  acquireMs: number;
  idleMs: number;
  transactionMs: number;
}
interface Entry {
  client: PrismaClient;
  pool: Pool;
  profile: DatabaseProfile;
  leases: number;
  lastUsed: number;
}
interface Waiter {
  wake: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
export class TenantConnections {
  private readonly entries = new Map<string, Entry>();
  private readonly versions = new Map<string, number>();
  private readonly waiters: Waiter[] = [];
  private closed = false;
  private acquisitions = 0;
  private poolFailures = 0;
  private allocation: Promise<void> = Promise.resolve();
  constructor(private readonly limits: ConnectionLimits) {
    for (const value of Object.values(limits))
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid connection budget');
    if (limits.maxPools * limits.perPool > limits.globalConnections)
      throw new Error('Pool reservations exceed global budget');
  }
  stats() {
    return {
      pools: this.entries.size,
      poolFailures: this.poolFailures,
      reserved: this.entries.size * this.limits.perPool,
      leases: [...this.entries.values()].reduce((n, e) => n + e.leases, 0),
      queued: this.waiters.length,
      physical: [...this.entries.values()].reduce((n, e) => n + e.pool.totalCount, 0),
    };
  }
  private notify() {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.wake();
    }
  }
  private async evict(entry: Entry) {
    if (entry.leases) throw new Error('Cannot evict leased pool');
    this.entries.delete(entry.profile.id);
    await entry.client.$disconnect();
    await entry.pool.end();
  }
  private async acquire(profile: DatabaseProfile, signal?: AbortSignal): Promise<Entry> {
    if (this.acquisitions >= this.limits.globalConnections + this.limits.maxWaiters)
      throw new Error('Connection queue full');
    this.acquisitions++;
    try {
      return await this.acquireInternal(profile, signal);
    } finally {
      this.acquisitions--;
    }
  }
  private async acquireInternal(profile: DatabaseProfile, signal?: AbortSignal): Promise<Entry> {
    const deadline = Date.now() + this.limits.acquireMs;
    while (true) {
      if (this.closed) throw new Error('Connections closed');
      if (signal?.aborted) throw new Error('Acquisition cancelled');
      const entry = await this.allocate(profile);
      if (signal?.aborted) {
        if (entry) {
          entry.leases--;
          this.notify();
        }
        throw new Error('Acquisition cancelled');
      }
      if (entry) return entry;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Connection acquisition deadline');
      if (this.waiters.length >= this.limits.maxWaiters) throw new Error('Connection queue full');
      await new Promise<void>((resolve, reject) => {
        const remove = () => {
          const i = this.waiters.indexOf(waiter);
          if (i >= 0) this.waiters.splice(i, 1);
          signal?.removeEventListener('abort', abort);
        };
        const abort = () => {
          remove();
          clearTimeout(waiter.timer);
          reject(new Error('Acquisition cancelled'));
        };
        const waiter: Waiter = {
          wake: () => {
            remove();
            resolve();
          },
          reject: (e) => {
            remove();
            reject(e);
          },
          timer: setTimeout(() => {
            remove();
            reject(new Error('Connection acquisition deadline'));
          }, remaining),
        };
        this.waiters.push(waiter);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    }
  }
  private async allocate(profile: DatabaseProfile): Promise<Entry | undefined> {
    const priorAllocation = this.allocation;
    let release!: () => void;
    this.allocation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await priorAllocation;
    try {
      if (this.closed) throw new Error('Connections closed');
      if (!this.versions.has(profile.id) && this.versions.size >= this.limits.maxProfiles)
        throw new Error('Profile tracking budget exceeded');
      const prior = this.versions.get(profile.id);
      if (prior !== undefined && profile.credentialVersion < prior)
        throw new Error('Stale credential version');
      let entry = this.entries.get(profile.id);
      if (
        entry &&
        (entry.profile.credentialVersion !== profile.credentialVersion ||
          entry.profile.connectionString !== profile.connectionString)
      ) {
        if (entry.leases) throw new Error('Credential rotation draining');
        await this.evict(entry);
        entry = undefined;
      }
      if (!entry && this.entries.size >= this.limits.maxPools) {
        const idle = [...this.entries.values()]
          .filter((e) => !e.leases)
          .sort((a, b) => a.lastUsed - b.lastUsed)[0];
        if (idle) await this.evict(idle);
      }
      if (!entry && this.entries.size < this.limits.maxPools) {
        const pool = new Pool({
          connectionString: profile.connectionString,
          max: this.limits.perPool,
          connectionTimeoutMillis: this.limits.acquireMs,
          idleTimeoutMillis: this.limits.idleMs,
          application_name: 'business-platform-erp',
        });
        // Bound pg's pool; adapter receives the exact owned pool, never creates a second pool.
        pool.on('error', () => {
          this.poolFailures++;
        });
        const adapter = new PrismaPg(pool, { disposeExternalPool: false });
        const client = new PrismaClient({ adapter });
        entry = { client, pool, profile: { ...profile }, leases: 0, lastUsed: Date.now() };
        this.entries.set(profile.id, entry);
        this.versions.set(profile.id, profile.credentialVersion);
      }
      if (entry && entry.leases < this.limits.perPool) {
        entry.leases++;
        return entry;
      }
      return undefined;
    } finally {
      release();
    }
  }
  async transaction<T>(
    profile: DatabaseProfile,
    scope: ExecutionScope,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    signal?: AbortSignal,
    options: { isolation?: Prisma.TransactionIsolationLevel; retries?: number } = {},
  ): Promise<T> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.tenantId) ||
      scope.generation < 1n
    )
      throw new Error('Invalid transaction scope');
    if (profile.mode === 'dedicated' && profile.expectedTenant !== scope.tenantId)
      throw new Error('Dedicated tenant mismatch');
    profile = Object.freeze({ ...profile });
    scope = Object.freeze({ ...scope });
    const retries = options.retries ?? 0;
    if (!Number.isInteger(retries) || retries < 0 || retries > 3)
      throw new Error('Invalid transaction retry bound');
    const entry = await this.acquire(profile, signal);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await entry.client.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT set_config('app.tenant_id',${scope.tenantId},true),set_config('app.generation',${scope.generation.toString()},true)`;
              const binding = await tx.$queryRaw<
                { tenant: string | null }[]
              >`SELECT public.scoped_tenant()::text AS tenant`;
              if (binding[0]?.tenant !== scope.tenantId)
                throw new Error('Database tenant binding mismatch');
              const settings =
                await tx.$queryRaw`SELECT set_config('statement_timeout',${this.limits.transactionMs.toString()},true)`;
              void settings;
              return operation(tx);
            },
            {
              maxWait: this.limits.acquireMs,
              timeout: this.limits.transactionMs,
              isolationLevel: options.isolation ?? Prisma.TransactionIsolationLevel.ReadCommitted,
            },
          );
        } catch (error) {
          const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : '';
          if (attempt >= retries || code !== 'P2034') throw error;
          if (signal?.aborted) throw new Error('Transaction retry cancelled');
          await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
        }
      }
    } finally {
      entry.leases--;
      entry.lastUsed = Date.now();
      this.notify();
    }
  }
  async reapIdle() {
    for (const e of [...this.entries.values()])
      if (!e.leases && Date.now() - e.lastUsed >= this.limits.idleMs) await this.evict(e);
  }
  async close() {
    this.closed = true;
    for (const w of this.waiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(new Error('Connections closed'));
    }
    const deadline = Date.now() + this.limits.transactionMs + this.limits.acquireMs;
    while ([...this.entries.values()].some((e) => e.leases) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 5));
    if ([...this.entries.values()].some((e) => e.leases))
      throw new Error('Active transactions did not drain before shutdown');
    for (const e of [...this.entries.values()]) await this.evict(e);
  }
}
