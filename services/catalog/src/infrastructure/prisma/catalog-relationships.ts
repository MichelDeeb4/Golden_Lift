import { ApplicationError, uuid, version } from '@business-platform/contracts';
import type { Uuid } from '@business-platform/contracts';
import type {
  CatalogRelationships,
  RelationshipTarget,
} from '../../application/ports/catalog-relationships.js';
import type { Database } from './client.js';
import { PrismaCategorySchemaRepository } from './category-schema-repository.js';

export class PrismaCatalogRelationships implements CatalogRelationships {
  constructor(private readonly db: Database) {}
  async snapshot(target: RelationshipTarget, proposedIds?: readonly Uuid[]) {
    const db = this.db;
    const owner =
      target.resource === 'categories'
        ? await db.categories.findFirst({
            where: { id: target.id, deleted_at: null },
            select: { version: true },
          })
        : target.resource === 'groups'
          ? await db.specificationGroups.findFirst({
              where: { id: target.id, deleted_at: null },
              select: { version: true },
            })
          : await db.specificationDefinitions.findFirst({
              where: { id: target.id, deleted_at: null },
              select: { version: true },
            });
    if (!owner) throw new ApplicationError('NOT_FOUND', 'Relationship owner not found.');
    const links =
      target.resource === 'categories'
        ? await db.$queryRaw<
            { id: string; linked_id: string; sort_order: string; version: string }[]
          >`SELECT id::text,group_id::text linked_id,sort_order::text,version::text FROM catalog.category_attribute_groups WHERE category_id=${target.id}::uuid AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 501`
        : await db.$queryRaw<
            { id: string; linked_id: string; sort_order: string; version: string }[]
          >`SELECT id::text,CASE WHEN ${target.resource === 'groups'} THEN definition_id ELSE group_id END::text linked_id,sort_order::text,version::text FROM catalog.attribute_group_attributes WHERE deleted_at IS NULL AND ((${target.resource === 'groups'} AND group_id=${target.id}::uuid) OR (${target.resource === 'definitions'} AND definition_id=${target.id}::uuid)) ORDER BY sort_order,id LIMIT 501`;
    if (links.length > 500)
      throw new ApplicationError(
        'INVALID_STATE',
        'Relationship collection exceeds editing bounds.',
      );
    if (proposedIds !== undefined) await this.validateTargets(target, proposedIds);
    const affected =
      target.resource === 'categories'
        ? [{ id: target.id }]
        : await db.$queryRaw<
            { id: string }[]
          >`SELECT DISTINCT c.category_id::text id FROM catalog.category_attribute_groups c WHERE c.deleted_at IS NULL AND ((${target.resource === 'groups'} AND c.group_id=${target.id}::uuid) OR (${target.resource === 'definitions'} AND (c.group_id=ANY(${[...(proposedIds ?? [])]}::uuid[]) OR EXISTS(SELECT 1 FROM catalog.attribute_group_attributes a WHERE a.group_id=c.group_id AND a.definition_id=${target.id}::uuid AND a.deleted_at IS NULL)))) ORDER BY id LIMIT 101`;
    if (affected.length > 100)
      throw new ApplicationError(
        'INVALID_STATE',
        'Review supports at most 100 affected categories.',
      );
    return {
      version: version(owner.version.toString()),
      orderedIds: links.map((x) => uuid(x.linked_id)),
      state: JSON.stringify({ version: owner.version.toString(), links }),
      categoryIds: affected.map((x) => uuid(x.id)),
    };
  }
  async prospectiveSchema(
    categoryId: Uuid,
    target: RelationshipTarget,
    orderedIds: readonly Uuid[],
  ) {
    await this.validateTargets(target, orderedIds);
    return new PrismaCategorySchemaRepository(this.db).schema(categoryId, { target, orderedIds });
  }
  private async validateTargets(target: RelationshipTarget, ids: readonly Uuid[]) {
    const db = this.db;
    const count =
      target.resource === 'groups'
        ? await db.specificationDefinitions.count({
            where: { id: { in: [...ids] }, deleted_at: null, deprecated_at: null },
          })
        : await db.specificationGroups.count({ where: { id: { in: [...ids] }, deleted_at: null } });
    // Already assigned deprecated attributes may remain; new deprecated memberships are prohibited.
    if (target.resource === 'groups' && count !== ids.length) {
      const valid = await db.$queryRaw<
        { id: string }[]
      >`SELECT d.id::text FROM catalog.specification_definitions d WHERE d.id=ANY(${[...ids]}::uuid[]) AND d.deleted_at IS NULL AND (d.deprecated_at IS NULL OR EXISTS(SELECT 1 FROM catalog.attribute_group_attributes a WHERE a.group_id=${target.id}::uuid AND a.definition_id=d.id AND a.deleted_at IS NULL))`;
      if (valid.length !== ids.length)
        throw new ApplicationError(
          'INVALID_STATE',
          'Choose live attributes; deprecated attributes cannot receive new memberships.',
        );
    } else if (count !== ids.length)
      throw new ApplicationError('INVALID_STATE', 'Choose live groups.');
    if (target.resource === 'definitions') {
      const [definition] = await db.$queryRaw<
        { deprecated: boolean }[]
      >`SELECT deprecated_at IS NOT NULL deprecated FROM catalog.specification_definitions WHERE id=${target.id}::uuid AND deleted_at IS NULL`;
      if (!definition) throw new ApplicationError('NOT_FOUND', 'Attribute not found.');
      if (definition.deprecated) {
        const current = await db.$queryRaw<
          { id: string }[]
        >`SELECT group_id::text id FROM catalog.attribute_group_attributes WHERE definition_id=${target.id}::uuid AND deleted_at IS NULL`;
        if (ids.some((id) => !current.some((row) => row.id === id)))
          throw new ApplicationError(
            'INVALID_STATE',
            'Deprecated attributes cannot receive new memberships.',
          );
      }
    }
    if (target.resource === 'categories') {
      const [row] = await db.$queryRaw<
        { leaf: boolean }[]
      >`SELECT NOT EXISTS(SELECT 1 FROM catalog.categories child WHERE child.parent_id=c.id AND child.deleted_at IS NULL) leaf FROM catalog.categories c WHERE c.id=${target.id}::uuid AND c.deleted_at IS NULL`;
      if (!row?.leaf)
        throw new ApplicationError(
          'INVALID_STATE',
          'Attribute groups are available only for live leaf categories.',
        );
    }
  }
  async replace(target: RelationshipTarget, orderedIds: readonly Uuid[]) {
    await this.validateTargets(target, orderedIds);
    const db = this.db,
      ids = [...orderedIds];
    if (target.resource === 'categories') {
      await db.$executeRaw`UPDATE catalog.category_attribute_groups SET deleted_at=clock_timestamp() WHERE category_id=${target.id}::uuid AND deleted_at IS NULL AND NOT(group_id=ANY(${ids}::uuid[]))`;
      await db.$executeRaw`UPDATE catalog.category_attribute_groups a SET sort_order=s.ordinality*1024 FROM unnest(${ids}::uuid[]) WITH ORDINALITY s(id,ordinality) WHERE a.category_id=${target.id}::uuid AND a.group_id=s.id AND a.deleted_at IS NULL AND a.sort_order<>s.ordinality*1024`;
      await db.$executeRaw`INSERT INTO catalog.category_attribute_groups(category_id,group_id,sort_order) SELECT ${target.id}::uuid,s.id,s.ordinality*1024 FROM unnest(${ids}::uuid[]) WITH ORDINALITY s(id,ordinality) WHERE NOT EXISTS(SELECT 1 FROM catalog.category_attribute_groups a WHERE a.category_id=${target.id}::uuid AND a.group_id=s.id AND a.deleted_at IS NULL)`;
      await db.$executeRaw`UPDATE catalog.categories SET updated_at=clock_timestamp() WHERE id=${target.id}::uuid`;
    } else if (target.resource === 'groups') {
      const prior = await db.$queryRaw<
        { id: string }[]
      >`SELECT definition_id::text id FROM catalog.attribute_group_attributes WHERE group_id=${target.id}::uuid AND deleted_at IS NULL`;
      const changed = [
        ...prior.map((row) => row.id).filter((id) => !ids.includes(uuid(id))),
        ...ids.filter((id) => !prior.some((row) => row.id === id)),
      ];
      await db.$executeRaw`UPDATE catalog.attribute_group_attributes SET deleted_at=clock_timestamp() WHERE group_id=${target.id}::uuid AND deleted_at IS NULL AND NOT(definition_id=ANY(${ids}::uuid[]))`;
      await db.$executeRaw`UPDATE catalog.attribute_group_attributes a SET sort_order=s.ordinality*1024 FROM unnest(${ids}::uuid[]) WITH ORDINALITY s(id,ordinality) WHERE a.group_id=${target.id}::uuid AND a.definition_id=s.id AND a.deleted_at IS NULL AND a.sort_order<>s.ordinality*1024`;
      await db.$executeRaw`INSERT INTO catalog.attribute_group_attributes(group_id,definition_id,sort_order,is_filterable) SELECT ${target.id}::uuid,s.id,s.ordinality*1024,d.is_filterable FROM unnest(${ids}::uuid[]) WITH ORDINALITY s(id,ordinality) JOIN catalog.specification_definitions d ON d.id=s.id WHERE NOT EXISTS(SELECT 1 FROM catalog.attribute_group_attributes a WHERE a.group_id=${target.id}::uuid AND a.definition_id=s.id AND a.deleted_at IS NULL)`;
      await db.$executeRaw`UPDATE catalog.specification_groups SET updated_at=clock_timestamp() WHERE id=${target.id}::uuid`;
      // Inverse editors capture the definition version; changes cannot silently rebase their drafts.
      if (changed.length)
        await db.$executeRaw`UPDATE catalog.specification_definitions SET updated_at=clock_timestamp() WHERE id=ANY(${changed}::uuid[])`;
    } else {
      await db.$executeRaw`UPDATE catalog.attribute_group_attributes SET deleted_at=clock_timestamp() WHERE definition_id=${target.id}::uuid AND deleted_at IS NULL AND NOT(group_id=ANY(${ids}::uuid[]))`;
      await db.$executeRaw`INSERT INTO catalog.attribute_group_attributes(group_id,definition_id,sort_order,is_filterable) SELECT s.id,${target.id}::uuid,coalesce((SELECT max(a.sort_order) FROM catalog.attribute_group_attributes a WHERE a.group_id=s.id AND a.deleted_at IS NULL),0)+1024,d.is_filterable FROM unnest(${ids}::uuid[]) s(id) JOIN catalog.specification_definitions d ON d.id=${target.id}::uuid WHERE NOT EXISTS(SELECT 1 FROM catalog.attribute_group_attributes a WHERE a.group_id=s.id AND a.definition_id=${target.id}::uuid AND a.deleted_at IS NULL)`;
      await db.$executeRaw`UPDATE catalog.specification_definitions SET updated_at=clock_timestamp() WHERE id=${target.id}::uuid`;
    }
  }
}
