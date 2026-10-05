import { ApplicationError } from '@golden-lift/contracts';
import type { AuthenticatedActor, Uuid, Version } from '@golden-lift/contracts';
import { requireAdmin } from '../../domain/staff-access.js';
import { validateUpload } from '../../domain/media-policy.js';
import type { MediaPolicy, UploadInput } from '../../domain/media-policy.js';
import type { MediaUnitOfWork, MediaIds, MediaClock, UploadSession } from '../ports/media.js';
import type { PrivateStorage, StoredObject } from '../ports/storage.js';

export class Uploads {
  constructor(
    private readonly transactions: MediaUnitOfWork,
    private readonly storage: PrivateStorage,
    private readonly ids: MediaIds,
    private readonly clock: MediaClock,
    private readonly policy: MediaPolicy,
  ) {}
  async initiate(input: UploadInput, actor: AuthenticatedActor) {
    requireAdmin(actor);
    validateUpload(input, this.policy);
    const hash = this.ids.hash(
      JSON.stringify([input.kind, input.name, input.bytes, input.purpose, input.sha256]),
    );
    const assetId = this.ids.uuid(),
      sessionId = this.ids.uuid();
    return this.transactions.execute((r) =>
      r.allocate(input, actor.id, assetId, sessionId, hash, this.storage.bucket, this.policy),
    );
  }
  async status(id: Uuid, actor: AuthenticatedActor) {
    requireAdmin(actor);
    const row = await this.transactions.execute((r) => r.session(id));
    if (row.uploader !== actor.id)
      throw new ApplicationError('FORBIDDEN', 'Upload belongs to another Admin.');
    return row;
  }
  async part(id: Uuid, index: number, bytes: Uint8Array, actor: AuthenticatedActor) {
    const row = await this.status(id, actor);
    if (row.status !== 'OPEN' || row.expires <= this.clock.now())
      throw new ApplicationError('INVALID_STATE', 'Upload is closed or expired.');
    const count = Math.ceil(Number(row.bytes) / this.policy.partBytes);
    if (
      !Number.isInteger(index) ||
      index < 1 ||
      index > count ||
      bytes.length !==
        Math.min(this.policy.partBytes, Number(row.bytes) - (index - 1) * this.policy.partBytes)
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid part number or size.');
    const sha256 = this.ids.digest(bytes),
      key = `staging/${id}/part_${index}`;
    async function* body() {
      yield bytes;
    }
    let object: StoredObject;
    try {
      object = await this.storage.put(key, body(), bytes.length);
    } catch {
      try {
        object = await this.storage.inspect(key, bytes.length);
      } catch {
        throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Private storage is unavailable.');
      }
    }
    if (object.sha256 !== sha256 || object.bytes !== String(bytes.length))
      throw new ApplicationError('CONFLICT', 'A different part already exists.');
    return this.transactions.execute((r) => r.part(id, actor.id, index, object));
  }
  async complete(id: Uuid, expected: Version, actor: AuthenticatedActor) {
    requireAdmin(actor);
    const current = await this.status(id, actor);
    const required = Math.ceil(Number(current.bytes) / this.policy.partBytes);
    if (current.status === 'OPEN' && Object.keys(current.parts).length !== required)
      throw new ApplicationError('INVALID_STATE', 'Required upload parts are missing.');
    const token = this.ids.uuid();
    const row = await this.transactions.execute((r) => r.beginSeal(id, actor.id, expected, token));
    if (row.status === 'COMPLETED') return row;
    const count = Math.ceil(Number(row.bytes) / this.policy.partBytes);
    if (Object.keys(row.parts).length !== count)
      throw new ApplicationError('INVALID_STATE', 'Required upload parts are missing.');
    const storage = this.storage;
    async function* original() {
      for (let i = 1; i <= count; i++) {
        const part = row.parts[String(i)];
        if (!part)
          throw new ApplicationError('INVALID_STATE', 'Required upload parts are missing.');
        for await (const chunk of await storage.read(part.key)) yield chunk;
      }
    }
    const key = 'originals/' + row.assetId;
    // An uncertain PUT is reconciled by reading the same write-once key, never by allocating another asset.
    try {
      await storage.put(key, original(), Number(row.bytes));
    } catch {
      /* inspect below establishes whether exclusive publication succeeded */
    }
    let sealed: StoredObject;
    try {
      sealed = await storage.inspect(key, Number(row.bytes));
    } catch {
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Sealing is incomplete; retry completion.',
      );
    }
    return this.transactions.execute((r) => r.complete(id, row.sealingToken!, sealed));
  }
  async cancel(id: Uuid, expected: Version, actor: AuthenticatedActor): Promise<UploadSession> {
    requireAdmin(actor);
    return this.transactions.execute((r) => r.cancel(id, actor.id, expected));
  }
}
