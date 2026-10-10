import type {
  AttributeDefinitionDto,
  AttributeGroupDto,
  UnitDto,
} from '@business-platform/contracts';
import type { Database } from './client.js';
import { groupDto, groupInclude } from './configuration-mapping.js';
/** Bounded metadata for current page only; no per-row cross-service reads. */
export async function definitionMemberships(db: Database, rows: readonly AttributeDefinitionDto[]) {
  const links = await db.$queryRaw<
    { definition_id: string; group_id: string }[]
  >`SELECT definition_id::text,group_id::text FROM catalog.attribute_group_attributes WHERE definition_id=ANY(${rows.map((r) => r.id)}::uuid[]) AND deleted_at IS NULL ORDER BY group_id`;
  const groups = await db.specificationGroups.findMany({
    where: { id: { in: links.map((l) => l.group_id) }, deleted_at: null },
    include: groupInclude,
  });
  return rows.map((row) => ({
    ...row,
    groups: groups
      .filter((g) => links.some((l) => l.definition_id === row.id && l.group_id === g.id))
      .map(groupDto),
  }));
}
export async function groupCounts(db: Database, rows: readonly AttributeGroupDto[]) {
  const counts = await db.$queryRaw<
    { id: string; attributes: string; categories: string }[]
  >`SELECT g.id::text,(SELECT count(*)::text FROM catalog.attribute_group_attributes a WHERE a.group_id=g.id AND a.deleted_at IS NULL) attributes,(SELECT count(*)::text FROM catalog.category_attribute_groups c WHERE c.group_id=g.id AND c.deleted_at IS NULL) categories FROM catalog.specification_groups g WHERE g.id=ANY(${rows.map((r) => r.id)}::uuid[])`;
  return rows.map((row) => ({
    ...row,
    attributeCount: counts.find((c) => c.id === row.id)?.attributes ?? '0',
    categoryCount: counts.find((c) => c.id === row.id)?.categories ?? '0',
  }));
}

export async function unitCounts(
  db: Database,
  rows: readonly UnitDto[],
): Promise<readonly UnitDto[]> {
  if (!rows.length) return [];
  const counts = await db.$queryRaw<
    { code: string; attributes: string }[]
  >`SELECT unit_code AS code, count(*)::text AS attributes FROM catalog.specification_definitions WHERE unit_code=ANY(${rows.map((row) => row.code)}::text[]) AND deleted_at IS NULL GROUP BY unit_code`;
  const byCode = new Map(counts.map((row) => [row.code, row.attributes]));
  return rows.map((row) => ({ ...row, attributeCount: byCode.get(row.code) ?? '0' }));
}
