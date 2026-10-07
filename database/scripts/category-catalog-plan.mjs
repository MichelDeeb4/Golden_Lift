import { createHash } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export const digest = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function relationshipId(kind, first, second) {
  const hash = digest([kind, first, second]).slice(0, 32).split('');
  hash[12] = '5';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
const flags = ['is_required', 'is_public', 'is_searchable', 'is_filterable', 'is_comparable'];
const policy = (assignment) => Object.fromEntries(['definition_id', 'sort_order', ...flags].map((key) => [key, assignment[key]]));
const ordered = (rows) => [...rows].sort((a, b) => {
  const first = BigInt(a.sort_order), second = BigInt(b.sort_order);
  return first < second ? -1 : first > second ? 1 : a.id.localeCompare(b.id);
});

/** Offline migration planning only. No database writes or inferred names/classification. */
export function planCategoryCatalog(inventory, resolutions = {}) {
  const issues = [], types = new Map(inventory.types.map((row) => [row.id, row]));
  const groups = new Map(inventory.groups.map((row) => [row.id, row]));
  const categories = new Map(inventory.categories.map((row) => [row.id, row]));
  const assignments = new Map(inventory.assignments.map((row) => [row.id, row]));
  const placements = new Map(inventory.placements.map((row) => [row.id, row]));
  for (const id of Object.keys(resolutions)) {
    const assignment = assignments.get(id);
    if (!assignment || assignment.type_group_id !== null)
      issues.push({ kind: 'INVALID_RESOLUTION', assignmentId: id });
  }
  const resolved = inventory.assignments.flatMap((assignment) => {
    const groupId = assignment.type_group_id === null
      ? resolutions[assignment.id]
      : placements.get(assignment.type_group_id)?.group_id;
    if (!groupId) {
      issues.push({ kind: 'UNGROUPED_ATTRIBUTE', assignmentId: assignment.id, typeId: assignment.product_type_id, definitionId: assignment.definition_id });
      return [];
    }
    if (!groups.has(groupId) || !inventory.placements.some((row) => row.product_type_id === assignment.product_type_id && row.group_id === groupId)) {
      issues.push({ kind: 'UNREVIEWED_GROUP_PLACEMENT', assignmentId: assignment.id, typeId: assignment.product_type_id, groupId });
      return [];
    }
    return [{ ...assignment, group_id: groupId }];
  });
  const members = [], groupSources = new Map();
  for (const placement of inventory.placements) {
    const source = ordered(resolved.filter((row) => row.product_type_id === placement.product_type_id && row.group_id === placement.group_id));
    const signature = digest(source.map(policy));
    const existing = groupSources.get(placement.group_id);
    if (existing && existing.signature !== signature) {
      issues.push({ kind: 'CONFLICTING_REUSABLE_GROUP', groupId: placement.group_id, typeIds: [existing.typeId, placement.product_type_id], assignmentIds: [...existing.assignmentIds, ...source.map((row) => row.id)] });
    } else if (!existing) {
      groupSources.set(placement.group_id, { signature, typeId: placement.product_type_id, assignmentIds: source.map((row) => row.id) });
      members.push(...source.map((row) => ({ id: relationshipId('group-attribute', placement.group_id, row.definition_id), group_id: placement.group_id, ...policy(row) })));
    }
  }
  const categoryGroups = [], categorySources = new Map();
  for (const product of inventory.products) {
    const category = categories.get(product.category_id), type = types.get(product.product_type_id);
    if (!category || !type || inventory.categories.some((row) => row.parent_id === product.category_id)) {
      issues.push({ kind: 'INVALID_PRODUCT_CLASSIFICATION', productId: product.id, categoryId: product.category_id, typeId: product.product_type_id });
      continue;
    }
    if (type.deprecated_at !== null) {
      issues.push({ kind: 'DEPRECATED_SOURCE_TYPE', typeId: type.id, categoryId: category.id, productId: product.id });
      continue;
    }
    const source = ordered(inventory.placements.filter((row) => row.product_type_id === type.id));
    const normalized = source.map((row) => ({ group_id: row.group_id, sort_order: row.sort_order, members: groupSources.get(row.group_id)?.signature }));
    const signature = digest(normalized), existing = categorySources.get(category.id);
    if (existing && existing.signature !== signature) {
      issues.push({ kind: 'CONFLICTING_CATEGORY_SCHEMAS', categoryId: category.id, typeIds: [...existing.typeIds, type.id], productId: product.id });
    } else if (!existing) {
      categorySources.set(category.id, { signature, typeIds: new Set([type.id]) });
      categoryGroups.push(...source.map((row) => ({ id: relationshipId('category-group', category.id, row.group_id), category_id: category.id, group_id: row.group_id, sort_order: row.sort_order })));
    } else existing.typeIds.add(type.id);
  }
  return {
    formatVersion: 1,
    database: inventory.database,
    inventoryHash: inventory.inventoryHash,
    reviewed: false,
    resolutions,
    issues,
    sourceCategories: [...categorySources].map(([categoryId, source]) => ({ categoryId, typeIds: [...source.typeIds].sort() })),
    unmappedTypeIds: inventory.types.filter((type) => !inventory.products.some((product) => product.product_type_id === type.id)).map((type) => type.id),
    categoryGroups: categoryGroups.sort((a, b) => a.id.localeCompare(b.id)),
    groupAttributes: members.sort((a, b) => a.id.localeCompare(b.id)),
    valueParity: inventory.valueParity,
  };
}

export function verifyReviewedPlan(inventory, mapping) {
  if (mapping.formatVersion !== 1 || mapping.reviewed !== true || mapping.database !== inventory.database || mapping.inventoryHash !== inventory.inventoryHash)
    throw new Error('Mapping must be explicitly reviewed for this exact database and current inventory.');
  const expected = planCategoryCatalog(inventory, mapping.resolutions);
  if (expected.issues.length) throw new Error('Migration mapping is ambiguous: ' + JSON.stringify(expected.issues));
  for (const key of ['sourceCategories', 'categoryGroups', 'groupAttributes', 'unmappedTypeIds', 'valueParity']) {
    if (digest(mapping[key]) !== digest(expected[key])) throw new Error('Reviewed mapping does not match the current source: ' + key);
  }
  return expected;
}
