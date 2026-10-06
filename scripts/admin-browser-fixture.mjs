// Disposable browser fixtures. All staff requests use real Identity/Gateway/service HTTP.
// Synthetic Media verification below exercises lifecycle/delivery, not external scanner/provider gates.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { uuid, version } from '@golden-lift/contracts';
import { httpConfig, IdentitySessionClient } from '@golden-lift/platform';
import { databaseFixture } from '../.local/test-build/packages/platform/tests/support/database-fixture.js';
import { identityApplication } from '../services/identity/dist/composition/application.js';
import { identityConfig } from '../services/identity/dist/infrastructure/config.js';
import { catalogApplication } from '../services/catalog/dist/composition/application.js';
import { gatewayApplication } from '../services/gateway/dist/composition/application.js';
import { mediaApplication } from '../services/media/dist/composition/application.js';
import { mediaConfig } from '../services/media/dist/infrastructure/config.js';
import { FilesystemStorage } from '../services/media/dist/infrastructure/storage/filesystem.js';
import { orm as mediaOrm } from '../services/media/dist/infrastructure/prisma/client.js';
import { orm as catalogOrm } from '../services/catalog/dist/infrastructure/prisma/client.js';
import { PrismaMediaUnitOfWork } from '../services/media/dist/infrastructure/prisma/media-repository.js';
import { PrismaMediaRegistry } from '../services/catalog/dist/infrastructure/prisma/media-registry.js';
import { Uploads } from '../services/media/dist/application/use-cases/uploads.js';
import { mediaIds, mediaClock } from '../services/media/dist/composition/dependencies.js';

export async function adminBrowserFixture() {
  const fixtures = [],
    apps = [],
    messages = [],
    clients = [];
  const directory = await mkdtemp(path.resolve('.local/admin-browser-'));
  const credential = () => randomBytes(32).toString('base64url');
  const previousMediaToken = process.env.MEDIA_CATALOG_TOKEN;
  const mediaToken = credential();
  process.env.MEDIA_CATALOG_TOKEN = mediaToken;
  const security = {
    csrfSecret: credential(),
    callers: { catalog: credential(), media: credential(), inquiries: credential() },
  };
  const password = 'Browser fixture ' + credential();
  const origin = 'http://localhost:8082';
  const config = (service) => ({ ...httpConfig(service, { ALLOWED_ORIGINS: origin }), port: 0 });
  let worker,
    workerWork = Promise.resolve();
  async function dispose() {
    clearInterval(worker);
    await workerWork;
    console.info('Admin fixture: closing disposable servers.');
    for (const app of apps) app.getHttpServer().closeAllConnections();
    for (const client of clients) await client.$disconnect();
    for (const app of apps.reverse()) {
      console.info('Admin fixture: closing service.');
      await app.close();
    }
    console.info('Admin fixture: removing disposable databases.');
    for (const fixture of fixtures.reverse()) {
      console.info('Admin fixture: disposing database.');
      await fixture.dispose();
      console.info('Admin fixture: database disposed.');
    }
    if (previousMediaToken === undefined) delete process.env.MEDIA_CATALOG_TOKEN;
    else process.env.MEDIA_CATALOG_TOKEN = previousMediaToken;
    const absolute = path.resolve(directory);
    if (!absolute.startsWith(path.resolve('.local') + path.sep + 'admin-browser-'))
      throw new Error('Unsafe fixture cleanup');
    await rm(absolute, { recursive: true, force: true });
  }
  async function fixture(service) {
    const item = await databaseFixture(service);
    fixtures.push(item);
    return item;
  }
  async function listen(app, port = 0) {
    apps.push(app);
    await app.listen(port, '127.0.0.1');
    return app.getUrl();
  }
  try {
    const identityFixture = await fixture('identity');
    const settings = {
      ...identityConfig(config('identity'), {
        IDENTITY_CSRF_SECRET: security.csrfSecret,
        IDENTITY_SERVICE_CREDENTIALS: JSON.stringify(security.callers),
        STAFF_APP_URL: origin + '/admin/',
      }),
      security,
    };
    const identity = await identityApplication(settings, identityFixture.pool, {
      send: async (message) => messages.push(message),
    });
    const identityOrigin = await listen(identity.app);
    const superAccount = await identity.bootstrap.execute(
      'browser-super@example.test',
      'Browser Super Admin',
      password,
    );
    const superActor = { id: superAccount.id, role: 'SUPER_ADMIN', authVersion: version('1') };
    const invited = await identity.admins.invite(
      'browser-admin@example.test',
      'Browser Admin',
      superActor,
    );
    await identity.actions.consume(messages.at(-1).token, password, 'INVITATION');
    const catalogFixture = await fixture('catalog');
    const catalog = await catalogApplication(
      config('catalog'),
      catalogFixture.pool,
      new IdentitySessionClient({
        origin: identityOrigin,
        caller: 'catalog',
        credential: security.callers.catalog,
      }),
    );
    const catalogOrigin = await listen(catalog);
    const mediaFixture = await fixture('media');
    const storage = await FilesystemStorage.create(path.join(directory, 'objects'));
    const mediaSettings = mediaConfig({
      MEDIA_PUBLIC_ORIGIN: 'http://localhost:3003',
      CATALOG_SERVICE_URL: catalogOrigin,
      MEDIA_CATALOG_TOKEN: mediaToken,
    });
    // Explicit test-only prerequisite adapter; production composition still requires ClamAV.
    const media = await mediaApplication(
      config('media'),
      mediaFixture.pool,
      storage,
      mediaSettings,
      new IdentitySessionClient({
        origin: identityOrigin,
        caller: 'media',
        credential: security.callers.media,
      }),
      { ready: async () => true },
    );
    const mediaOrigin = await listen(media, 3003);
    const gateway = await gatewayApplication(config('gateway'), {
      identity: identityOrigin,
      catalog: catalogOrigin,
      media: mediaOrigin,
      inquiries: identityOrigin,
    });
    await listen(gateway, 3000);
    const mediaDb = mediaOrm(mediaFixture.pool),
      catalogDb = catalogOrm(catalogFixture.pool);
    clients.push(mediaDb, catalogDb);
    const uow = new PrismaMediaUnitOfWork(mediaDb),
      registry = new PrismaMediaRegistry(catalogDb, 300);
    const image = await sharp({
      create: { width: 80, height: 80, channels: 3, background: '#b39455' },
    })
      .png()
      .toBuffer();
    const webp = await sharp(image).webp().toBuffer();
    const actor = { id: invited.account.id, role: 'ADMIN', authVersion: version('1') };
    async function processKind(kind) {
      const claim = await uow.execute((r) => r.claim(kind, mediaIds.uuid(), 5));
      if (!claim) return;
      let playback;
      if (kind === 'VIDEO') {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of await storage.read(claim.asset.key)) {
          bytes += chunk.length;
          if (bytes > 262144) throw new Error('Disposable video fixture exceeds its bound');
          chunks.push(chunk);
        }
        playback = Buffer.concat(chunks);
      }
      const variants = [];
      for (const profile of kind === 'IMAGE'
        ? ['thumbnail', 'card', 'detail', 'large']
        : kind === 'VIDEO'
          ? ['poster', 'playback']
          : ['preview']) {
        const body = profile === 'playback' ? playback : webp;
        const object = await storage.put(
          `outputs/${claim.asset.id}/${claim.token}/${profile}`,
          (async function* () {
            yield body;
          })(),
          body.length,
        );
        variants.push({
          ...object,
          profile,
          mime: profile === 'playback' ? 'video/mp4' : 'image/webp',
          width: 80,
          height: 80,
          duration: profile === 'playback' ? '1000' : null,
        });
      }
      await uow.execute((r) =>
        r.ready(claim, {
          mime: kind === 'IMAGE' ? 'image/png' : kind === 'VIDEO' ? 'video/mp4' : 'application/pdf',
          width: 80,
          height: 80,
          duration: kind === 'VIDEO' ? '1000' : null,
          evidence: { scanner: 'DISPOSABLE BROWSER TEST ONLY' },
          variants,
        }),
      );
      const event = await mediaDb.outboxEvents.findFirstOrThrow({
        where: { aggregate_id: claim.asset.id, event_type: 'media.asset.ready.v1' },
        orderBy: { created_at: 'desc' },
      });
      await registry.apply(event.payload);
    }
    async function processImages() {
      for (const kind of ['IMAGE', 'VIDEO', 'PDF']) await processKind(kind);
    }
    const uploads = new Uploads(uow, storage, mediaIds, mediaClock, mediaSettings.policy);
    let upload = await uploads.initiate(
      {
        kind: 'IMAGE',
        name: 'Browser fixture image.png',
        bytes: String(image.length),
        purpose: 'CATALOG',
        sha256: null,
        idempotencyKey: credential(),
      },
      actor,
    );
    upload = await uploads.part(upload.id, 1, image, actor);
    await uploads.complete(upload.id, upload.version, actor);
    await processImages();
    let busy = false,
      processingFailure = null;
    worker = setInterval(() => {
      if (busy) return;
      busy = true;
      workerWork = (async () => {
        try {
          await processImages();
        } catch (error) {
          processingFailure = error;
        } finally {
          busy = false;
        }
      })();
    }, 500);
    return {
      password,
      superEmail: superAccount.email,
      adminEmail: invited.account.email,
      messages,
      image,
      assetId: upload.assetId,
      identity,
      dispose,
      checkProcessing: () => {
        if (processingFailure) throw processingFailure;
      },
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
