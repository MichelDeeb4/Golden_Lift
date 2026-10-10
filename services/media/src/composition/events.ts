import { deletionEvent, record } from '@golden-lift/contracts';
import { CompleteMediaDeletion } from '../application/use-cases/complete-media-deletion.js';
import { PrismaMediaDeletionStore } from '../infrastructure/prisma/deletion.js';
import { OwnedMediaDeletionFiles } from '../infrastructure/storage/deletion.js';
import { FencedStorage } from '../infrastructure/storage/fenced.js';
import { privateStorage } from './dependencies.js';
import { mediaConfig } from '../infrastructure/config.js';
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
    storage = new FencedStorage(await privateStorage(mediaConfig()), pool),
    cleanup = new CompleteMediaDeletion(
      new PrismaMediaDeletionStore(database),
      new OwnedMediaDeletionFiles(storage),
    ),
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
        if (String(record(input)['type']) === 'catalog.media.delete.rejected.v1') {
          await new PrismaMediaDeletionStore(database).reject(deletionEvent(input));
          return;
        }
        if (String(record(input)['type']) === 'catalog.media.delete.requested.v1') {
          await cleanup.execute(deletionEvent(input));
          return;
        }
        const event = mediaEvent(input);
        if (event.type !== 'catalog.asset.retired.v1')
          throw new ApplicationError('VALIDATION_FAILED', 'Unexpected event.');
        await transactions.execute((r) => r.retire(event));
      },
    });
  } finally {
    await storage.close();
    await closePersistence(database, pool);
  }
} catch (error) {
  startupFailed('media', error);
}
