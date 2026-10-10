import { ApplicationError } from '@business-platform/contracts';
import type {
  MediaAction,
  MediaContext,
  MediaEvent,
  MediaKind,
  Uuid,
  Version,
} from '@business-platform/contracts';
import type { CatalogMediaRegistry } from '../ports/media.js';
export class MediaCoordination {
  constructor(private readonly registry: CatalogMediaRegistry) {}
  apply(event: MediaEvent) {
    if (event.producer !== 'media' || event.type === 'catalog.asset.retired.v1')
      throw new ApplicationError('VALIDATION_FAILED', 'Unexpected Media event producer.');
    if (event.type === 'media.asset.security.v1' && !event.blocked)
      throw new ApplicationError('INVALID_STATE', 'Security block release is not supported.');
    return this.registry.apply(event);
  }
  registration(id: Uuid) {
    return this.registry.registration(id);
  }
  usage(id: Uuid, after: number, limit: number) {
    return this.registry.usage(id, after, limit);
  }
  authorize(id: Uuid, context: MediaContext, action: MediaAction) {
    if (context.ownerType === 'TECHNICAL_SOURCE' && action !== 'DOWNLOAD')
      throw new ApplicationError('FORBIDDEN', 'Public source preview is not authorized.');
    return this.registry.authorize(id, context, action);
  }
  retire(id: Uuid, kind: MediaKind, sourceVersion: Version) {
    return this.registry.retire(id, kind, sourceVersion);
  }
}
