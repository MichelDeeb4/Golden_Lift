import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uuid, version } from '@business-platform/contracts';
import type {
  AttributeKind,
  EffectiveCategorySchema,
  EffectiveAttributeDto,
} from '@business-platform/contracts';
import {
  applyValueMutations,
  exactQuantity,
  validateValues,
} from '../src/domain/attribute-values.js';
const id = uuid('ee100000-0000-4000-8000-000000000001'),
  option = uuid('ee100000-0000-4000-8000-000000000002');
function schema(kind: AttributeKind, required = false): EffectiveCategorySchema {
  const field: EffectiveAttributeDto = {
    id,
    version: version('1'),
    groupPlacementId: null,
    sortOrder: '1024',
    required,
    public: true,
    searchable: false,
    filterable: false,
    comparable: false,
    definition: {
      id,
      code: 'synthetic',
      version: version('1'),
      translations: [{ locale: 'ar', name: 'Synthetic', description: null }],
      missingTranslationLocales: ['en', 'ckb'],
      kind,
      unit: null,
      minimum: null,
      maximum: null,
      allowMultiple: false,
      public: true,
      filterable: false,
      deprecated: false,
      textMultiline: false,
      textMaxLength: 10,
      options: [
        {
          id: option,
          definitionId: id,
          code: 'synthetic',
          sortOrder: '1024',
          version: version('1'),
          deprecated: false,
          translations: [{ locale: 'ar', name: 'Synthetic', description: null }],
          missingTranslationLocales: ['en', 'ckb'],
        },
      ],
    },
  };
  return {
    categoryId: id,
    categoryVersion: version('1'),
    schemaRevision: version('1'),
    leaf: true,
    groups: [],
    attributes: [field],
  };
}
test('engineering decimal strategy preserves supported precision and rejects nonfinite/rounding inputs', () => {
  assert.equal(exactQuantity('99999999999999.999999'), 99999999999999999999n);
  assert.equal(exactQuantity('-0.000001'), -1n);
  for (const value of [
    'NaN',
    'Infinity',
    '-Infinity',
    '1e3',
    '0.0000001',
    '100000000000000',
    '01',
    '1.',
  ])
    assert.throws(() => exactQuantity(value));
});
test('required typed values distinguish false and zero from missing and explicit removal', () => {
  for (const [kind, value] of [
    ['BOOLEAN', { kind: 'BOOLEAN' as const, boolean: false }],
    ['NUMBER', { kind: 'NUMBER' as const, number: '0' }],
  ] as const) {
    const s = schema(kind, true);
    assert.throws(() => validateValues(s, []));
    assert.doesNotThrow(() => validateValues(s, [{ definitionId: id, value }]));
    assert.throws(() =>
      applyValueMutations(s, [{ definitionId: id, value }], [{ definitionId: id, value: null }]),
    );
    assert.deepEqual(applyValueMutations(s, [{ definitionId: id, value }], []), [
      { definitionId: id, value },
    ]);
  }
});
test('choice strategy rejects wrong ownership, duplicates and excess cardinality', () => {
  const s = schema('CHOICE');
  for (const optionIds of [[], [id], [option, option], [option, id]])
    assert.throws(() =>
      validateValues(s, [{ definitionId: id, value: { kind: 'CHOICE', optionIds } }]),
    );
  assert.doesNotThrow(() =>
    validateValues(s, [{ definitionId: id, value: { kind: 'CHOICE', optionIds: [option] } }]),
  );
});
test('text strategy validates Arabic, duplicate locales, bounds and multiline policy', () => {
  const s = schema('TEXT');
  for (const translations of [
    [{ locale: 'en' as const, text: 'saved' }],
    [{ locale: 'ar' as const, text: '' }],
    [{ locale: 'ar' as const, text: '12345678901' }],
    [{ locale: 'ar' as const, text: 'line\nline' }],
    [
      { locale: 'ar' as const, text: 'a' },
      { locale: 'ar' as const, text: 'b' },
    ],
  ])
    assert.throws(() =>
      validateValues(s, [{ definitionId: id, value: { kind: 'TEXT', translations } }]),
    );
  assert.doesNotThrow(() =>
    validateValues(s, [
      {
        definitionId: id,
        value: { kind: 'TEXT', translations: [{ locale: 'ar', text: 'saved' }] },
      },
    ]),
  );
});
test('deprecated values can remain unchanged while explicit removal prevents reselection', () => {
  const base = schema('CHOICE'),
    s = {
      ...base,
      attributes: base.attributes.map((a) => ({
        ...a,
        definition: {
          ...a.definition,
          options: a.definition.options.map((o) => ({ ...o, deprecated: true })),
        },
      })),
    },
    current = [{ definitionId: id, value: { kind: 'CHOICE' as const, optionIds: [option] } }];
  assert.deepEqual(applyValueMutations(s, current, []), current);
  assert.deepEqual(applyValueMutations(s, current, [{ definitionId: id, value: null }]), []);
  assert.throws(() => applyValueMutations(s, [], current));
});

test('inactive drafts retain non-applicable values while publication rejects them', () => {
  const current = [{ definitionId: id, value: { kind: 'NUMBER' as const, number: '1.000001' } }];
  const empty = { ...schema('NUMBER'), attributes: [] };
  assert.doesNotThrow(() => validateValues(empty, current, false));
  assert.throws(() => validateValues(empty, current));
  assert.deepEqual(applyValueMutations(empty, current, [], false), current);
  assert.throws(() => applyValueMutations(empty, [], current, false));
});

test('one save supports the bounded 500-field category schema and rejects overflow', () => {
  const base = schema('NUMBER');
  const fields = Array.from({ length: 501 }, (_, index) => ({
    ...base.attributes[0]!,
    definition: {
      ...base.attributes[0]!.definition,
      id: uuid('fe100000-0000-4000-8000-' + String(index + 1).padStart(12, '0')),
    },
  }));
  const changes = fields.map((field) => ({
    definitionId: field.definition.id,
    value: { kind: 'NUMBER' as const, number: '1.000001' },
  }));
  assert.equal(
    applyValueMutations({ ...base, attributes: fields.slice(0, 500) }, [], changes.slice(0, 500))
      .length,
    500,
  );
  assert.throws(() => applyValueMutations({ ...base, attributes: fields }, [], changes));
});
