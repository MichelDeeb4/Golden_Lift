import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApplicationError } from '@golden-lift/contracts';
import type { DeletionStorage, StoredObject } from '../../application/ports/storage.js';
import { objectKey } from './filesystem.js';

export class S3Storage implements DeletionStorage {
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
  private namespace(prefix: string) {
    if (!/^(originals|outputs|quarantine|staging)\/[a-f0-9-]{36}$/.test(prefix))
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid owned storage namespace.');
    return prefix;
  }
  async inventory(prefix: string) {
    this.namespace(prefix);
    const rows: { key: string; bytes: string }[] = [];
    let token: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(token ? { ContinuationToken: token } : {}),
        }),
      );
      for (const item of result.Contents ?? [])
        if (item.Key === prefix || item.Key?.startsWith(prefix + '/'))
          rows.push({ key: objectKey(item.Key), bytes: String(item.Size ?? 0) });
      token = result.IsTruncated ? result.NextContinuationToken : undefined;
      if (result.IsTruncated && !token)
        throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Incomplete storage inventory.');
    } while (token);
    return rows;
  }
  async removeNamespace(prefix: string) {
    this.namespace(prefix);
    // Remove actual versions and delete markers, not just the latest-key visibility.
    // Always rescan the first bounded page after deletion; never skip modified continuation positions.
    for (;;) {
      const result = await this.client.send(
        new ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: prefix, MaxKeys: 1000 }),
      );
      const objects = [...(result.Versions ?? []), ...(result.DeleteMarkers ?? [])].filter(
        (x) => x.Key === prefix || x.Key?.startsWith(prefix + '/'),
      );
      if (!objects.length) {
        if (result.IsTruncated)
          throw new ApplicationError('INVALID_STATE', 'Ambiguous storage namespace prefix.');
        return;
      }
      for (const item of objects)
        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: objectKey(item.Key!),
            ...(item.VersionId ? { VersionId: item.VersionId } : {}),
          }),
        );
    }
  }
  close(): void {
    this.client.destroy();
  }
}
