import { ApplicationError, eventEnvelope, uuid, version } from '@business-platform/contracts';
import type { EventEnvelope, Role, Uuid, Version } from '@business-platform/contracts';
import type { StaffAccount } from '../../domain/staff.js';
import type {
  IdentityRepository,
  AccountChange,
  DirectoryCursor,
  SessionRecord,
  TokenPurpose,
} from '../../application/ports/identity.js';
import type { Database } from './client.js';
import { Prisma } from './generated/client.js';
const fields = {
  id: true,
  email: true,
  display_name: true,
  role: true,
  status: true,
  password_hash: true,
  auth_version: true,
  version: true,
} satisfies Prisma.StaffAccountsSelect;
type Row = Prisma.StaffAccountsGetPayload<{ select: typeof fields }>;
const digestBytes = (digest: string) => new Uint8Array(Buffer.from(digest, 'hex'));
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly database: Database) {}
  private async accounts(rows: readonly Row[]): Promise<StaffAccount[]> {
    if (!rows.length) return [];
    // Prisma Date values have millisecond precision. Preserve immutable cursor timestamps
    // with a narrow SQL projection, while model reads/writes remain generated Prisma operations.
    const timestamps = await this.database.$queryRaw<
      { id: string; created: string; updated: string }[]
    >`
      SELECT id,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created,
        to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated
      FROM identity.staff_accounts WHERE id IN (${Prisma.join(rows.map((row) => Prisma.sql`${row.id}::uuid`))})`;
    const projected = new Map(timestamps.map((row) => [row.id, row]));
    return rows.map((row) => {
      const timestamps = projected.get(row.id);
      const createdAt = timestamps?.created,
        updatedAt = timestamps?.updated;
      if (
        !createdAt ||
        !updatedAt ||
        (row.role !== 'ADMIN' && row.role !== 'SUPER_ADMIN') ||
        (row.status !== 'INVITED' && row.status !== 'ACTIVE' && row.status !== 'DISABLED')
      )
        throw new ApplicationError('INTERNAL_ERROR', 'Account data is unavailable.');
      return {
        id: uuid(row.id),
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        status: row.status,
        passwordHash: row.password_hash,
        authVersion: version(row.auth_version.toString()),
        version: version(row.version.toString()),
        createdAt,
        updatedAt,
      };
    });
  }
  private async required(row: Row | undefined): Promise<StaffAccount> {
    const result = row ? (await this.accounts([row]))[0] : undefined;
    if (!result) throw new ApplicationError('INTERNAL_ERROR', 'Account data is unavailable.');
    return result;
  }
  private async now(): Promise<Date> {
    const [row] = await this.database.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    if (!row)
      throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Identity is temporarily unavailable.');
    return row.now;
  }
  async findByEmail(email: string): Promise<StaffAccount | null> {
    const row = await this.database.staffAccounts.findFirst({
      where: { email_key: email, deleted_at: null },
      select: fields,
    });
    return row ? this.required(row) : null;
  }
  async findAccount(id: Uuid, lock = false): Promise<StaffAccount | null> {
    if (lock)
      await this.database
        .$queryRaw`SELECT id FROM identity.staff_accounts WHERE id=${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const row = await this.database.staffAccounts.findFirst({
      where: { id, deleted_at: null },
      select: fields,
    });
    return row ? this.required(row) : null;
  }
  async listAdmins(limit: number, after: DirectoryCursor | null): Promise<readonly StaffAccount[]> {
    // Exact timestamp ordering requires the PostgreSQL microseconds from the signed cursor.
    const keys = await this.database.$queryRaw<
      { id: string }[]
    >`SELECT id FROM identity.staff_accounts
      WHERE role='ADMIN' AND deleted_at IS NULL AND (${after?.createdAt ?? null}::timestamptz IS NULL
        OR created_at < ${after?.createdAt ?? null}::timestamptz
        OR (created_at=${after?.createdAt ?? null}::timestamptz AND id > ${after?.id ?? null}::uuid))
      ORDER BY created_at DESC,id LIMIT ${limit}`;
    if (!keys.length) return [];
    const rows = await this.database.staffAccounts.findMany({
      where: { id: { in: keys.map((key) => key.id) }, role: 'ADMIN', deleted_at: null },
      select: fields,
    });
    const accounts = new Map((await this.accounts(rows)).map((row) => [row.id as string, row]));
    return keys.flatMap((key) => {
      const row = accounts.get(key.id);
      return row ? [row] : [];
    });
  }
  countAdmins() {
    return this.database.staffAccounts.count({ where: { role: 'ADMIN', deleted_at: null } });
  }
  async insertAccount(
    id: Uuid,
    email: string,
    name: string,
    role: Role,
    hash: string | null,
  ): Promise<StaffAccount> {
    const row = await this.database.staffAccounts.create({
      data: {
        id,
        email,
        display_name: name,
        role,
        status: hash ? 'ACTIVE' : 'INVITED',
        password_hash: hash,
      },
      select: fields,
    });
    return this.required(row);
  }
  async bootstrapLock(): Promise<void> {
    await this.database.$executeRaw`SELECT pg_advisory_xact_lock(17320481)`;
  }
  async hasSuperAdmin(): Promise<boolean> {
    return !!(await this.database.staffAccounts.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    }));
  }
  async changeAccount(id: Uuid, expected: Version, change: AccountChange): Promise<StaffAccount> {
    const [row] = await this.database.staffAccounts.updateManyAndReturn({
      where: { id, version: BigInt(expected), deleted_at: null },
      data: {
        email: change.email,
        display_name: change.displayName,
        status: change.status,
        deleted_at: change.deleted ? await this.now() : null,
      },
      select: fields,
    });
    if (!row)
      throw new ApplicationError('VERSION_CONFLICT', 'Account changed; reload before editing.');
    return this.required(row);
  }
  async touchAccount(id: Uuid, expected: Version): Promise<StaffAccount> {
    const [row] = await this.database.staffAccounts.updateManyAndReturn({
      where: { id, version: BigInt(expected), deleted_at: null },
      data: { version: BigInt(expected) },
      select: fields,
    });
    if (!row)
      throw new ApplicationError('VERSION_CONFLICT', 'Account changed; reload before editing.');
    return this.required(row);
  }
  async setPassword(id: Uuid, hash: string, activate: boolean): Promise<StaffAccount> {
    const [row] = await this.database.staffAccounts.updateManyAndReturn({
      where: { id, deleted_at: null },
      data: { password_hash: hash, ...(activate ? { status: 'ACTIVE' } : {}) },
      select: fields,
    });
    if (!row) throw new ApplicationError('NOT_FOUND', 'Account not found.');
    return this.required(row);
  }
  async createSession(
    id: Uuid,
    staff: StaffAccount,
    digest: string,
    expiresAt: string,
  ): Promise<void> {
    await this.database.staffSessions.create({
      data: {
        id,
        staff_id: staff.id,
        token_hash: digestBytes(digest),
        auth_version: BigInt(staff.authVersion),
        expires_at: new Date(expiresAt),
      },
      select: { id: true },
    });
  }
  async session(digest: string): Promise<SessionRecord | null> {
    // Expiration/auth-version checks use database time and one snapshot, not application clocks.
    const [key] = await this.database.$queryRaw<
      { staff_id: string; auth_version: bigint; expires: string }[]
    >`
      SELECT s.staff_id,s.auth_version,to_char(s.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS expires
      FROM identity.staff_sessions s JOIN identity.staff_accounts a ON a.id=s.staff_id
      WHERE s.token_hash=${digestBytes(digest)}::bytea AND s.deleted_at IS NULL AND s.revoked_at IS NULL
        AND s.expires_at>clock_timestamp() AND a.deleted_at IS NULL AND a.status='ACTIVE' AND a.auth_version=s.auth_version`;
    if (!key) return null;
    const row = await this.database.staffAccounts.findFirst({
      where: {
        id: key.staff_id,
        deleted_at: null,
        status: 'ACTIVE',
        auth_version: key.auth_version,
      },
      select: fields,
    });
    return row ? { account: await this.required(row), expiresAt: key.expires } : null;
  }
  async revokeSession(digest: string): Promise<void> {
    await this.database.staffSessions.updateMany({
      where: { token_hash: digestBytes(digest), deleted_at: null, revoked_at: null },
      data: { revoked_at: await this.now() },
    });
  }
  async findToken(digest: string, purpose: TokenPurpose): Promise<Uuid | null> {
    const [row] = await this.database.$queryRaw<
      { staff_id: string }[]
    >`SELECT staff_id FROM identity.staff_tokens
      WHERE token_hash=${digestBytes(digest)}::bytea AND purpose=${purpose} AND expires_at>clock_timestamp()
        AND consumed_at IS NULL AND revoked_at IS NULL AND deleted_at IS NULL`;
    return row ? uuid(row.staff_id) : null;
  }
  async issueToken(
    id: Uuid,
    accountId: Uuid,
    purpose: TokenPurpose,
    digest: string,
    expiresAt: string,
  ): Promise<void> {
    await this.database.staffTokens.updateMany({
      where: {
        staff_id: accountId,
        purpose,
        revoked_at: null,
        consumed_at: null,
        deleted_at: null,
      },
      data: { revoked_at: await this.now() },
    });
    await this.database.staffTokens.create({
      data: {
        id,
        staff_id: accountId,
        purpose,
        token_hash: digestBytes(digest),
        expires_at: new Date(expiresAt),
      },
      select: { id: true },
    });
  }
  async consumeToken(digest: string, purpose: TokenPurpose, id: Uuid): Promise<boolean> {
    // Atomic, server-timed consume; ORM Date predicates would lose sub-millisecond expiry.
    const rows = await this.database.$queryRaw<
      { id: string }[]
    >`UPDATE identity.staff_tokens SET consumed_at=clock_timestamp()
      WHERE token_hash=${digestBytes(digest)}::bytea AND purpose=${purpose} AND staff_id=${id}::uuid
        AND expires_at>clock_timestamp() AND revoked_at IS NULL AND consumed_at IS NULL AND deleted_at IS NULL RETURNING id`;
    return rows.length === 1;
  }
  async appendEvent(input: EventEnvelope): Promise<void> {
    const event = eventEnvelope(input);
    await this.database.outboxEvents.create({
      data: {
        id: event.id,
        aggregate_type: event.aggregate.type,
        aggregate_id: event.aggregate.key,
        aggregate_version: BigInt(event.aggregate.version),
        event_type: event.type,
        payload: {
          ...event,
          aggregate: { ...event.aggregate },
          data: event.data as Prisma.InputJsonObject,
        },
      },
      select: { id: true },
    });
  }
}
