import { directMediaDeletionRequest } from '@golden-lift/contracts';
import { AcceptMediaDeletion } from '../application/use-cases/accept-media-deletion.js';
import { deletionEvent, record } from '@golden-lift/contracts';
import { PrismaCatalogDeletionUnitOfWork } from '../infrastructure/prisma/deletion.js';
import { mediaEvent } from '@golden-lift/contracts';
import {
  databasePool,
  serviceConfig,
  runOutboxRelay,
  closePersistence,
  startupFailed,
} from '@golden-lift/platform';
import { orm } from '../infrastructure/prisma/client.js';
import { PrismaMediaRegistry } from '../infrastructure/prisma/media-registry.js';
import { MediaCoordination } from '../application/use-cases/media-coordination.js';
import { CatalogMediaOutboxRelay } from '../infrastructure/prisma/media-outbox-relay.js';
try {
  const pool = await databasePool(serviceConfig('catalog').database),
    database = orm(pool),
    registry = new MediaCoordination(new PrismaMediaRegistry(database, 300)),
    shutdown = new AbortController();
  process.once('SIGINT', () => shutdown.abort());
  process.once('SIGTERM', () => shutdown.abort());
  try {
    await runOutboxRelay({
      url: process.env['CATALOG_BROKER_URL'] ?? '',
      service: 'catalog',
      store: new CatalogMediaOutboxRelay(database),
      signingKey: process.env['CATALOG_EVENT_SECRET'] ?? '',
      verificationKey: process.env['MEDIA_EVENT_SECRET'] ?? '',
      signal: shutdown.signal,
      ...(process.env['MEDIA_EVENT_TRANSPORT'] === 'local-http'
        ? { localHttp: { listenPort: 3102, targetPort: 3103 } }
        : {}),
      apply: async (input) => {
        if (record(input)['type'] === 'media.deletion.requested.v1') {
          await new AcceptMediaDeletion(new PrismaCatalogDeletionUnitOfWork(database)).execute(
            directMediaDeletionRequest(input),
          );
          return;
        }
        await (String(record(input)['type']).startsWith('media.delete.')
          ? new PrismaCatalogDeletionUnitOfWork(database).execute((r) =>
              r.complete(deletionEvent(input)),
            )
          : registry.apply(mediaEvent(input)));
      },
    });
  } finally {
    await closePersistence(database, pool);
  }
} catch (error) {
  startupFailed('catalog', error);
}
