import { staffEvent } from '../ports/staff-event.js';
import { ApplicationError } from '@business-platform/contracts';
import type { StaffAccountDto } from '@business-platform/contracts';
import { accountDto, displayName, emailAddress, newPassword } from '../../domain/staff.js';
import type { IdentityUnitOfWork, PasswordHasher, Ids, Clock } from '../ports/identity.js';
export class BootstrapSuperAdmin {
  constructor(
    private readonly transactions: IdentityUnitOfWork,
    private readonly passwords: PasswordHasher,
    private readonly ids: Ids,
    private readonly clock: Clock,
  ) {}
  async execute(email: unknown, name: unknown, password: unknown): Promise<StaffAccountDto> {
    const address = emailAddress(email),
      display = displayName(name),
      hash = await this.passwords.hash(newPassword(password)),
      id = this.ids.uuid();
    return this.transactions.execute(async (repository) => {
      await repository.bootstrapLock();
      if (await repository.hasSuperAdmin())
        throw new ApplicationError('CONFLICT', 'Super Admin bootstrap has already been completed.');
      const account = await repository.insertAccount(id, address, display, 'SUPER_ADMIN', hash);
      await repository.appendEvent(
        staffEvent('identity.staff.bootstrapped.v1', account, this.ids, this.clock),
      );
      return accountDto(account);
    });
  }
}
