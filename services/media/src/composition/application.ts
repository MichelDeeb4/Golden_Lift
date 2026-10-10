import {
  DeleteMedia,
  GetMediaDeletionImpact,
  GetMediaDeletionOperation,
} from '../application/use-cases/delete-media.js';
import { PrismaMediaDeletionStore } from '../infrastructure/prisma/deletion.js';
import { HttpCatalogDeletionImpact } from '../infrastructure/http/deletion.js';
import {
  MediaDeletionController,
  MEDIA_DELETION,
} from '../presentation/http/deletion-controller.js';
import type pg from 'pg';
import type { SessionAuthenticator } from '@business-platform/contracts';
import {
  httpApplication,
  closePersistence,
  IdentitySessionClient,
  identityClientConfig,
} from '@business-platform/platform';
import type { HttpConfig } from '@business-platform/platform';
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
  const deletionStore = new PrismaMediaDeletionStore(database),
    deletionCatalog = new HttpCatalogDeletionImpact(settings.catalogOrigin, settings.token);
  return httpApplication(config, {
    ready: () => readiness.execute(),
    shutdown: async () => {
      await storage.close();
      await closePersistence(database, pool);
    },
    controllers: [
      MediaDeletionController,
      StaffController,
      AdminMediaController,
      MediaDeliveryController,
    ],
    providers: [
      {
        provide: MEDIA_DELETION,
        useValue: {
          impact: new GetMediaDeletionImpact(transactions, deletionCatalog, mediaIds),
          remove: new DeleteMedia(transactions, deletionCatalog, deletionStore, mediaIds),
          operation: new GetMediaDeletionOperation(deletionStore),
        },
      },
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
