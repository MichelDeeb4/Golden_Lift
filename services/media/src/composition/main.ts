import { orm } from '../infrastructure/prisma/client.js';
import {
  databasePool,
  closePersistence,
  httpApplication,
  serviceConfig,
  startupFailed,
  IdentitySessionClient,
  identityClientConfig,
} from '@golden-lift/platform';
import { CheckReadiness } from '../application/use-cases/check-readiness.js';
import { CheckStaffAccess } from '../application/use-cases/check-staff-access.js';
import { PrismaReadiness } from '../infrastructure/prisma/readiness.js';
import { StaffController, STAFF_ACCESS } from '../presentation/http/staff-controller.js';
const service = 'media' as const;
try {
  const config = serviceConfig(service),
    authentication = new IdentitySessionClient(identityClientConfig(service)),
    pool = await databasePool(config.database);
  const database = orm(pool),
    readiness = new CheckReadiness(new PrismaReadiness(database));
  let app;
  try {
    app = await httpApplication(config, {
      ready: () => readiness.execute(),
      shutdown: () => closePersistence(database, pool),
      controllers: [StaffController],
      providers: [{ provide: STAFF_ACCESS, useValue: new CheckStaffAccess(authentication) }],
    });
  } catch (error) {
    await closePersistence(database, pool);
    throw error;
  }

  try {
    await app.listen(config.port, config.host);
  } catch (error) {
    await app.close();
    throw error;
  }
  console.log(JSON.stringify({ event: 'service.started', service, port: config.port }));
} catch (error) {
  startupFailed(service, error);
}
