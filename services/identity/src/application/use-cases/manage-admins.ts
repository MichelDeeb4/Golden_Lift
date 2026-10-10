import { ApplicationError, version } from '@business-platform/contracts';
import type {
  AuthenticatedActor,
  StaffAccountDto,
  Uuid,
  Version,
  EventEnvelope,
} from '@business-platform/contracts';
import {
  accountDto,
  displayName,
  emailAddress,
  requireAdminTarget,
  requireSuperAdmin,
} from '../../domain/staff.js';
import type { StaffAccount } from '../../domain/staff.js';
import type {
  AdminDirectoryReader,
  IdentityUnitOfWork,
  ActionDelivery,
  SecurityTokens,
  Ids,
  Clock,
  IdentityPolicy,
  DirectoryCursor,
  DeliveryStatus,
} from '../ports/identity.js';
export class ManageAdmins {
  constructor(
    private readonly repository: AdminDirectoryReader,
    private readonly transactions: IdentityUnitOfWork,
    private readonly delivery: ActionDelivery,
    private readonly tokens: SecurityTokens,
    private readonly ids: Ids,
    private readonly clock: Clock,
    private readonly policy: IdentityPolicy,
  ) {}
  async detail(id: Uuid, actor: AuthenticatedActor): Promise<StaffAccountDto> {
    requireSuperAdmin(actor);
    const account = await this.repository.findAccount(id);
    if (!account) throw new ApplicationError('NOT_FOUND', 'Admin account not found.');
    requireAdminTarget(account);
    return accountDto(account);
  }
  async list(
    limit: number,
    cursor: DirectoryCursor | null,
    actor: AuthenticatedActor,
  ): Promise<readonly StaffAccountDto[]> {
    requireSuperAdmin(actor);
    return (await this.repository.listAdmins(limit, cursor)).map(accountDto);
  }
  async page(limit: number, cursor: DirectoryCursor | null, actor: AuthenticatedActor) {
    requireSuperAdmin(actor);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid staff page size.');
    return this.transactions.execute(async (repository) => {
      const totalItems = await repository.countAdmins(),
        rows = await repository.listAdmins(limit + 1, cursor);
      return { totalItems, rows: rows.map(accountDto) };
    }, true);
  }
  async invite(
    email: unknown,
    name: unknown,
    actor: AuthenticatedActor,
  ): Promise<{ account: StaffAccountDto; delivery: DeliveryStatus }> {
    requireSuperAdmin(actor);
    const address = emailAddress(email),
      display = displayName(name),
      token = this.tokens.newToken(),
      id = this.ids.uuid();
    const expiresAt = new Date(
      Date.parse(this.clock.now()) + this.policy.invitationSeconds * 1000,
    ).toISOString();
    const account = await this.transactions.execute(async (repository) => {
      const account = await repository.insertAccount(id, address, display, 'ADMIN', null);
      await repository.issueToken(
        this.ids.uuid(),
        id,
        'INVITATION',
        this.tokens.digest(token),
        expiresAt,
      );
      await repository.appendEvent(this.event('identity.admin.invited.v1', account));
      return account;
    });
    return {
      account: accountDto(account),
      delivery: await this.delivery.deliver({ purpose: 'INVITATION', email: address, token }),
    };
  }
  async resend(
    id: Uuid,
    expectedVersion: Version,
    actor: AuthenticatedActor,
  ): Promise<{ account: StaffAccountDto; delivery: DeliveryStatus }> {
    requireSuperAdmin(actor);
    const token = this.tokens.newToken(),
      expiresAt = new Date(
        Date.parse(this.clock.now()) + this.policy.invitationSeconds * 1000,
      ).toISOString();
    const account = await this.transactions.execute(async (repository) => {
      const current = await repository.findAccount(id, true);
      if (!current) throw new ApplicationError('NOT_FOUND', 'Admin account not found.');
      requireAdminTarget(current);
      if (current.status !== 'INVITED')
        throw new ApplicationError(
          'INVALID_STATE',
          'Only invited Admin accounts can receive invitations.',
        );
      const next = await repository.touchAccount(id, expectedVersion);
      await repository.issueToken(
        this.ids.uuid(),
        id,
        'INVITATION',
        this.tokens.digest(token),
        expiresAt,
      );
      await repository.appendEvent(this.event('identity.admin.invitation.reissued.v1', next));
      return next;
    });
    return {
      account: accountDto(account),
      delivery: await this.delivery.deliver({ purpose: 'INVITATION', email: account.email, token }),
    };
  }
  async change(
    id: Uuid,
    expectedVersion: Version,
    operation: 'edit' | 'disable' | 'enable' | 'delete',
    input: { email?: unknown; displayName?: unknown },
    actor: AuthenticatedActor,
  ): Promise<StaffAccountDto> {
    requireSuperAdmin(actor);
    const changed = await this.transactions.execute(async (repository) => {
      const current = await repository.findAccount(id, true);
      if (!current) throw new ApplicationError('NOT_FOUND', 'Admin account not found.');
      requireAdminTarget(current);
      const next = await repository.changeAccount(id, expectedVersion, {
        email: input.email === undefined ? current.email : emailAddress(input.email),
        displayName:
          input.displayName === undefined ? current.displayName : displayName(input.displayName),
        status:
          operation === 'disable' || operation === 'delete'
            ? 'DISABLED'
            : operation === 'enable'
              ? current.passwordHash
                ? 'ACTIVE'
                : 'INVITED'
              : current.status,
        deleted: operation === 'delete',
      });
      await repository.appendEvent(this.event('identity.admin.changed.v1', next));
      return next;
    });
    return accountDto(changed);
  }
  private event(type: string, account: StaffAccount): EventEnvelope {
    return {
      id: this.ids.uuid(),
      type,
      schemaVersion: 1,
      producer: 'identity',
      occurredAt: this.clock.now(),
      correlationId: this.ids.uuid(),
      aggregate: { type: 'StaffAccount', key: account.id, version: version(account.version) },
      data: { accountId: account.id },
    };
  }
}
