import { ApplicationError, version } from '@business-platform/contracts';
import type {
  AttributeDefinitionDto,
  AuthenticatedActor,
  SchemaChangeImpact,
  Uuid,
} from '@business-platform/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { exactQuantity, validateValues } from '../../domain/attribute-values.js';
import type {
  CatalogRepositories,
  CatalogUnitOfWork,
  Clock,
  IdGenerator,
} from '../ports/catalog.js';
import type {
  ConfigurationChange,
  ConfigurationPreconditions,
  ConfigurationTarget,
  SchemaChangeFacts,
} from '../ports/product-schema.js';
import { evolvedSchemas } from '../models/schema-evolution.js';
import { configurationEvent } from '../models/configuration-event.js';
import {
  validateDefinition,
  validateNamed,
  validateLabels,
} from './create-catalog-configuration.js';
function invalid(message: string): never {
  throw new ApplicationError('INVALID_STATE', message);
}
export class ChangeCatalogSchema {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  private async impact(
    r: CatalogRepositories,
    target: ConfigurationTarget,
    change: ConfigurationChange,
    expected: ConfigurationPreconditions,
  ): Promise<SchemaChangeImpact> {
    if (['definition.delete', 'group.delete', 'unit.delete'].includes(change.kind))
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Use the explicit deletion impact and DELETE endpoint for this entity.',
      );
    const facts = await r.schemaChanges.facts(target);
    if (facts.target.version !== expected.expectedVersion)
      throw new ApplicationError(
        'VERSION_CONFLICT',
        'Catalog configuration or effective schema has changed.',
      );
    const expectedPrefix = {
      definitions: ['definition.'],
      options: ['option.'],
      groups: ['group.metadata', 'group.delete'],
      units: ['unit.'],
    }[target.resource];
    if (!expectedPrefix.some((p) => change.kind.startsWith(p)))
      throw new ApplicationError('VALIDATION_FAILED', 'Change does not belong to this resource.');
    const blockers: string[] = [];
    let evaluation: SchemaChangeFacts = facts;
    if (change.kind === 'definition.update') {
      validateDefinition(change.definition);
      const d = facts.target as AttributeDefinitionDto;
      if (d.code !== change.definition.code) invalid('Stable definition codes cannot be changed.');
      if (
        facts.retainedSemanticUse &&
        (d.kind !== change.definition.kind ||
          d.unit?.code !== (change.definition.unitCode ?? undefined))
      )
        blockers.push(
          'Retained product/technical values prohibit semantic type or canonical-unit changes.',
        );
      if (change.definition.unitCode && !(await r.units.find(change.definition.unitCode)))
        blockers.push('Canonical unit is unavailable.');
      if (
        facts.technicalBounds.some(
          (n) =>
            (change.definition.minimum !== null &&
              exactQuantity(n) < exactQuantity(change.definition.minimum)) ||
            (change.definition.maximum !== null &&
              exactQuantity(n) > exactQuantity(change.definition.maximum)),
        )
      )
        blockers.push('Existing technical measurements violate the proposed bounds.');
    }
    if (change.kind === 'group.metadata' || change.kind === 'unit.metadata')
      (change.kind === 'unit.metadata' ? validateLabels : validateNamed)({
        code: facts.target.code,
        translations: change.translations,
      });
    if (change.kind === 'option.update') {
      validateLabels(change.option);
      if (change.option.code !== facts.target.code)
        invalid('Stable option codes cannot be changed.');
    }
    let schemas = facts.schemas;
    try {
      schemas = evolvedSchemas(evaluation, change);
    } catch (e) {
      if (e instanceof ApplicationError) blockers.push(e.message);
      else throw e;
    }
    if (change.kind.endsWith('.delete') && facts.activeReferenceCount !== '0')
      blockers.push('Active references must be explicitly migrated or removed before deletion.');
    let invalidProducts = 0;
    for (const p of facts.products) {
      const schema = schemas.find((s) => 'categoryId' in s && s.categoryId === p.categoryId);
      if (!schema) continue;
      try {
        validateValues(schema, p.values, p.active);
      } catch (e) {
        if (e instanceof ApplicationError) invalidProducts++;
        else throw e;
      }
    }
    if (invalidProducts)
      blockers.push('Populate or explicitly remove incompatible values before this schema change.');
    return {
      precondition: r.schemaChanges.precondition({ target, change, expected }, facts.state),
      affectedProductCount: facts.products.length.toString(),
      invalidProductCount: invalidProducts.toString(),
      blockers: [...new Set(blockers)],
      downloadableDocumentCount: facts.downloadableDocumentCount,
      fileContentsRedacted: false,
    };
  }
  async preview(
    target: ConfigurationTarget,
    change: ConfigurationChange,
    expected: ConfigurationPreconditions,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    return this.uow.execute((r) => this.impact(r, target, change, expected));
  }
  async commit(
    target: ConfigurationTarget,
    change: ConfigurationChange,
    expected: ConfigurationPreconditions,
    precondition: string,
    confirm: true,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    if (confirm !== true)
      throw new ApplicationError('VALIDATION_FAILED', 'Explicit change confirmation is required.');
    const event = configurationEvent(
      this.ids,
      this.clock,
      'CatalogConfiguration',
      target.id,
      expected.expectedVersion,
    );
    return this.uow.execute(async (r) => {
      const impact = await this.impact(r, target, change, expected);
      if (impact.precondition !== precondition)
        throw new ApplicationError('VERSION_CONFLICT', 'Impact preview is stale.');
      if (impact.blockers.length)
        invalid('The proposed schema change has unresolved impact blockers.');
      const id = target.id as Uuid;
      switch (change.kind) {
        case 'definition.update':
          await r.definitions.update(id, change.definition);
          break;
        case 'definition.deprecate':
          await r.definitions.deprecate(id);
          break;
        case 'definition.delete':
          await r.definitions.softDelete(id);
          break;
        case 'option.update':
          await r.definitions.updateOption(id, change.option);
          break;
        case 'option.deprecate':
          await r.definitions.deprecateOption(id);
          break;
        case 'option.delete':
          await r.definitions.softDeleteOption(id);
          break;
        case 'group.metadata':
          await r.groups.update(id, change.translations);
          break;
        case 'group.delete':
          await r.groups.softDelete(id);
          break;
        case 'unit.metadata':
          await r.units.update(target.id, change.translations);
          break;
        case 'unit.delete':
          await r.units.softDelete(target.id);
          break;
      }
      const result =
        target.resource === 'definitions'
          ? await r.definitions.find(id)
          : target.resource === 'options'
            ? await r.definitions.option(id)
            : target.resource === 'groups'
              ? await r.groups.find(id)
              : await r.units.find(target.id);
      await r.outbox.append({
        ...event,
        aggregate: {
          ...event.aggregate,
          version: result?.version ?? version((BigInt(expected.expectedVersion) + 1n).toString()),
        },
      });
      return { changed: true, resourceId: target.id, configuration: result };
    });
  }
}
