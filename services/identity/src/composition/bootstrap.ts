import { orm } from '../infrastructure/prisma/client.js';
import { randomUUID } from 'node:crypto';
import { ApplicationError, uuid } from '@business-platform/contracts';
import {
  closePersistence,
  databasePool,
  serviceConfig,
  startupFailed,
} from '@business-platform/platform';
import { BootstrapSuperAdmin } from '../application/use-cases/bootstrap-super-admin.js';
import { PrismaIdentityUnitOfWork } from '../infrastructure/prisma/unit-of-work.js';
import { NodeArgon2 } from '../infrastructure/security/crypto.js';
const password = process.env['BOOTSTRAP_PASSWORD'];
delete process.env['BOOTSTRAP_PASSWORD'];
try {
  const pool = await databasePool(serviceConfig('identity').database),
    database = orm(pool);
  try {
    const bootstrap = new BootstrapSuperAdmin(
      new PrismaIdentityUnitOfWork(database),
      await NodeArgon2.create(1),
      { uuid: () => uuid(randomUUID()) },
      { now: () => new Date().toISOString() },
    );
    await bootstrap.execute(
      process.env['BOOTSTRAP_EMAIL'],
      process.env['BOOTSTRAP_DISPLAY_NAME'],
      password,
    );
    console.log(JSON.stringify({ event: 'identity.bootstrap.completed' }));
  } finally {
    await closePersistence(database, pool);
  }
} catch (error) {
  if (error instanceof ApplicationError) {
    console.error(
      JSON.stringify({
        event: 'identity.bootstrap.failed',
        code: error.code,
        message: error.message,
      }),
    );
    process.exitCode = 1;
  } else startupFailed('identity-bootstrap', error);
}
