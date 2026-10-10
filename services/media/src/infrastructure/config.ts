import path from 'node:path';
import { ConfigurationError } from '@business-platform/platform';
import type { MediaPolicy } from '../domain/media-policy.js';

function number(env: NodeJS.ProcessEnv, key: string, fallback: number, max: number) {
  const raw = env[key] ?? String(fallback);
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max)
    throw new ConfigurationError('Invalid ' + key + '.');
  return Number(raw);
}
function origin(value: string, production: boolean) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (production && url.protocol !== 'https:') ||
    url.origin !== value ||
    url.username ||
    url.password
  )
    throw new ConfigurationError('Invalid private Media origin.');
  return value;
}
export function mediaConfig(env = process.env) {
  const production = env['NODE_ENV'] === 'production';
  const policy: MediaPolicy = {
    outputBytes: {
      IMAGE: number(env, 'MEDIA_IMAGE_OUTPUT_BYTES', 40 * 1024 * 1024, 40 * 1024 * 1024),
      VIDEO: number(env, 'MEDIA_VIDEO_OUTPUT_BYTES', 300 * 1024 * 1024, 300 * 1024 * 1024),
      PDF: number(env, 'MEDIA_PDF_OUTPUT_BYTES', 10 * 1024 * 1024, 10 * 1024 * 1024),
    },
    maxBytes: {
      IMAGE: number(env, 'MEDIA_IMAGE_BYTES', 20 * 1024 * 1024, 20 * 1024 * 1024),
      VIDEO: number(env, 'MEDIA_VIDEO_BYTES', 250 * 1024 * 1024, 250 * 1024 * 1024),
      PDF: number(env, 'MEDIA_PDF_BYTES', 30 * 1024 * 1024, 30 * 1024 * 1024),
    },
    pixels: number(env, 'MEDIA_IMAGE_PIXELS', 40000000, 40000000),
    videoSeconds: number(env, 'MEDIA_VIDEO_SECONDS', 600, 600),
    pdfPages: number(env, 'MEDIA_PDF_PAGES', 200, 200),
    partBytes: number(env, 'MEDIA_PART_BYTES', 8 * 1024 * 1024, 8 * 1024 * 1024),
    adminSessions: number(env, 'MEDIA_ADMIN_SESSIONS', 3, 10),
    globalSessions: number(env, 'MEDIA_GLOBAL_SESSIONS', 100, 1000),
    reservedBytes: String(
      number(env, 'MEDIA_RESERVED_BYTES', 10 * 1024 * 1024 * 1024, Number.MAX_SAFE_INTEGER),
    ),
    sessionSeconds: number(env, 'MEDIA_SESSION_SECONDS', 3600, 3600),
    grantSeconds: number(env, 'MEDIA_GRANT_SECONDS', 300, 300),
    maxAttempts: number(env, 'MEDIA_MAX_ATTEMPTS', 5, 10),
    pendingJobs: number(env, 'MEDIA_PENDING_JOBS', 1000, 10000),
  };
  const storage = env['MEDIA_STORAGE'] ?? 'filesystem',
    delivery = env['MEDIA_DELIVERY'] ?? 'stream';
  if (
    !['filesystem', 's3'].includes(storage) ||
    !['stream', 's3'].includes(delivery) ||
    (delivery === 's3' && storage !== 's3')
  )
    throw new ConfigurationError('Invalid Media storage/delivery profile.');
  if (
    production &&
    (storage !== 's3' ||
      !env['MEDIA_CATALOG_TOKEN'] ||
      env['MEDIA_S3_IMMUTABLE_POLICY_VERIFIED'] !== 'true')
  )
    throw new ConfigurationError(
      'Production Media requires private S3 with verified immutable policy and coordination credentials.',
    );
  if (env['MEDIA_CATALOG_TOKEN'] && !/^[A-Za-z0-9_-]{43,128}$/.test(env['MEDIA_CATALOG_TOKEN']))
    throw new ConfigurationError('Invalid MEDIA_CATALOG_TOKEN.');
  const root = path.resolve(env['MEDIA_STORAGE_ROOT'] ?? '.local/media/private'),
    scratch = path.resolve(env['MEDIA_SCRATCH_ROOT'] ?? '.local/media/scratch');
  if (
    root === scratch ||
    scratch.startsWith(root + path.sep) ||
    root.startsWith(scratch + path.sep)
  )
    throw new ConfigurationError('Media retained storage and scratch must be separate.');
  if (Math.ceil(policy.maxBytes.VIDEO / policy.partBytes) > 100)
    throw new ConfigurationError('Part policy exceeds the supported 100-part bound.');
  return {
    policy,
    storage,
    delivery,
    root,
    scratch,
    production,
    origin: origin(env['MEDIA_PUBLIC_ORIGIN'] ?? 'http://127.0.0.1:3003', production),
    catalogOrigin: origin(env['CATALOG_SERVICE_URL'] ?? 'http://127.0.0.1:3002', production),
    token: env['MEDIA_CATALOG_TOKEN'],
    scannerHost: env['MEDIA_CLAMAV_HOST'] ?? '127.0.0.1',
    scannerPort: number(env, 'MEDIA_CLAMAV_PORT', 3310, 65535),
    concurrency: {
      IMAGE: number(env, 'MEDIA_IMAGE_WORKERS', 1, 4),
      VIDEO: number(env, 'MEDIA_VIDEO_WORKERS', 1, 2),
      PDF: number(env, 'MEDIA_PDF_WORKERS', 1, 2),
    },
    commands: {
      ffmpeg: env['MEDIA_FFMPEG'] ?? 'ffmpeg',
      ffprobe: env['MEDIA_FFPROBE'] ?? 'ffprobe',
      pdfinfo: env['MEDIA_PDFINFO'] ?? 'pdfinfo',
      pdftoppm: env['MEDIA_PDFTOPPM'] ?? 'pdftoppm',
    },
  };
}
