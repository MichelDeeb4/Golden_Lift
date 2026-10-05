import type pg from 'pg';
import type { SessionAuthenticator } from '@golden-lift/contracts';
import {
  httpApplication,
  closePersistence,
  IdentitySessionClient,
  identityClientConfig,
} from '@golden-lift/platform';
import type { HttpConfig } from '@golden-lift/platform';
import type { PrivateStorage } from '../application/ports/storage.js';
import type { SecurityPrerequisites } from '../application/ports/processing.js';
import { CheckReadiness } from '../application/use-cases/check-readiness.js';
import { CheckStaffAccess } from '../application/use-cases/check-staff-access.js';
import { Uploads } from '../application/use-cases/uploads.js';
import { MediaLibrary } from '../application/use-cases/library.js';
import { AuthorizeDelivery } from '../application/use-cases/delivery.js';
import { mediaConfig } from '../infrastructure/config.js';
import { ClamAvScanner } from '../infrastructure/scanning/clamav.js';
import { HttpCatalogMedia } from '../infrastructure/http/catalog-media.js';
import { orm } from '../infrastructure/prisma/client.js';
import { PrismaReadiness } from '../infrastructure/prisma/readiness.js';
import { PrismaMediaUnitOfWork } from '../infrastructure/prisma/media-repository.js';
import { StaffController, STAFF_ACCESS } from '../presentation/http/staff-controller.js';
import {
  AdminMediaController,
  MediaDeliveryController,
  UPLOADS,
  LIBRARY,
  DELIVERY,
  STORAGE,
  MEDIA_OPTIONS,
  SECURITY_PREREQUISITES,
} from '../presentation/http/media-controller.js';
import { mediaIds, mediaClock } from './dependencies.js';

export function mediaApplication(
  config: HttpConfig,
  pool: pg.Pool,
  storage: PrivateStorage,
  settings: ReturnType<typeof mediaConfig>,
  authentication: SessionAuthenticator = new IdentitySessionClient(identityClientConfig('media')),
  security: SecurityPrerequisites = new ClamAvScanner(
    settings.scannerHost,
    settings.scannerPort,
    2000,
  ),
) {
  const database = orm(pool),
    transactions = new PrismaMediaUnitOfWork(database),
    catalog = new HttpCatalogMedia(settings.catalogOrigin, settings.token),
    readiness = new CheckReadiness(new PrismaReadiness(database));
  return httpApplication(config, {
    ready: () => readiness.execute(),
    shutdown: async () => {
      storage.close();
      await closePersistence(database, pool);
    },
    controllers: [StaffController, AdminMediaController, MediaDeliveryController],
    providers: [
      { provide: STAFF_ACCESS, useValue: new CheckStaffAccess(authentication) },
      {
        provide: UPLOADS,
        useValue: new Uploads(transactions, storage, mediaIds, mediaClock, settings.policy),
      },
      { provide: LIBRARY, useValue: new MediaLibrary(transactions, catalog) },
      {
        provide: DELIVERY,
        useValue: new AuthorizeDelivery(
          transactions,
          catalog,
          mediaClock,
          settings.policy.grantSeconds,
        ),
      },
      { provide: STORAGE, useValue: storage },
      { provide: MEDIA_OPTIONS, useValue: settings },
      { provide: SECURITY_PREREQUISITES, useValue: security },
    ],
  }).catch(async (error: unknown) => {
    await database.$disconnect();
    storage.close();
    throw error;
  });
}
