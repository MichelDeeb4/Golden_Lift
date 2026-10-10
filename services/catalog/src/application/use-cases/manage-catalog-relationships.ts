import { ApplicationError, uuid } from '@business-platform/contracts';
import type { AuthenticatedActor, Uuid, Version } from '@business-platform/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { validateValues } from '../../domain/attribute-values.js';
import type {
  CatalogRepositories,
  CatalogUnitOfWork,
  Clock,
  IdGenerator,
} from '../ports/catalog.js';
import type { RelationshipTarget } from '../ports/catalog-relationships.js';
import { configurationEvent } from '../models/configuration-event.js';

export function relationshipIds(ids: readonly Uuid[]): readonly Uuid[] {
  if (!Array.isArray(ids) || ids.length > 500 || new Set(ids).size !== ids.length)
    throw new ApplicationError('VALIDATION_FAILED', 'Choose each relationship once, up to 500.');
  return ids.map(uuid);
}
export class ManageCatalogRelationships {
  constructor(
    private readonly uow: CatalogUnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}
  async read(target: RelationshipTarget, actor: AuthenticatedActor) {
    requireContentAdmin(actor);
    return this.uow.execute(async (r) => {
      const state = await r.relationships.snapshot(target);
      return { version: state.version, orderedIds: state.orderedIds };
    });
  }
  private async impact(
    r: CatalogRepositories,
    target: RelationshipTarget,
    orderedIds: readonly Uuid[],
    expectedVersion: Version,
  ) {
    const state = await r.relationships.snapshot(target, orderedIds);
    if (state.version !== expectedVersion)
      throw new ApplicationError('VERSION_CONFLICT', 'Relationship owner changed.');
    let count = 0,
      invalid = 0;
    const removed = new Set<Uuid>(),
      added = new Set<Uuid>();
    let fingerprint = state.state;
    for (const categoryId of state.categoryIds) {
      const before = await r.categorySchemas.schema(categoryId);
      const after = await r.relationships.prospectiveSchema(categoryId, target, orderedIds);
      for (const a of before.attributes)
        if (!after.attributes.some((b) => b.definition.id === a.definition.id))
          removed.add(a.definition.id);
      for (const a of after.attributes)
        if (!before.attributes.some((b) => b.definition.id === a.definition.id))
          added.add(a.definition.id);
      const products = await r.products.productsByCategory(categoryId, 1001);
      count += products.length;
      if (count > 1000)
        throw new ApplicationError(
          'INVALID_STATE',
          'Review supports at most 1000 affected products; partition the change.',
        );
      for (const p of products) {
        // Drafts retain nonapplicable values. Published products must continue to satisfy their schema.
        if (p.active)
          try {
            validateValues(after, p.values);
          } catch (e) {
            if (e instanceof ApplicationError) invalid++;
            else throw e;
          }
      }
      fingerprint += JSON.stringify({ before, after, products });
    }
    return {
      precondition: r.schemaChanges.precondition(
        { target, orderedIds, expectedVersion },
        fingerprint,
      ),
      affectedProductCount: String(count),
      invalidProductCount: String(invalid),
      removedAttributeIds: [...removed],
      addedAttributeIds: [...added],
      blockers: invalid
        ? [
            'Published products would become invalid. Review their values or unpublish before changing memberships.',
          ]
        : [],
      valuesRetained: true,
    };
  }
  async preview(
    target: RelationshipTarget,
    input: readonly Uuid[],
    expectedVersion: Version,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    const ids = relationshipIds(input);
    return this.uow.execute((r) => this.impact(r, target, ids, expectedVersion));
  }
  async commit(
    target: RelationshipTarget,
    input: readonly Uuid[],
    expectedVersion: Version,
    precondition: string,
    confirm: boolean,
    actor: AuthenticatedActor,
  ) {
    requireContentAdmin(actor);
    const ids = relationshipIds(input);
    if (!confirm)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Explicit relationship review confirmation required.',
      );
    const event = configurationEvent(
      this.ids,
      this.clock,
      'CatalogRelationships',
      target.id,
      expectedVersion,
    );
    return this.uow.execute(async (r) => {
      const impact = await this.impact(r, target, ids, expectedVersion);
      if (impact.precondition !== precondition)
        throw new ApplicationError(
          'VERSION_CONFLICT',
          'Relationship impact changed; review again.',
        );
      if (impact.blockers.length)
        throw new ApplicationError(
          'INVALID_STATE',
          'Resolve published-product impact before committing.',
        );
      await r.relationships.replace(target, ids);
      const state = await r.relationships.snapshot(target);
      await r.outbox.append({
        ...event,
        aggregate: { ...event.aggregate, version: state.version },
      });
      return { version: state.version, orderedIds: state.orderedIds };
    });
  }
}
