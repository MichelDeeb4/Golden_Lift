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
      apply: (input) => registry.apply(mediaEvent(input)),
    });
  } finally {
    await closePersistence(database, pool);
  }
} catch (error) {
  startupFailed('catalog', error);
}
