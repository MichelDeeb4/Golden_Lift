import { staffEvent } from '../ports/staff-event.js';
import { ApplicationError } from '@golden-lift/contracts';
import { emailAddress, newPassword } from '../../domain/staff.js';
import type {
  ActionTokenReader,
  IdentityUnitOfWork,
  PasswordHasher,
  ActionDelivery,
  SecurityTokens,
  Ids,
  Clock,
  IdentityPolicy,
  TokenPurpose,
} from '../ports/identity.js';
export class ActionTokens {
  constructor(
    private readonly repository: ActionTokenReader,
    private readonly transactions: IdentityUnitOfWork,
    private readonly passwords: PasswordHasher,
    private readonly delivery: ActionDelivery,
    private readonly tokens: SecurityTokens,
    private readonly ids: Ids,
    private readonly clock: Clock,
    private readonly policy: IdentityPolicy,
  ) {}
  async requestReset(email: unknown): Promise<void> {
    const address = emailAddress(email),
      token = this.tokens.newToken(),
      digest = this.tokens.digest(token),
      expiresAt = new Date(
        Date.parse(this.clock.now()) + this.policy.resetSeconds * 1000,
      ).toISOString();
    const account = await this.repository.findByEmail(address);
    if (!account || account.status !== 'ACTIVE') return;
    const issued = await this.transactions.execute(async (repository) => {
      const current = await repository.findAccount(account.id, true);
      if (!current || current.status !== 'ACTIVE' || current.email !== address) return false;
      await repository.touchAccount(current.id, current.version);
      await repository.issueToken(this.ids.uuid(), current.id, 'PASSWORD_RESET', digest, expiresAt);
      return true;
    });
    if (issued) this.delivery.schedule({ purpose: 'PASSWORD_RESET', email: address, token });
  }
  async consume(token: unknown, password: unknown, purpose: TokenPurpose): Promise<void> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ApplicationError('VALIDATION_FAILED', 'Action token is invalid or expired.');
    const digest = this.tokens.digest(token),
      id = await this.repository.findToken(digest, purpose);
    if (!id) throw new ApplicationError('VALIDATION_FAILED', 'Action token is invalid or expired.');
    const hash = await this.passwords.hash(newPassword(password));
    await this.transactions.execute(async (repository) => {
      const current = await repository.findAccount(id, true);
      if (
        !current ||
        current.status !== (purpose === 'INVITATION' ? 'INVITED' : 'ACTIVE') ||
        (purpose === 'INVITATION' && current.role !== 'ADMIN') ||
        !(await repository.consumeToken(digest, purpose, id))
      )
        throw new ApplicationError('VALIDATION_FAILED', 'Action token is invalid or expired.');
      const updated = await repository.setPassword(id, hash, purpose === 'INVITATION');
      await repository.appendEvent(
        staffEvent(
          purpose === 'INVITATION'
            ? 'identity.admin.activated.v1'
            : 'identity.staff.password.reset.v1',
          updated,
          this.ids,
          this.clock,
        ),
      );
    });
  }
}
