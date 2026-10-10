import { ApplicationError, uuid, version } from '@business-platform/contracts';
import type { EffectiveCategorySchema, Uuid } from '@business-platform/contracts';
import type { CategorySchemaReader } from '../../application/ports/category-schema.js';
import type { RelationshipTarget } from '../../application/ports/catalog-relationships.js';
import type { Database } from './client.js';
import {
  definitionDto,
  definitionInclude,
  groupDto,
  groupInclude,
} from './configuration-mapping.js';

interface PlacementRow {
  id: string;
  group_id: string;
  sort_order: string;
  version: string;
}
interface AttributeRow {
  id: string;
  definition_id: string;
  category_group_id: string;
  sort_order: string;
  version: string;
  is_required: boolean;
  is_public: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_comparable: boolean;
  group_id?: string;
}
export class PrismaCategorySchemaRepository implements CategorySchemaReader {
  constructor(private readonly tx: Database) {}
  async schema(
    categoryId: Uuid,
    replacement?: { target: RelationshipTarget; orderedIds: readonly Uuid[] },
  ): Promise<EffectiveCategorySchema> {
    const tx = this.tx;
    const [stage] = await tx.$queryRaw<
      { ready: boolean }[]
    >`SELECT to_regprocedure('catalog.assert_valid_category_catalog()') IS NOT NULL AS ready`;
    if (!stage?.ready)
      throw new ApplicationError(
        'INVALID_STATE',
        'Category classification migration is not installed.',
      );
    const [category] = await tx.$queryRaw<
      { version: string; schema_revision: string; leaf: boolean }[]
    >`
          SELECT c.version::text,c.schema_revision::text,
            NOT EXISTS(SELECT 1 FROM catalog.categories child WHERE child.parent_id=c.id AND child.deleted_at IS NULL) AS leaf
          FROM catalog.categories c WHERE c.id=${categoryId}::uuid AND c.deleted_at IS NULL`;
    if (!category) throw new ApplicationError('NOT_FOUND', 'Category not found.');
    let placements = await tx.$queryRaw<PlacementRow[]>`
          SELECT id::text,group_id::text,sort_order::text,version::text
          FROM catalog.category_attribute_groups WHERE category_id=${categoryId}::uuid AND deleted_at IS NULL
          ORDER BY sort_order,id LIMIT 501`;
    if (replacement?.target.resource === 'categories' && replacement.target.id === categoryId)
      placements = replacement.orderedIds.map((id, i) => ({
        ...placements.find((p) => p.group_id === id),
        id: placements.find((p) => p.group_id === id)?.id ?? id,
        group_id: id,
        sort_order: String((i + 1) * 1024),
        version: placements.find((p) => p.group_id === id)?.version ?? '1',
      }));
    let members = await tx.$queryRaw<(AttributeRow & { group_id: string })[]>`
      SELECT a.id::text,a.definition_id::text,a.group_id::text,a.sort_order::text,a.version::text,
        a.is_required,a.is_public,a.is_searchable,a.is_filterable,a.is_comparable
      FROM catalog.attribute_group_attributes a WHERE a.group_id=ANY(${placements.map((p) => p.group_id)}::uuid[]) AND a.deleted_at IS NULL ORDER BY a.sort_order,a.id LIMIT 100001`;
    if (members.length > 100000)
      throw new ApplicationError('INVALID_STATE', 'Schema membership review exceeds bounds.');
    if (replacement && replacement.target.resource !== 'categories') {
      const { target, orderedIds } = replacement;
      if (target.resource === 'groups') {
        const existing = members.filter((a) => a.group_id === target.id);
        members = [
          ...members.filter((a) => a.group_id !== target.id),
          ...orderedIds.map((id, i) => ({
            ...existing.find((a) => a.definition_id === id),
            id: existing.find((a) => a.definition_id === id)?.id ?? id,
            definition_id: id,
            group_id: target.id,
            category_group_id: '',
            sort_order: String((i + 1) * 1024),
            version: existing.find((a) => a.definition_id === id)?.version ?? '1',
            is_required: existing.find((a) => a.definition_id === id)?.is_required ?? false,
            is_public: existing.find((a) => a.definition_id === id)?.is_public ?? true,
            is_searchable: existing.find((a) => a.definition_id === id)?.is_searchable ?? false,
            is_filterable: existing.find((a) => a.definition_id === id)?.is_filterable ?? true,
            is_comparable: existing.find((a) => a.definition_id === id)?.is_comparable ?? false,
          })),
        ];
      } else {
        members = members.filter(
          (a) => a.definition_id !== target.id || orderedIds.includes(uuid(a.group_id)),
        );
        for (const g of placements)
          if (
            orderedIds.includes(uuid(g.group_id)) &&
            !members.some((a) => a.group_id === g.group_id && a.definition_id === target.id)
          )
            members.push({
              id: target.id,
              definition_id: target.id,
              group_id: g.group_id,
              category_group_id: '',
              sort_order: String(
                members
                  .filter((a) => a.group_id === g.group_id)
                  .reduce(
                    (max, a) => (BigInt(a.sort_order) > max ? BigInt(a.sort_order) : max),
                    0n,
                  ) + 1024n,
              ),
              version: '1',
              is_required: false,
              is_public: true,
              is_searchable: false,
              is_filterable: true,
              is_comparable: false,
            });
      }
    }
    const attributes: AttributeRow[] = [];
    for (const g of placements)
      for (const a of members
        .filter((a) => a.group_id === g.group_id)
        .sort((a, b) =>
          BigInt(a.sort_order) < BigInt(b.sort_order)
            ? -1
            : BigInt(a.sort_order) > BigInt(b.sort_order)
              ? 1
              : a.id.localeCompare(b.id),
        )) {
        const first = attributes.find((b) => b.definition_id === a.definition_id);
        if (first) {
          first.is_required ||= a.is_required;
          first.is_public &&= a.is_public;
          first.is_searchable &&= a.is_searchable && a.is_public;
          first.is_filterable &&= a.is_filterable && a.is_public;
          first.is_comparable &&= a.is_comparable && a.is_public;
        } else
          attributes.push({
            ...a,
            category_group_id: g.id,
            is_searchable: a.is_searchable && a.is_public,
            is_filterable: a.is_filterable && a.is_public,
            is_comparable: a.is_comparable && a.is_public,
          });
      }
    if (placements.length > 500 || attributes.length > 500)
      throw new ApplicationError(
        'INVALID_STATE',
        'Category exceeds the supported bounded editing schema.',
      );
    const groups = await tx.specificationGroups.findMany({
      where: { id: { in: placements.map((row) => row.group_id) }, deleted_at: null },
      include: groupInclude,
    });
    const definitions = await tx.specificationDefinitions.findMany({
      where: { id: { in: attributes.map((row) => row.definition_id) }, deleted_at: null },
      include: definitionInclude,
    });
    const groupById = new Map(groups.map((row) => [row.id, groupDto(row)]));
    const definitionById = new Map(definitions.map((row) => [row.id, definitionDto(row)]));
    return {
      categoryId,
      categoryVersion: version(category.version),
      schemaRevision: version(category.schema_revision),
      leaf: category.leaf,
      groups: placements.map((row) => {
        const group = groupById.get(row.group_id);
        if (!group)
          throw new ApplicationError('INVALID_STATE', 'Category references an unavailable group.');
        return {
          id: uuid(row.id),
          group,
          sortOrder: row.sort_order,
          version: version(row.version),
        };
      }),
      attributes: attributes.map((row) => {
        const definition = definitionById.get(row.definition_id);
        if (!definition)
          throw new ApplicationError(
            'INVALID_STATE',
            'Category references an unavailable attribute.',
          );
        return {
          id: uuid(row.id),
          definition,
          groupPlacementId: uuid(row.category_group_id),
          groupPlacementIds: placements
            .filter((g) =>
              members.some(
                (a) => a.group_id === g.group_id && a.definition_id === row.definition_id,
              ),
            )
            .map((g) => uuid(g.id)),
          sortOrder: row.sort_order,
          version: version(row.version),
          required: row.is_required,
          public: row.is_public && definition.public,
          searchable: row.is_searchable && definition.public,
          filterable: row.is_filterable && definition.public && definition.filterable,
          comparable: row.is_comparable && definition.public,
        };
      }),
    };
  }
}
