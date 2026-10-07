import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { EffectiveCategorySchema, Uuid } from '@golden-lift/contracts';
import type { CategorySchemaReader } from '../../application/ports/category-schema.js';
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
}
export class PrismaCategorySchemaRepository implements CategorySchemaReader {
  constructor(private readonly tx: Database) {}
  async schema(categoryId: Uuid): Promise<EffectiveCategorySchema> {
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
    const placements = await tx.$queryRaw<PlacementRow[]>`
          SELECT id::text,group_id::text,sort_order::text,version::text
          FROM catalog.category_attribute_groups WHERE category_id=${categoryId}::uuid AND deleted_at IS NULL
          ORDER BY sort_order,id LIMIT 501`;
    const attributes = await tx.$queryRaw<AttributeRow[]>`
          SELECT a.id::text,a.definition_id::text,a.category_group_id::text,a.sort_order::text,a.version::text,
            a.is_required,a.is_public,a.is_searchable,a.is_filterable,a.is_comparable
          FROM catalog.category_effective_attributes a
          JOIN catalog.category_attribute_groups c ON c.id=a.category_group_id
          WHERE a.category_id=${categoryId}::uuid ORDER BY c.sort_order,c.id,a.sort_order,a.id LIMIT 501`;
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
          sortOrder: row.sort_order,
          version: version(row.version),
          required: row.is_required,
          public: row.is_public,
          searchable: row.is_searchable,
          filterable: row.is_filterable,
          comparable: row.is_comparable,
        };
      }),
    };
  }
}
