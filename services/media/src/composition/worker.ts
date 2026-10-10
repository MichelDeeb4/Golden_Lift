import { FencedStorage } from '../infrastructure/storage/fenced.js';
import { setTimeout as pause } from 'node:timers/promises';
import {
  databasePool,
  serviceConfig,
  closePersistence,
  startupFailed,
} from '@business-platform/platform';
import type { MediaKind } from '@business-platform/contracts';
import { mediaConfig } from '../infrastructure/config.js';
import { ClamAvScanner } from '../infrastructure/scanning/clamav.js';
import { SystemMediaProcessor } from '../infrastructure/processes/pipeline.js';
import { orm } from '../infrastructure/prisma/client.js';
import { PrismaMediaUnitOfWork } from '../infrastructure/prisma/media-repository.js';
import { ProcessMedia } from '../application/use-cases/process-media.js';
import { ReconcileMedia } from '../application/use-cases/reconcile-media.js';
import { mediaIds, privateStorage } from './dependencies.js';
try {
  const settings = mediaConfig();
  if (
    settings.production &&
    (process.env['MEDIA_WORKER_ISOLATED'] !== 'true' ||
      process.env['MEDIA_PROCESS_SANDBOX'] !== 'bwrap' ||
      process.platform !== 'linux')
  )
    throw new Error('Production processors require an isolated resource-limited worker.');
  const pool = await databasePool(serviceConfig('media').database),
    database = orm(pool),
    storage = new FencedStorage(await privateStorage(settings), pool),
    transactions = new PrismaMediaUnitOfWork(database),
    scanner = new ClamAvScanner(settings.scannerHost, settings.scannerPort),
    processor = new SystemMediaProcessor(
      storage,
      scanner,
      settings.scratch,
      settings.policy,
      settings.commands,
    ),
    work = new ProcessMedia(transactions, processor, mediaIds, settings.policy.maxAttempts),
    shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  async function lane(kind: MediaKind) {
    while (!shutdown.signal.aborted) {
      try {
        const claim = await work.claim(kind);
        if (!claim) {
          await pause(1000, undefined, { signal: shutdown.signal }).catch(() => undefined);
          continue;
        }
        const abort = new AbortController(),
          onStop = () => abort.abort();
        shutdown.signal.addEventListener('abort', onStop, { once: true });
        let renewing = false;
        const timer = setInterval(() => {
          if (renewing) return;
          renewing = true;
          void work
            .renew(claim)
            .then((owned) => {
              if (!owned) abort.abort();
            })
            .catch(() => abort.abort())
            .finally(() => {
              renewing = false;
            });
        }, 30000);
        try {
          const ready = await work.execute(claim, abort.signal);
          console.log(
            JSON.stringify({
              event: 'media.job.finished',
              assetId: claim.asset.id,
              jobId: claim.jobId,
              attempt: claim.attempt,
              ready,
            }),
          );
        } finally {
          clearInterval(timer);
          shutdown.signal.removeEventListener('abort', onStop);
        }
      } catch {
        console.error(JSON.stringify({ event: 'media.worker.unavailable', kind }));
        await pause(1000);
      }
    }
  }
  const reconciliation = new ReconcileMedia(transactions, storage, settings.policy.maxAttempts);
  let cursor: import('@business-platform/contracts').Uuid | null = null,
    reconciling = false;
  const timer = setInterval(() => {
    if (reconciling) return;
    reconciling = true;
    void reconciliation
      .execute(cursor, 100)
      .then((result) => {
        cursor = result.next;
        console.log(JSON.stringify({ event: 'media.reconciled', ...result }));
      })
      .then(() => transactions.execute((r) => r.statistics()))
      .then((statistics) =>
        console.log(JSON.stringify({ event: 'media.worker.statistics', ...statistics })),
      )
      .catch(() => console.error(JSON.stringify({ event: 'media.reconciliation.unavailable' })))
      .finally(() => {
        reconciling = false;
      });
  }, 30000);
  try {
    await Promise.all(
      (['IMAGE', 'VIDEO', 'PDF'] as const).flatMap((kind) =>
        Array.from({ length: settings.concurrency[kind] }, () => lane(kind)),
      ),
    );
  } finally {
    clearInterval(timer);
    await storage.close();
    await closePersistence(database, pool);
  }
} catch (error) {
  startupFailed('media', error);
}
