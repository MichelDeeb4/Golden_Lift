import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, link, unlink, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { ApplicationError } from '@golden-lift/contracts';
import type { DeletionStorage, StoredObject } from '../../application/ports/storage.js';

export function objectKey(key: string): string {
  if (
    !/^(staging|originals|outputs|quarantine)\/[a-f0-9-]{36}(?:\/[a-zA-Z0-9_-]{1,80}){0,3}$/.test(
      key,
    )
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid private object identity.');
  return key;
}
export class FilesystemStorage implements DeletionStorage {
  readonly bucket = 'private-filesystem';
  private constructor(private readonly root: string) {}
  static async create(root: string): Promise<FilesystemStorage> {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const stat = await lstat(root);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error('Storage root must be an owned directory.');
    return new FilesystemStorage(await realpath(root));
  }
  private async location(key: string, create: boolean): Promise<string> {
    const segments = objectKey(key).split('/');
    let current = this.root;
    for (const segment of segments.slice(0, -1)) {
      current = path.join(current, segment);
      if (create)
        await mkdir(current, { mode: 0o700 }).catch((error: unknown) => {
          if (!(
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'EEXIST'
          ))
            throw error;
        });
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory() || (await realpath(current)) !== current)
        throw new ApplicationError('FORBIDDEN', 'Unsafe private storage path.');
    }
    return path.join(current, segments.at(-1)!);
  }
  async put(key: string, body: AsyncIterable<Uint8Array>, bytes: number): Promise<StoredObject> {
    const destination = await this.location(key, true);
    // The temporary inode is never readable through an object key. Hard-link publication is atomic and exclusive.
    const temporary = destination + '.pending-' + randomUUID();
    const handle = await open(temporary, 'wx', 0o600),
      hash = createHash('sha256');
    let received = 0;
    try {
      for await (const chunk of body) {
        received += chunk.byteLength;
        if (received > bytes)
          throw new ApplicationError('REQUEST_TOO_LARGE', 'Upload exceeds its bound.');
        hash.update(chunk);
        await handle.writeFile(chunk);
      }
      if (received !== bytes)
        throw new ApplicationError('VALIDATION_FAILED', 'Upload size mismatch.');
      await handle.sync();
      await handle.close();
      await link(temporary, destination);
      return { key, bytes: String(received), sha256: hash.digest('hex'), version: null };
    } finally {
      await handle.close().catch(() => undefined);
      // Only an unpublished scratch inode; accepted input and published objects are never removed.
      await unlink(temporary).catch(() => undefined);
    }
  }
  async read(
    key: string,
    range?: { start: number; end: number },
  ): Promise<AsyncIterable<Uint8Array>> {
    const location = await this.location(key, false);
    const stat = await lstat(location);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new ApplicationError('FORBIDDEN', 'Unsafe private object.');
    const file = await open(location, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await file.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || !opened.isFile()) {
      await file.close();
      throw new ApplicationError('FORBIDDEN', 'Private object changed.');
    }
    return file.createReadStream({ autoClose: true, ...(range ?? {}) });
  }
  async inspect(key: string, maxBytes: number): Promise<StoredObject> {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of await this.read(key)) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes)
        throw new ApplicationError('REQUEST_TOO_LARGE', 'Stored object exceeds policy.');
      hash.update(chunk);
    }
    return { key, bytes: String(bytes), sha256: hash.digest('hex'), version: null };
  }
  async available(key: string, bytes: string) {
    try {
      const location = await this.location(key, false),
        info = await lstat(location);
      if (info.isSymbolicLink() || !info.isFile())
        throw new ApplicationError('FORBIDDEN', 'Unsafe private object.');
      return String(info.size) === bytes;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
        return false;
      throw error;
    }
  }
  private namespace(prefix: string) {
    if (!/^(originals|outputs|quarantine|staging)\/[a-f0-9-]{36}$/.test(prefix))
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid owned storage namespace.');
    return prefix;
  }
  async inventory(prefix: string): Promise<readonly { key: string; bytes: string }[]> {
    this.namespace(prefix);
    const result: { key: string; bytes: string }[] = [];
    const walk = async (key: string): Promise<void> => {
      let location: string;
      try {
        location = await this.location(key, false);
        const stat = await lstat(location);
        if (stat.isSymbolicLink())
          throw new ApplicationError('FORBIDDEN', 'Unsafe private storage path.');
        if (stat.isDirectory()) {
          for (const name of await readdir(location)) {
            if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name))
              throw new ApplicationError(
                'INVALID_STATE',
                'Unrecognized file in owned storage namespace.',
              );
            await walk(key + '/' + name);
          }
        } else if (stat.isFile() && stat.nlink === 1)
          result.push({ key, bytes: String(stat.size) });
        else throw new ApplicationError('FORBIDDEN', 'Unsafe private storage object.');
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return;
        throw error;
      }
    };
    await walk(prefix);
    return result;
  }
  async removeNamespace(prefix: string) {
    this.namespace(prefix);
    const walk = async (key: string): Promise<void> => {
      try {
        const location = await this.location(key, false),
          stat = await lstat(location);
        if (stat.isSymbolicLink())
          throw new ApplicationError('FORBIDDEN', 'Unsafe private storage path.');
        if (stat.isDirectory()) {
          for (const name of await readdir(location)) {
            if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name))
              throw new ApplicationError('INVALID_STATE', 'Unrecognized owned storage entry.');
            await walk(key + '/' + name);
          }
          await rmdir(location);
        } else if (stat.isFile() && stat.nlink === 1) await unlink(location);
        else throw new ApplicationError('FORBIDDEN', 'Unsafe private storage object.');
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return;
        throw error;
      }
    };
    await walk(prefix);
  }
  close(): void {}
}
