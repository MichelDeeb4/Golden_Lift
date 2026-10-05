import { ApplicationError, mediaEvent, record } from '@golden-lift/contracts';
import type { MediaAction, MediaContext, Uuid } from '@golden-lift/contracts';
import type { CatalogMedia, MediaAsset } from '../../application/ports/media.js';

export class HttpCatalogMedia implements CatalogMedia {
  constructor(
    private readonly origin: string,
    private readonly token: string | undefined,
  ) {}
  private async request(path: string, body?: unknown): Promise<unknown> {
    if (!this.token)
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Media–Catalog coordination is not configured.',
      );
    try {
      const response = await fetch(this.origin + '/internal/v1/media/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: 'Bearer ' + this.token, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (response.status === 403)
        throw new ApplicationError('FORBIDDEN', 'Catalog denied this media context.');
      if (response.status === 422)
        throw new ApplicationError(
          'INVALID_STATE',
          'Active Catalog references prevent retirement.',
        );
      if (!response.ok) throw new Error('Coordination unavailable.');
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Catalog media coordination is unavailable.',
      );
    }
  }
  async authorize(id: Uuid, context: MediaContext, action: MediaAction) {
    const result = record(await this.request(id + '/authorize', { context, action }));
    if (
      typeof result['expiresAt'] !== 'string' ||
      !Number.isFinite(Date.parse(result['expiresAt']))
    )
      throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Invalid Catalog grant.');
    return { expiresAt: result['expiresAt'] };
  }
  usage(id: Uuid, after: number, limit: number) {
    return this.request(`${id}/usage?after=${after}&limit=${limit}`);
  }
  async retirement(asset: MediaAsset) {
    return mediaEvent(
      await this.request(asset.id + '/retire', { kind: asset.kind, sourceVersion: asset.version }),
    );
  }
  async registration(id: Uuid) {
    const result = record(await this.request(id + '/registration'));
    if (
      typeof result['registered'] !== 'boolean' ||
      typeof result['retired'] !== 'boolean' ||
      typeof result['blocked'] !== 'boolean'
    )
      throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Invalid Catalog registration.');
    return {
      registered: result['registered'],
      retired: result['retired'],
      blocked: result['blocked'],
    };
  }
}
