import { ApplicationError, version } from '@golden-lift/contracts';
import type {
  AuthenticatedActor,
  DeleteCommand,
  DeletionImpact,
  Uuid,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import type { CatalogDeletionUnitOfWork } from '../ports/deletion.js';
import type { Clock, IdGenerator } from '../ports/catalog.js';

import { configurationEvent } from '../models/configuration-event.js';

function validate(impact: DeletionImpact, command: DeleteCommand) {
  if (command.confirmed !== true)
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Explicit permanent deletion confirmation required.',
    );
  if (impact.expectedVersion !== command.expectedVersion)
    throw new ApplicationError('VERSION_CONFLICT', 'The entity changed; refresh deletion impact.');
  if (!impact.allowed)
    throw new ApplicationError(
      impact.entity.type === 'CATEGORY'
        ? 'DELETE_BLOCKED_BY_PRODUCTS'
        : impact.entity.type === 'UNIT'
          ? 'DELETE_BLOCKED_BY_UNIT_USAGE'
          : 'INVALID_STATE',
      impact.warnings.join(' ') || 'Deletion has blocking dependencies.',
    );
  if (impact.impactRevision !== command.impactRevision)
    throw new ApplicationError(
      'DELETE_IMPACT_CHANGED',
      'Dependencies changed; refresh deletion impact.',
    );
}

export class GetProductDeletionImpact {
  constructor(private readonly uow: CatalogDeletionUnitOfWork) {}
  execute(id: Uuid, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute((r) => r.productImpact(id));
  }
}
export class DeleteProduct {
  constructor(
    private readonly uow: CatalogDeletionUnitOfWork,
    private readonly ids: IdGenerator,
  ) {}
  execute(id: Uuid, command: DeleteCommand, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    const operationId = this.ids.newUuid();
    return this.uow.execute(async (r) => {
      validate(await r.productImpact(id), command);
      return r.deleteProduct(id, operationId, actor);
    });
  }
}
export class GetMediaDeletionImpact {
  constructor(private readonly uow: CatalogDeletionUnitOfWork) {}
  execute(id: Uuid, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute((r) => r.mediaImpact(id));
  }
}
export class DeleteMedia {
  constructor(
    private readonly uow: CatalogDeletionUnitOfWork,
    private readonly ids: IdGenerator,
  ) {}
  execute(id: Uuid, command: DeleteCommand, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    const operationId = this.ids.newUuid();
    return this.uow.execute(async (r) => {
      validate(await r.mediaImpact(id), command);
      return r.deleteMedia(id, operationId, actor);
    });
  }
}
export class GetAttributeDeletionImpact {
  constructor(private readonly uow: CatalogDeletionUnitOfWork) {}
  execute(id: Uuid, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute((r) => r.attributeImpact(id));
  }
}
export class DeleteAttribute {
  constructor(
    private readonly uow: CatalogDeletionUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  execute(id: Uuid, command: DeleteCommand, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Attribute',
      id,
      version((BigInt(command.expectedVersion) + 1n).toString()),
      'catalog.attribute.deleted.v1',
    );
    return this.uow.execute(async (r) => {
      validate(await r.attributeImpact(id), command);
      await r.deleteAttribute(id);
      await r.append(event);
      return { status: 'COMPLETED' as const };
    });
  }
}
export class GetAttributeGroupDeletionImpact {
  constructor(private readonly uow: CatalogDeletionUnitOfWork) {}
  execute(id: Uuid, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute((r) => r.groupImpact(id));
  }
}
export class DeleteAttributeGroup {
  constructor(
    private readonly uow: CatalogDeletionUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  execute(id: Uuid, command: DeleteCommand, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    const event = configurationEvent(
      this.ids,
      this.clock,
      'AttributeGroup',
      id,
      version((BigInt(command.expectedVersion) + 1n).toString()),
      'catalog.group.deleted.v1',
    );
    return this.uow.execute(async (r) => {
      validate(await r.groupImpact(id), command);
      await r.deleteGroup(id);
      await r.append(event);
      return { status: 'COMPLETED' as const };
    });
  }
}
export class GetUnitDeletionImpact {
  constructor(private readonly uow: CatalogDeletionUnitOfWork) {}
  execute(code: string, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute((r) => r.unitImpact(code));
  }
}
export class DeleteUnit {
  constructor(
    private readonly uow: CatalogDeletionUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  execute(code: string, command: DeleteCommand, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    const event = configurationEvent(
      this.ids,
      this.clock,
      'Unit',
      code,
      version((BigInt(command.expectedVersion) + 1n).toString()),
      'catalog.unit.deleted.v1',
    );
    return this.uow.execute(async (r) => {
      validate(await r.unitImpact(code), command);
      await r.deleteUnit(code);
      await r.append(event);
      return { status: 'COMPLETED' as const };
    });
  }
}
export class GetCategoryDeletionImpact {
  constructor(private readonly uow: CatalogDeletionUnitOfWork) {}
  execute(id: Uuid, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute((r) => r.categoryImpact(id));
  }
}
export class DeleteCategoryTree {
  constructor(
    private readonly uow: CatalogDeletionUnitOfWork,
    private readonly ids: IdGenerator,
  ) {}
  execute(id: Uuid, command: DeleteCommand, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    const operationId = this.ids.newUuid();
    return this.uow.execute(async (r) => {
      validate(await r.categoryImpact(id), command);
      return r.deleteCategoryTree(id, operationId, actor);
    });
  }
}
export class GetDeletionOperation {
  constructor(private readonly uow: CatalogDeletionUnitOfWork) {}
  execute(id: Uuid, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute((r) => r.operation(id));
  }
}
