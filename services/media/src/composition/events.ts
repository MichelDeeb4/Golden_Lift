import { mediaEvent, ApplicationError } from '@golden-lift/contracts';
import {
  databasePool,
  serviceConfig,
  runOutboxRelay,
  closePersistence,
  startupFailed,
} from '@golden-lift/platform';
import { orm } from '../infrastructure/prisma/client.js';
import { PrismaMediaUnitOfWork } from '../infrastructure/prisma/media-repository.js';
import { MediaOutboxRelay } from '../infrastructure/prisma/outbox-relay.js';
try {
  const pool = await databasePool(serviceConfig('media').database),
    database = orm(pool),
    transactions = new PrismaMediaUnitOfWork(database),
    shutdown = new AbortController();
  process.once('SIGINT', () => shutdown.abort());
  process.once('SIGTERM', () => shutdown.abort());
  try {
    await runOutboxRelay({
      url: process.env['MEDIA_BROKER_URL'] ?? '',
      service: 'media',
      store: new MediaOutboxRelay(database),
      signingKey: process.env['MEDIA_EVENT_SECRET'] ?? '',
      verificationKey: process.env['CATALOG_EVENT_SECRET'] ?? '',
      signal: shutdown.signal,
      ...(process.env['MEDIA_EVENT_TRANSPORT'] === 'local-http'
        ? { localHttp: { listenPort: 3103, targetPort: 3102 } }
        : {}),
      apply: async (input) => {
        const event = mediaEvent(input);
        if (event.type !== 'catalog.asset.retired.v1')
          throw new ApplicationError('VALIDATION_FAILED', 'Unexpected event.');
        await transactions.execute((r) => r.retire(event));
      },
    });
  } finally {
    await closePersistence(database, pool);
  }
} catch (error) {
  startupFailed('media', error);
}
