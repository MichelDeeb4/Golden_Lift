import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digest, planCategoryCatalog, verifyReviewedPlan } from '../scripts/category-catalog-plan.mjs';

function fixture() {
  const source = {
    database: 'disposable_catalog',
    types: [{ id: 'type-a', deprecated_at: null }],
    categories: [{ id: 'leaf', parent_id: null }],
    products: [{ id: 'product-a', category_id: 'leaf', product_type_id: 'type-a' }],
    groups: [{ id: 'dimensions' }],
    placements: [{ id: 'placement-a', product_type_id: 'type-a', group_id: 'dimensions', sort_order: '9007199254740993' }],
    assignments: [{ id: 'assignment-a', product_type_id: 'type-a', definition_id: 'length', type_group_id: null,
      sort_order: '9007199254740994', is_required: false, is_public: false, is_searchable: false, is_filterable: false, is_comparable: false }],
    definitions: [{ id: 'length' }],
    valueParity: { product_specification_values: { total: '1', live: '1', content_hash: 'exact-number-parent-content' },
      product_specification_texts: { total: '2', live: '1', content_hash: 'retained-translations' },
      product_specification_choices: { total: '3', live: '2', content_hash: 'retained-choice-content' } },
  };
  source.inventoryHash = digest(source);
  return source;
}
const resolution = { 'assignment-a': 'dimensions' };
function reviewed(source) { return { ...planCategoryCatalog(source, resolution), reviewed: true }; }

test('ungrouped attributes block migration until an exact reviewed assignment resolution exists', () => {
  const source = fixture(), blocked = planCategoryCatalog(source);
  assert.equal(blocked.reviewed, false);
  assert.deepEqual(blocked.issues, [{ kind: 'UNGROUPED_ATTRIBUTE', assignmentId: 'assignment-a', typeId: 'type-a', definitionId: 'length' }]);
  assert.throws(() => verifyReviewedPlan(source, { ...blocked, reviewed: true }), /ambiguous/);
  assert.deepEqual(verifyReviewedPlan(source, reviewed(source)).issues, []);
});

test('review preserves private policy, exact bigint ordering, all retained typed-value fingerprints and stable relationship identities', () => {
  const source = fixture(), first = reviewed(source), second = reviewed(structuredClone(source));
  assert.deepEqual(first.groupAttributes, second.groupAttributes);
  assert.equal(first.categoryGroups[0].sort_order, '9007199254740993');
  assert.equal(first.groupAttributes[0].sort_order, '9007199254740994');
  assert.equal(first.groupAttributes[0].is_public, false);
  assert.deepEqual(first.valueParity, source.valueParity);
  assert.match(first.groupAttributes[0].id, /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-8[\da-f]{3}-[\da-f]{12}$/);
});

test('unknown assignments and groups not already placed on the source type cannot be guessed', () => {
  const source = fixture();
  assert.ok(planCategoryCatalog(source, { missing: 'dimensions' }).issues.some((row) => row.kind === 'INVALID_RESOLUTION'));
  source.groups.push({ id: 'other-group' });
  assert.ok(planCategoryCatalog(source, { 'assignment-a': 'other-group' }).issues.some((row) => row.kind === 'UNREVIEWED_GROUP_PLACEMENT'));
});

test('shared groups with differing source policies reject instead of weakening disclosure or losing requiredness', () => {
  const source = fixture();
  source.types.push({ id: 'type-b', deprecated_at: null });
  source.placements.push({ id: 'placement-b', product_type_id: 'type-b', group_id: 'dimensions', sort_order: '1024' });
  source.assignments.push({ ...source.assignments[0], id: 'assignment-b', product_type_id: 'type-b', type_group_id: 'placement-b', is_public: true });
  assert.ok(planCategoryCatalog(source, resolution).issues.some((row) => row.kind === 'CONFLICTING_REUSABLE_GROUP'));
});

test('a category containing products of incompatible type schemas blocks with exact category and type identifiers', () => {
  const source = fixture();
  source.types.push({ id: 'type-b', deprecated_at: null });
  source.groups.push({ id: 'other-group' });
  source.placements.push({ id: 'placement-b', product_type_id: 'type-b', group_id: 'other-group', sort_order: '1024' });
  source.products.push({ id: 'product-b', category_id: 'leaf', product_type_id: 'type-b' });
  assert.ok(planCategoryCatalog(source, resolution).issues.some((row) => row.kind === 'CONFLICTING_CATEGORY_SCHEMAS' && row.categoryId === 'leaf'));
});

test('identical source types resolve to one category membership and one group attribute', () => {
  const source = fixture();
  source.types.push({ id: 'type-b', deprecated_at: null });
  source.placements.push({ ...source.placements[0], id: 'placement-b', product_type_id: 'type-b' });
  source.assignments.push({ ...source.assignments[0], id: 'assignment-b', product_type_id: 'type-b', type_group_id: 'placement-b' });
  source.products.push({ id: 'product-b', category_id: 'leaf', product_type_id: 'type-b' });
  const plan = planCategoryCatalog(source, resolution);
  assert.deepEqual(plan.issues, []);
  assert.equal(plan.categoryGroups.length, 1);
  assert.equal(plan.groupAttributes.length, 1);
  assert.deepEqual(plan.sourceCategories[0].typeIds, ['type-a', 'type-b']);
});

test('nonleaf categories, missing classifications and deprecated source types reject conversion', () => {
  const source = fixture();
  source.categories.push({ id: 'child', parent_id: 'leaf' });
  assert.ok(planCategoryCatalog(source, resolution).issues.some((row) => row.kind === 'INVALID_PRODUCT_CLASSIFICATION'));
  source.categories.pop();
  source.types[0].deprecated_at = '2026-10-07T00:00:00Z';
  assert.ok(planCategoryCatalog(source, resolution).issues.some((row) => row.kind === 'DEPRECATED_SOURCE_TYPE'));
});

test('unpopulated type configurations remain explicit migration evidence without invented categories', () => {
  const source = fixture();
  source.types.push({ id: 'unused', deprecated_at: null });
  assert.deepEqual(planCategoryCatalog(source, resolution).unmappedTypeIds, ['unused']);
});

test('unreviewed, stale, cross-database, tampered membership and changed typed content all fail verification', () => {
  const source = fixture(), mapping = reviewed(source);
  for (const changed of [{ ...mapping, reviewed: false }, { ...mapping, database: 'other' }, { ...mapping, inventoryHash: 'stale' }])
    assert.throws(() => verifyReviewedPlan(source, changed), /exact database and current inventory/);
  const tampered = structuredClone(mapping);
  tampered.groupAttributes[0].is_public = true;
  assert.throws(() => verifyReviewedPlan(source, tampered), /groupAttributes/);
  const lost = structuredClone(mapping);
  lost.valueParity.product_specification_choices.live = '0';
  assert.throws(() => verifyReviewedPlan(source, lost), /valueParity/);
});
