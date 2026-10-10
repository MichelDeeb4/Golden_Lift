import { ApplicationError } from '@business-platform/contracts';
import type { MediaKind } from '@business-platform/contracts';

export interface MediaPolicy {
  readonly maxBytes: Readonly<Record<MediaKind, number>>;
  readonly outputBytes: Readonly<Record<MediaKind, number>>;
  readonly pixels: number;
  readonly videoSeconds: number;
  readonly pdfPages: number;
  readonly partBytes: number;
  readonly adminSessions: number;
  readonly globalSessions: number;
  readonly reservedBytes: string;
  readonly sessionSeconds: number;
  readonly grantSeconds: number;
  readonly maxAttempts: number;
  readonly pendingJobs: number;
}
export interface UploadInput {
  readonly kind: MediaKind;
  readonly name: string;
  readonly bytes: string;
  readonly purpose: 'CATALOG' | 'TECHNICAL_SOURCE';
  readonly sha256: string | null;
  readonly idempotencyKey: string;
}
export function validateUpload(input: UploadInput, policy: MediaPolicy): void {
  if (
    !['IMAGE', 'VIDEO', 'PDF'].includes(input.kind) ||
    !['CATALOG', 'TECHNICAL_SOURCE'].includes(input.purpose) ||
    (input.purpose === 'TECHNICAL_SOURCE' && input.kind !== 'PDF') ||
    !/^[1-9][0-9]{0,9}$/.test(input.bytes) ||
    BigInt(input.bytes) > BigInt(policy.maxBytes[input.kind]) ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(input.idempotencyKey) ||
    (input.sha256 !== null && !/^[a-f0-9]{64}$/.test(input.sha256))
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid upload policy or size.');
  const extensions: Record<MediaKind, RegExp> = {
    IMAGE: /\.(jpe?g|png|webp)$/i,
    VIDEO: /\.(mp4|mov)$/i,
    PDF: /\.pdf$/i,
  };
  if (
    !input.name ||
    input.name.length > 160 ||
    /[\\/\x00-\x1f\x7f]/.test(input.name) ||
    input.name.includes('..') ||
    !extensions[input.kind].test(input.name)
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid original filename.');
}
export function mandatoryVariants(kind: MediaKind): readonly string[] {
  return kind === 'IMAGE'
    ? ['thumbnail', 'card', 'detail', 'large']
    : kind === 'VIDEO'
      ? ['playback', 'poster']
      : ['preview'];
}
export function singleRange(
  value: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]))
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid byte range.');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(size - 1, Number(match[2])) : size - 1) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= size ||
    start > end ||
    (!match[1] && Number(match[2]) === 0)
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Unsatisfiable byte range.');
  return { start, end };
}
