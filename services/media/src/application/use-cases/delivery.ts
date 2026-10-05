import { ApplicationError } from '@golden-lift/contracts';
import type { AuthenticatedActor, MediaAction, MediaContext, Uuid } from '@golden-lift/contracts';
import { requireAdmin } from '../../domain/staff-access.js';
import type { CatalogMedia, MediaUnitOfWork, MediaClock } from '../ports/media.js';

export class AuthorizeDelivery {
  constructor(
    private readonly transactions: MediaUnitOfWork,
    private readonly catalog: CatalogMedia,
    private readonly clock: MediaClock,
    private readonly seconds: number,
  ) {}
  async execute(
    id: Uuid,
    profile: string,
    action: MediaAction,
    context: MediaContext | null,
    actor: AuthenticatedActor | null,
  ) {
    const start = this.clock.now();
    let expires = new Date(new Date(start).getTime() + this.seconds * 1000).toISOString();
    if (actor) requireAdmin(actor);
    else {
      if (!context) throw new ApplicationError('FORBIDDEN', 'A public media context is required.');
      const grant = await this.catalog.authorize(id, context, action);
      if (grant.expiresAt < expires) expires = grant.expiresAt;
    }
    const asset = await this.transactions.execute((r) => r.asset(id));
    if (asset.deleted || asset.status !== 'READY' || asset.security !== 'VERIFIED')
      throw new ApplicationError('FORBIDDEN', 'Media is unavailable.');
    if (profile === 'original') {
      if (
        asset.kind !== 'PDF' ||
        action !== 'DOWNLOAD' ||
        (!actor && context?.ownerType !== 'TECHNICAL_SOURCE')
      )
        throw new ApplicationError('FORBIDDEN', 'Original source access is restricted.');
      return {
        assetId: id,
        profile,
        action,
        audience: actor ? 'ADMIN' : 'PUBLIC',
        context,
        expires,
        key: asset.key,
        objectVersion: asset.inputVersion,
        bytes: asset.bytes!,
        sha256: asset.sha256!,
        mime: asset.mime!,
      };
    }
    if (!actor && asset.kind === 'PDF')
      throw new ApplicationError(
        'FORBIDDEN',
        'Public PDF preview is not authorized by the current Catalog policy.',
      );
    const variant = asset.variants.find((v) => v.profile === profile);
    if (!variant || !variant.sha256)
      throw new ApplicationError('NOT_FOUND', 'Verified variant not found.');
    return {
      assetId: id,
      profile,
      action,
      audience: actor ? 'ADMIN' : 'PUBLIC',
      context,
      expires,
      key: variant.key,
      objectVersion: variant.version,
      bytes: variant.bytes,
      sha256: variant.sha256,
      mime: variant.mime,
    };
  }
}
