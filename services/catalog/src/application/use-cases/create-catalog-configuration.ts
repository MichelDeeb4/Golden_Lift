import { ApplicationError, version } from '@golden-lift/contracts';
import type { AuthenticatedActor, Uuid } from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { exactQuantity } from '../../domain/attribute-values.js';
import type { CatalogUnitOfWork, Clock, IdGenerator } from '../ports/catalog.js';
import type {
  DefinitionDraft,
  NamedDraft,
  OptionDraft,
  UnitDraft,
} from '../ports/product-schema.js';
import { configurationEvent } from '../models/configuration-event.js';
import { relationshipIds } from './manage-catalog-relationships.js';
export function validateNamed(input: NamedDraft): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(input.code))
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Stable codes require 1–128 ASCII letters, digits, dots, underscores or hyphens.',
    );
  const locales = new Set<string>();
  for (const t of input.translations) {
    if (
      locales.has(t.locale) ||
      !['ar', 'en', 'ckb'].includes(t.locale) ||
      !t.name.trim() ||
      t.name.length > 300 ||
      (t.description?.length ?? 0) > 10000
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid configuration translations.');
    locales.add(t.locale);
  }
  if (!locales.has('ar'))
    throw new ApplicationError('VALIDATION_FAILED', 'A saved Arabic name or label is required.');
}
export function validateDefinition(input: DefinitionDraft): void {
  validateNamed(input);
  if (input.minimum !== null) exactQuantity(input.minimum);
  if (input.maximum !== null) exactQuantity(input.maximum);
  if (
    input.minimum !== null &&
    input.maximum !== null &&
    exactQuantity(input.minimum) > exactQuantity(input.maximum)
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Minimum cannot exceed maximum.');
  if (
    (input.kind !== 'NUMBER' &&
      (input.unitCode !== null || input.minimum !== null || input.maximum !== null)) ||
    (input.kind !== 'CHOICE' && input.allowMultiple) ||
    (input.kind !== 'TEXT' && (input.textMultiline || input.textMaxLength !== 4000)) ||
    !Number.isInteger(input.textMaxLength) ||
    input.textMaxLength < 1 ||
    input.textMaxLength > 10000
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Unsupported attribute validation metadata.');
}
export function validateLabels(input: NamedDraft): void {
  validateNamed(input);
  if (input.translations.some((t) => t.description !== null))
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Units and options support labels without descriptions.',
    );
}
export class CreateAttributeDefinition {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(
    input: DefinitionDraft & { readonly groupIds?: readonly Uuid[] },
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    validateDefinition(input);
    const id = this.ids.newUuid(),
      event = configurationEvent(this.ids, this.clock, 'AttributeDefinition', id, version('1'));
    return this.uow.execute(async (r) => {
      if (input.unitCode && !(await r.units.find(input.unitCode)))
        throw new ApplicationError('INVALID_STATE', 'Canonical unit must be active.');
      await r.definitions.create(id, input);
      if (input.groupIds?.length)
        await r.relationships.replace(
          { resource: 'definitions', id },
          relationshipIds(input.groupIds),
        );
      const result = await r.definitions.find(id);
      if (!result)
        throw new ApplicationError('INTERNAL_ERROR', 'Created configuration could not be read.');
      await r.outbox.append({
        ...event,
        aggregate: { ...event.aggregate, version: result.version },
      });
      return result;
    });
  }
}
export class CreateAttributeGroup {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(
    input: NamedDraft & { readonly attributeIds?: readonly Uuid[] },
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    validateNamed(input);
    const id = this.ids.newUuid(),
      event = configurationEvent(this.ids, this.clock, 'AttributeGroup', id, version('1'));
    return this.uow.execute(async (r) => {
      await r.groups.create(id, input);
      if (input.attributeIds?.length)
        await r.relationships.replace(
          { resource: 'groups', id },
          relationshipIds(input.attributeIds),
        );
      const result = await r.groups.find(id);
      if (!result)
        throw new ApplicationError('INTERNAL_ERROR', 'Created configuration could not be read.');
      await r.outbox.append({
        ...event,
        aggregate: { ...event.aggregate, version: result.version },
      });
      return result;
    });
  }
}
export class CreateCanonicalUnit {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(input: UnitDraft, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    validateLabels(input);
    if (
      !input.symbol.trim() ||
      input.symbol.length > 64 ||
      !input.dimension.trim() ||
      input.dimension.length > 128
    )
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Canonical unit needs a bounded symbol and physical dimension.',
      );
    const event = configurationEvent(this.ids, this.clock, 'Unit', input.code, version('1'));
    return this.uow.execute(async (r) => {
      await r.units.create(input);
      const result = await r.units.find(input.code);
      if (!result)
        throw new ApplicationError('INTERNAL_ERROR', 'Created configuration could not be read.');
      await r.outbox.append({
        ...event,
        aggregate: { ...event.aggregate, version: result.version },
      });
      return result;
    });
  }
}
export class CreateAttributeOption {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async execute(definitionId: Uuid, input: OptionDraft, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    validateLabels(input);
    const id = this.ids.newUuid(),
      event = configurationEvent(this.ids, this.clock, 'AttributeOption', id, version('1'));
    return this.uow.execute(async (r) => {
      const definition = await r.definitions.find(definitionId);
      if (
        !definition ||
        definition.kind !== 'CHOICE' ||
        definition.deprecated ||
        definition.options.length >= 500
      )
        throw new ApplicationError(
          'INVALID_STATE',
          'Options require an active available CHOICE definition with fewer than 500 options.',
        );
      await r.definitions.createOption(definitionId, id, input);
      await r.outbox.append(event);
      return r.definitions.option(id);
    });
  }
}
