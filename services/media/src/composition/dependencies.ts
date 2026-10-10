import { createHash, randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { uuid } from '@business-platform/contracts';
import type { MediaIds } from '../application/ports/media.js';
import { FilesystemStorage } from '../infrastructure/storage/filesystem.js';
import { S3Storage } from '../infrastructure/storage/s3.js';
import { mediaConfig } from '../infrastructure/config.js';
export const mediaIds: MediaIds = {
  uuid: () => uuid(randomUUID()),
  hash: (value) => createHash('sha256').update(value).digest('hex'),
  digest: (value) => createHash('sha256').update(value).digest('hex'),
};
export const mediaClock = { now: () => new Date().toISOString() };
export async function privateStorage(config: ReturnType<typeof mediaConfig>) {
  if (config.storage === 'filesystem') return FilesystemStorage.create(config.root);
  const bucket = process.env['MEDIA_S3_BUCKET'];
  if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
    throw new Error('Configure MEDIA_S3_BUCKET.');
  return new S3Storage(
    new S3Client({
      region: process.env['MEDIA_S3_REGION'] ?? 'us-east-1',
      ...(process.env['MEDIA_S3_ENDPOINT'] ? { endpoint: process.env['MEDIA_S3_ENDPOINT'] } : {}),
      forcePathStyle: process.env['MEDIA_S3_PATH_STYLE'] === 'true',
      maxAttempts: 3,
    }),
    bucket,
  );
}
