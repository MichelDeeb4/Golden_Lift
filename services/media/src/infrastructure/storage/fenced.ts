import pg from 'pg';
import { ApplicationError } from '@business-platform/contracts';
import type { DeletionStorage, StoredObject } from '../../application/ports/storage.js';

/** A session advisory lock spans the external write without putting it inside a retried transaction.
 * All normal writers use shared locks; cleanup uses the same owner's exclusive lock.
 * Pending state is checked after lock acquisition, fencing even previously authorized uploads.
 */
export class FencedStorage implements DeletionStorage {
  readonly bucket: string;
  private readonly locks: pg.Pool;
  constructor(
    private readonly storage: DeletionStorage,
    private readonly pool: pg.Pool,
  ) {
    this.bucket = storage.bucket;
    // Cleanup holds a lock while a metadata transaction needs a connection.
    // Separate bounded lock sessions avoid exhausting that transaction pool.
    this.locks = new pg.Pool({
      ...pool.options,
      // pg intentionally makes password non-enumerable on Pool.options.
      password: pool.options.password,
      max: 4,
      connectionTimeoutMillis: 8000,
      allowExitOnIdle: true,
    });
  }
  async withOwner<T>(assetId: string, exclusive: boolean, work: () => Promise<T>): Promise<T> {
    const client = await this.locks.connect();
    let locked = false;
    try {
      await client.query("SET lock_timeout='8s'");
      await client.query(
        exclusive
          ? 'SELECT pg_advisory_lock(hashtextextended($1,0))'
          : 'SELECT pg_advisory_lock_shared(hashtextextended($1,0))',
        ['media-storage:' + assetId],
      );
      locked = true;
      if (!exclusive) {
        const row = await client.query<{ deletion_pending: boolean }>(
          'SELECT deletion_pending FROM media.assets WHERE id=$1',
          [assetId],
        );
        if (!row.rows[0] || row.rows[0].deletion_pending)
          throw new ApplicationError(
            'DELETE_ALREADY_IN_PROGRESS',
            'Media storage writes are unavailable during deletion.',
          );
      }
      return await work();
    } finally {
      let destroy = false;
      try {
        if (locked)
          await client.query(
            exclusive
              ? 'SELECT pg_advisory_unlock(hashtextextended($1,0))'
              : 'SELECT pg_advisory_unlock_shared(hashtextextended($1,0))',
            ['media-storage:' + assetId],
          );
        await client.query('RESET lock_timeout');
      } catch {
        destroy = true;
      }
      client.release(destroy);
    }
  }
  async put(key: string, body: AsyncIterable<Uint8Array>, bytes: number): Promise<StoredObject> {
    const [kind, id] = key.split('/');
    let assetId = id!;
    if (kind === 'staging') {
      const row = await this.pool.query<{ asset_id: string }>(
        'SELECT asset_id FROM media.upload_sessions WHERE id=$1',
        [id],
      );
      if (!row.rows[0]) throw new ApplicationError('NOT_FOUND', 'Upload session not found.');
      assetId = row.rows[0].asset_id;
    }
    return this.withOwner(assetId, false, () => this.storage.put(key, body, bytes));
  }
  inspect(key: string, maxBytes: number) {
    return this.storage.inspect(key, maxBytes);
  }
  available(key: string, bytes: string) {
    return this.storage.available(key, bytes);
  }
  read(key: string, range?: { start: number; end: number }, v?: string | null) {
    return this.storage.read(key, range, v);
  }
  sign(key: string, seconds: number, mime: string, download: boolean, v?: string | null) {
    if (!this.storage.sign)
      throw new ApplicationError('INVALID_STATE', 'Signed delivery is unavailable.');
    return this.storage.sign(key, seconds, mime, download, v);
  }
  inventory(prefix: string) {
    return this.storage.inventory(prefix);
  }
  removeNamespace(prefix: string) {
    return this.storage.removeNamespace(prefix);
  }
  async close() {
    try {
      await this.locks.end();
    } finally {
      await this.storage.close();
    }
  }
}
