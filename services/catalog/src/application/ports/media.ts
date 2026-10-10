import type {
  MediaEvent,
  MediaContext,
  MediaAction,
  Uuid,
  MediaKind,
  Version,
} from '@business-platform/contracts';
export interface CatalogMediaRegistry {
  apply(event: MediaEvent): Promise<void>;
  registration(id: Uuid): Promise<{ registered: boolean; retired: boolean; blocked: boolean }>;
  usage(
    id: Uuid,
    after: number,
    limit: number,
  ): Promise<readonly { ownerType: string; ownerId: Uuid | null }[]>;
  authorize(id: Uuid, context: MediaContext, action: MediaAction): Promise<{ expiresAt: string }>;
  retire(id: Uuid, kind: MediaKind, sourceVersion: Version): Promise<MediaEvent>;
}
