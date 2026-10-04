import { staffEvent } from '../ports/staff-event.js';
import { ApplicationError } from '@golden-lift/contracts';
import type {
  PrincipalResult,
  LoginResult,
  StaffAuthenticationReader,
  IdentityUnitOfWork,
  PasswordHasher,
  SecurityTokens,
  Clock,
  Ids,
  IdentityPolicy,
} from '../ports/identity.js';
import { accountDto, emailAddress, newPassword } from '../../domain/staff.js';
const invalid = () =>
  new ApplicationError('UNAUTHENTICATED', 'Invalid credentials or inactive account.');
export class AuthenticateStaff {
  constructor(
    private readonly repository: StaffAuthenticationReader,
    private readonly transactions: IdentityUnitOfWork,
    private readonly passwords: PasswordHasher,
    private readonly tokens: SecurityTokens,
    private readonly ids: Ids,
    private readonly clock: Clock,
    private readonly policy: IdentityPolicy,
  ) {}
  async login(email: unknown, password: unknown): Promise<LoginResult> {
    const normalized = emailAddress(email);
    if (typeof password !== 'string' || password.length > 512) throw invalid();
    const candidate = await this.repository.findByEmail(normalized);
    const valid = await this.passwords.verify(password, candidate?.passwordHash ?? null);
    if (!valid || !candidate || candidate.status !== 'ACTIVE') throw invalid();
    const token = this.tokens.newToken(),
      digest = this.tokens.digest(token),
      id = this.ids.uuid();
    const expiresAt = new Date(
      Date.parse(this.clock.now()) + this.policy.sessionSeconds * 1000,
    ).toISOString();
    return this.transactions.execute(async (repository) => {
      const current = await repository.findAccount(candidate.id, true);
      if (
        !current ||
        current.status !== 'ACTIVE' ||
        current.authVersion !== candidate.authVersion ||
        current.passwordHash !== candidate.passwordHash
      )
        throw invalid();
      await repository.createSession(id, current, digest, expiresAt);
      return {
        token,
        session: { account: accountDto(current), expiresAt, csrfToken: this.tokens.csrf(token) },
      };
    });
  }
  async current(token: string | null): Promise<PrincipalResult> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ApplicationError('UNAUTHENTICATED', 'A valid staff session is required.');
    const session = await this.repository.session(this.tokens.digest(token));
    if (!session)
      throw new ApplicationError('UNAUTHENTICATED', 'A valid staff session is required.');
    return {
      actor: {
        id: session.account.id,
        role: session.account.role,
        authVersion: session.account.authVersion,
      },
      session: {
        account: accountDto(session.account),
        expiresAt: session.expiresAt,
        csrfToken: this.tokens.csrf(token),
      },
    };
  }
  async logout(token: string): Promise<void> {
    await this.transactions.execute((repository) =>
      repository.revokeSession(this.tokens.digest(token)),
    );
  }
  async changePassword(token: string, oldPassword: unknown, password: unknown): Promise<void> {
    const current = await this.current(token),
      candidate = await this.repository.findAccount(current.actor.id);
    if (
      typeof oldPassword !== 'string' ||
      oldPassword.length > 512 ||
      !candidate ||
      !(await this.passwords.verify(oldPassword, candidate.passwordHash))
    )
      throw invalid();
    const hash = await this.passwords.hash(newPassword(password));
    await this.transactions.execute(async (repository) => {
      const locked = await repository.findAccount(candidate.id, true);
      if (
        !locked ||
        locked.authVersion !== current.actor.authVersion ||
        locked.passwordHash !== candidate.passwordHash ||
        !(await repository.session(this.tokens.digest(token)))
      )
        throw invalid();
      const updated = await repository.setPassword(locked.id, hash, false);
      await repository.appendEvent(
        staffEvent('identity.staff.password.changed.v1', updated, this.ids, this.clock),
      );
    });
  }
}
