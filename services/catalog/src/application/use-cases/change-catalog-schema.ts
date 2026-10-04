import { ApplicationError, version } from '@golden-lift/contracts';
import type {
  AttributeDefinitionDto,
  AuthenticatedActor,
  SchemaChangeImpact,
  TypeAttributeDto,
  Uuid,
} from '@golden-lift/contracts';
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
function samePolicy(a: TypeAttributeDto, b: TypeAttributeDto) {
  return (
    a.required === b.required &&
    a.public === b.public &&
    a.searchable === b.searchable &&
    a.filterable === b.filterable &&
    a.comparable === b.comparable
  );
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
    const facts = await r.schemaChanges.facts(target);
    if (
      facts.target.version !== expected.expectedVersion ||
      (target.resource === 'types' &&
        (!('schemaRevision' in facts.target) ||
          facts.target.schemaRevision !== expected.expectedSchemaRevision))
    )
      throw new ApplicationError(
        'VERSION_CONFLICT',
        'Catalog configuration or effective schema has changed.',
      );
    const expectedPrefix = {
      types: ['type.', 'assignment.', 'group.place', 'group.remove'],
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
    if (
      change.kind === 'type.metadata' ||
      change.kind === 'group.metadata' ||
      change.kind === 'unit.metadata'
    )
      (change.kind === 'unit.metadata' ? validateLabels : validateNamed)({
        code: facts.target.code,
        translations: change.translations,
      });
    if (change.kind === 'option.update') {
      validateLabels(change.option);
      if (change.option.code !== facts.target.code)
        invalid('Stable option codes cannot be changed.');
    }
    if (change.kind === 'assignment.put') {
      const d = await r.definitions.find(change.assignment.definitionId);
      if (!d) invalid('Attribute definition is unavailable.');
      const exists = facts.schemas[0]?.attributes.some((a) => a.id === change.assignmentId);
      if (!exists && (d.deprecated || ('deprecated' in facts.target && facts.target.deprecated)))
        blockers.push('Deprecated definitions/types cannot receive new assignments.');
      evaluation = { ...facts, target: d };
    }
    if (change.kind === 'group.place') {
      const s = facts.schemas[0];
      if (!s) invalid('Type schema is unavailable.');
      if (
        !(await r.groups.find(change.groupId)) ||
        (!change.placementId && s.groups.some((g) => g.group.id === change.groupId)) ||
        (change.placementId &&
          !s.groups.some((g) => g.id === change.placementId && g.group.id === change.groupId)) ||
        (!change.placementId && s.groups.length >= 500)
      )
        invalid('Invalid, duplicate or oversized group placement.');
    }
    if (change.kind === 'type.order') {
      const s = facts.schemas[0];
      if (!s) invalid('Type schema is unavailable.');
      const actual = change.collection === 'groups' ? s.groups : s.attributes;
      if (
        change.orderedIds.length > 500 ||
        new Set(change.orderedIds).size !== change.orderedIds.length ||
        actual.length !== change.orderedIds.length ||
        actual.some((x) => !change.orderedIds.includes(x.id))
      )
        invalid('Ordering requires the complete active membership exactly once.');
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
    if (change.kind === 'type.copy') {
      const source = await r.productTypes.schema(change.sourceTypeId),
        destination = schemas[0];
      if (source.type.schemaRevision !== change.expectedSourceSchemaRevision)
        throw new ApplicationError('VERSION_CONFLICT', 'Source type schema has changed.');
      if (
        !destination ||
        source.type.id === destination.type.id ||
        source.type.deprecated ||
        destination.type.deprecated
      )
        invalid('Copy requires distinct available source and destination types.');
      const copied = source.attributes.filter(
        (a) => !destination.attributes.some((d) => d.definition.id === a.definition.id),
      );
      if (
        source.attributes.some((a) =>
          destination.attributes.some(
            (d) => d.definition.id === a.definition.id && !samePolicy(a, d),
          ),
        )
      )
        blockers.push('Copy collisions have incompatible destination policies.');
      if (
        destination.attributes.length + copied.length > 500 ||
        destination.groups.length +
          source.groups.filter((g) => !destination.groups.some((d) => d.group.id === g.group.id))
            .length >
          500
      )
        blockers.push('Copy exceeds bounded type configuration limits.');
      schemas = [{ ...destination, attributes: [...destination.attributes, ...copied] }];
    }
    let invalidProducts = 0;
    for (const p of facts.products) {
      const schema = schemas.find((s) => s.type.id === p.productTypeId);
      if (!schema) continue;
      try {
        validateValues(schema, p.values);
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
      ),
      assignmentId = this.ids.newUuid(),
      groupId = this.ids.newUuid();
    return this.uow.execute(async (r) => {
      const impact = await this.impact(r, target, change, expected);
      if (impact.precondition !== precondition)
        throw new ApplicationError('VERSION_CONFLICT', 'Impact preview is stale.');
      if (impact.blockers.length)
        invalid('The proposed schema change has unresolved impact blockers.');
      const id = target.id as Uuid;
      switch (change.kind) {
        case 'type.metadata':
          await r.productTypes.putMetadata(id, change.translations);
          break;
        case 'type.deprecate':
          await r.productTypes.deprecate(id);
          break;
        case 'type.delete':
          await r.productTypes.softDelete(id);
          break;
        case 'assignment.put':
          await r.productTypes.putAssignment(
            id,
            change.assignmentId ?? assignmentId,
            change.assignment,
          );
          break;
        case 'assignment.remove':
          await r.productTypes.removeAssignment(change.assignmentId);
          break;
        case 'group.place':
          await r.productTypes.putGroup(
            id,
            change.placementId ?? groupId,
            change.groupId,
            change.sortOrder,
          );
          break;
        case 'group.remove':
          await r.productTypes.removeGroup(change.placementId, change.moveAssignmentsTo);
          break;
        case 'type.order':
          await r.productTypes.order(id, change.collection, change.orderedIds);
          break;
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
        case 'type.copy': {
          const source = await r.productTypes.schema(change.sourceTypeId),
            destination = await r.productTypes.schema(id),
            placements = new Map(destination.groups.map((g) => [g.group.id, g.id]));
          for (const g of source.groups)
            if (!placements.has(g.group.id)) {
              const newId = this.ids.newUuid();
              await r.productTypes.putGroup(id, newId, g.group.id, g.sortOrder);
              placements.set(g.group.id, newId);
            }
          for (const a of source.attributes)
            if (!destination.attributes.some((d) => d.definition.id === a.definition.id)) {
              const group = source.groups.find((g) => g.id === a.groupPlacementId);
              await r.productTypes.putAssignment(id, this.ids.newUuid(), {
                definitionId: a.definition.id,
                groupPlacementId: group ? (placements.get(group.group.id) ?? null) : null,
                sortOrder: a.sortOrder,
                required: a.required,
                public: a.public,
                searchable: a.searchable,
                filterable: a.filterable,
                comparable: a.comparable,
              });
            }
          break;
        }
      }
      const result =
        target.resource === 'types'
          ? await r.productTypes.find(id)
          : target.resource === 'definitions'
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
