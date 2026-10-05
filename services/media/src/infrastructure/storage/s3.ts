import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApplicationError } from '@golden-lift/contracts';
import type { PrivateStorage, StoredObject } from '../../application/ports/storage.js';
import { objectKey } from './filesystem.js';

export class S3Storage implements PrivateStorage {
  constructor(
    private readonly client: S3Client,
    readonly bucket: string,
  ) {}
  async put(key: string, body: AsyncIterable<Uint8Array>, bytes: number): Promise<StoredObject> {
    objectKey(key);
    const hash = createHash('sha256');
    let count = 0;
    async function* bounded() {
      for await (const chunk of body) {
        count += chunk.byteLength;
        if (count > bytes)
          throw new ApplicationError('REQUEST_TOO_LARGE', 'Upload exceeds its bound.');
        hash.update(chunk);
        yield chunk;
      }
      if (count !== bytes) throw new ApplicationError('VALIDATION_FAILED', 'Upload size mismatch.');
    }
    const output = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Readable.from(bounded()),
        ContentLength: bytes,
        IfNoneMatch: '*',
        ContentType: 'application/octet-stream',
      }),
    );
    // ETags are never interpreted as checksums. Caller verifies sealed bytes by a second immutable read.
    return {
      key,
      bytes: String(count),
      sha256: hash.digest('hex'),
      version: output.VersionId ?? null,
    };
  }
  async read(
    key: string,
    range?: { start: number; end: number },
    version?: string | null,
  ): Promise<AsyncIterable<Uint8Array>> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(key),
        ...(version ? { VersionId: version } : {}),
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    );
    if (!(response.Body instanceof Readable)) throw new Error('Unsupported S3 stream.');
    return response.Body;
  }
  async inspect(key: string, maxBytes: number): Promise<StoredObject> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey(key) }),
    );
    if (!(response.Body instanceof Readable)) throw new Error('Unsupported S3 stream.');
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        response.Body.destroy();
        throw new ApplicationError('REQUEST_TOO_LARGE', 'Stored object exceeds policy.');
      }
      hash.update(chunk);
    }
    return {
      key,
      bytes: String(bytes),
      sha256: hash.digest('hex'),
      version: response.VersionId ?? null,
    };
  }
  sign(
    key: string,
    seconds: number,
    mime: string,
    download: boolean,
    version?: string | null,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(key),
        ...(version ? { VersionId: version } : {}),
        ResponseContentType: mime,
        ResponseContentDisposition: `${download ? 'attachment' : 'inline'}; filename="media"`,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: seconds, signingDate: new Date() },
    );
  }
  async available(key: string, bytes: string) {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey(key) }),
      );
      return String(response.ContentLength) === bytes;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        ['NotFound', 'NoSuchKey'].includes(String(error.name))
      )
        return false;
      throw error;
    }
  }
  close(): void {
    this.client.destroy();
  }
}
