// Reviewed administrative orchestration. Each adapter accesses only its owning database.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { config } from '../database/scripts/db.mjs';
import { orm as catalogOrm } from '../services/catalog/dist/infrastructure/prisma/client.js';
import { orm as mediaOrm } from '../services/media/dist/infrastructure/prisma/client.js';
import { CatalogOwnerCopies } from '../services/catalog/dist/infrastructure/prisma/owner-copies.js';
import { MediaOwnerCopies } from '../services/media/dist/infrastructure/storage/owner-copies.js';
import { FencedStorage } from '../services/media/dist/infrastructure/storage/fenced.js';
import { privateStorage } from '../services/media/dist/composition/dependencies.js';
import { mediaConfig } from '../services/media/dist/infrastructure/config.js';
const mode = process.argv[2] ?? 'plan';
if (!['plan', 'apply'].includes(mode) || (mode === 'apply' && !process.argv.includes('--reviewed')))
  throw Error('Use plan or apply --reviewed with writers stopped and coordinated backups.');
const cfg = config(),
  pools = {},
  clients = {};
for (const service of ['catalog', 'media']) {
  const s = cfg.services[service];
  pools[service] = new pg.Pool({
    host: '127.0.0.1',
    port: cfg.port,
    database: s.database,
    user: s.user,
    password: s.password,
    max: 5,
  });
  clients[service] = (service === 'catalog' ? catalogOrm : mediaOrm)(pools[service]);
}
let files, fence;
function saveManifest(file, manifest) {
  const temporary = file + '.pending';
  const handle = fs.openSync(temporary, 'w');
  try {
    fs.writeFileSync(handle, JSON.stringify(manifest, null, 2) + '\n');
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temporary, file);
}
try {
  const catalog = new CatalogOwnerCopies(clients.catalog),
    file = path.resolve(
      process.env.BUSINESS_PLATFORM_OWNER_COPY_MANIFEST ?? '.local/deletion-owner-copies.json',
    );
  let manifest;
  if (fs.existsSync(file)) manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    manifest = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      holders: (await catalog.holders()).map((holder) => ({
        ...holder,
        targetId: randomUUID(),
        status: 'PLANNED',
      })),
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    saveManifest(file, manifest);
  }
  if (mode === 'plan') {
    console.log(
      JSON.stringify({
        holders: manifest.holders.length,
        sharedAssets: new Set(manifest.holders.map((x) => x.assetId)).size,
        manifest: file,
      }),
    );
  } else {
    files = await privateStorage(mediaConfig());
    fence = new FencedStorage(files, pools.media);
    const media = new MediaOwnerCopies(clients.media, files, fence);
    for (const holder of manifest.holders) {
      if (holder.status === 'SWITCHED') continue;
      const copy = await media.copy(holder.assetId, holder.targetId);
      await catalog.switch(
        holder.assetId,
        holder.targetId,
        holder.ownerType,
        holder.ownerId,
        copy.kind,
        copy.sourceVersion,
      );
      holder.status = 'SWITCHED';
      saveManifest(file, manifest);
    }
    const remaining = await catalog.holders();
    if (remaining.length)
      throw Error('Shared holders remain; review concurrent changes before enforcing ownership.');
    console.log(
      JSON.stringify({
        status: 'COPIES_SWITCHED',
        holders: manifest.holders.length,
        sourceObjectsRetained: true,
      }),
    );
  }
} finally {
  if (fence) await fence.close();
  else await files?.close();
  for (const service of ['catalog', 'media']) {
    await clients[service].$disconnect();
    await pools[service].end();
  }
}
