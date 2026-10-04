import { ApplicationError } from '@golden-lift/contracts';
import { retryTransaction, sqlState } from '@golden-lift/platform';
import type { IdentityRepository, IdentityUnitOfWork } from '../../application/ports/identity.js';
import type { PrismaClient } from './client.js';
import { PrismaIdentityRepository } from './repository.js';
function mapFailure(error: unknown): Error {
  if (error instanceof ApplicationError) return error;
  const code = sqlState(error);
  if (code === '23505')
    return new ApplicationError('CONFLICT', 'That account or credential already exists.');
  if (['23514', '23503', '23502'].includes(code ?? ''))
    return new ApplicationError('INVALID_STATE', 'The account change violates Identity rules.');
  return new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Identity is temporarily unavailable.');
}
export class PrismaIdentityUnitOfWork implements IdentityUnitOfWork {
  constructor(private readonly database: PrismaClient) {}
  async execute<T>(work: (repository: IdentityRepository) => Promise<T>): Promise<T> {
    try {
      return await retryTransaction(() =>
        this.database.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET LOCAL lock_timeout='3s'`;
            await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
            return work(new PrismaIdentityRepository(tx));
          },
          { isolationLevel: 'ReadCommitted', maxWait: 3000, timeout: 10000 },
        ),
      );
    } catch (error) {
      throw mapFailure(error);
    }
  }
}
