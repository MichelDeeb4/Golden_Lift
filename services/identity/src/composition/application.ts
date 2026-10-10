import { PrismaReadiness } from '../infrastructure/prisma/readiness.js';
import { CheckReadiness } from '../application/use-cases/check-readiness.js';
import { orm } from '../infrastructure/prisma/client.js';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { uuid } from '@business-platform/contracts';
import { closePersistence, httpApplication } from '@business-platform/platform';
import { AuthenticateStaff } from '../application/use-cases/authenticate-staff.js';
import { ManageAdmins } from '../application/use-cases/manage-admins.js';
import { ActionTokens } from '../application/use-cases/action-tokens.js';
import { BootstrapSuperAdmin } from '../application/use-cases/bootstrap-super-admin.js';
import { PrismaIdentityRepository } from '../infrastructure/prisma/repository.js';
import { PrismaIdentityUnitOfWork } from '../infrastructure/prisma/unit-of-work.js';
import { NodeArgon2, OpaqueTokens } from '../infrastructure/security/crypto.js';
import { ServiceCredentials } from '../infrastructure/security/service-credentials.js';
import { DeliveryCoordinator, LocalMailbox, SmtpSender } from '../infrastructure/mail/delivery.js';
import type { MailSender } from '../infrastructure/mail/delivery.js';
import type { IdentityConfig } from '../infrastructure/config.js';
import { AuthController } from '../presentation/http/auth-controller.js';
import { AdminsController } from '../presentation/http/admins-controller.js';
import { IntrospectionController } from '../presentation/http/introspection-controller.js';
import { IDENTITY_HTTP } from '../presentation/http/context.js';
import type { IdentityHttp } from '../presentation/http/context.js';
import { BoundedRateLimiter } from '../presentation/http/rate-limiter.js';
export async function identityApplication(
  config: IdentityConfig,
  pool: pg.Pool,
  sender?: MailSender,
) {
  const passwords = await NodeArgon2.create(config.passwordConcurrency),
    tokens = new OpaqueTokens(config.security.csrfSecret),
    database = orm(pool),
    repository = new PrismaIdentityRepository(database),
    transactions = new PrismaIdentityUnitOfWork(database);
  const ids = { uuid: () => uuid(randomUUID()) },
    clock = { now: () => new Date().toISOString() };
  const delivery = new DeliveryCoordinator(
    sender ??
      (config.mail.mode === 'local' ? new LocalMailbox(config.mail) : new SmtpSender(config.mail)),
  );
  const authentication = new AuthenticateStaff(
    repository,
    transactions,
    passwords,
    tokens,
    ids,
    clock,
    config.policy,
  );
  const admins = new ManageAdmins(
    repository,
    transactions,
    delivery,
    tokens,
    ids,
    clock,
    config.policy,
  );
  const actions = new ActionTokens(
    repository,
    transactions,
    passwords,
    delivery,
    tokens,
    ids,
    clock,
    config.policy,
  );
  const readiness = new CheckReadiness(new PrismaReadiness(database));
  const credentials = new ServiceCredentials(config.security),
    limiter = new BoundedRateLimiter();
  const context: IdentityHttp = {
    authentication,
    admins,
    actions,
    tokens,
    cookieName: config.cookieName,
    secureCookie: config.secureCookie,
    allowedOrigins: config.http.allowedOrigins,
    verifyService: (caller, authorization) => credentials.verify(caller, authorization),
    rateLimit: (key, limit) => limiter.take(key, limit),
  };
  const app = await httpApplication(config.http, {
    ready: () => readiness.execute(),
    shutdown: async () => {
      await delivery.drain();
      await closePersistence(database, pool);
    },
    controllers: [AuthController, AdminsController, IntrospectionController],
    providers: [{ provide: IDENTITY_HTTP, useValue: context }],
  }).catch(async (error: unknown) => {
    await database.$disconnect();
    throw error;
  });
  return {
    app,
    authentication,
    admins,
    actions,
    delivery,
    bootstrap: new BootstrapSuperAdmin(transactions, passwords, ids, clock),
  };
}
