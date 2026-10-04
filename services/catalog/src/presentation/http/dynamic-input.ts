import { ApplicationError, locale, uuid, version } from '@golden-lift/contracts';
import type {
  AttributeValue,
  AttributeValueMutation,
  CatalogTranslation,
  Uuid,
} from '@golden-lift/contracts';
import type {
  AssignmentDraft,
  ConfigurationChange,
  ConfigurationTarget,
  DefinitionDraft,
  NamedDraft,
  OptionDraft,
  UnitDraft,
} from '../../application/ports/product-schema.js';
import { strictRecord } from './category-query.js';
export function text(value: unknown, max = 10000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ApplicationError('VALIDATION_FAILED', 'Expected bounded nonempty text.');
  return value.trim();
}
export function nullableText(value: unknown, max = 10000): string | null {
  return value === null ? null : text(value, max);
}
export function bool(value: unknown): boolean {
  if (typeof value !== 'boolean')
    throw new ApplicationError('VALIDATION_FAILED', 'Expected an explicit boolean.');
  return value;
}
export function order(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^-?(?:0|[1-9][0-9]{0,18})$/.test(value) ||
    BigInt(value) < -9223372036854775808n ||
    BigInt(value) > 9223372036854775807n
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Expected an exact bigint order string.');
  return value;
}
export function nullableId(value: unknown): Uuid | null {
  return value === null ? null : uuid(value);
}
export function array(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new ApplicationError('VALIDATION_FAILED', 'Expected a bounded array.');
  return value as readonly unknown[];
}
export function translations(value: unknown): readonly CatalogTranslation[] {
  return array(value, 3).map((v) => {
    const row = strictRecord(v, ['locale', 'name', 'description']);
    if (row['locale'] === undefined)
      throw new ApplicationError('VALIDATION_FAILED', 'Translation locale is required.');
    return {
      locale: locale(row['locale']),
      name: text(row['name'], 300),
      description: row['description'] === undefined ? null : nullableText(row['description']),
    };
  });
}
export function named(value: unknown): NamedDraft {
  const v = strictRecord(value, ['code', 'translations']);
  return { code: text(v['code'], 128), translations: translations(v['translations']) };
}
export function definition(value: unknown): DefinitionDraft {
  const v = strictRecord(value, [
    'code',
    'translations',
    'kind',
    'unitCode',
    'minimum',
    'maximum',
    'allowMultiple',
    'public',
    'filterable',
    'textMultiline',
    'textMaxLength',
  ]);
  if (
    !['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE'].includes(String(v['kind'])) ||
    typeof v['textMaxLength'] !== 'number' ||
    !Number.isInteger(v['textMaxLength'])
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Invalid attribute kind or text length.');
  return {
    code: text(v['code'], 128),
    translations: translations(v['translations']),
    kind: v['kind'] as DefinitionDraft['kind'],
    unitCode: nullableText(v['unitCode'], 128),
    minimum: nullableText(v['minimum'], 30),
    maximum: nullableText(v['maximum'], 30),
    allowMultiple: bool(v['allowMultiple']),
    public: bool(v['public']),
    filterable: bool(v['filterable']),
    textMultiline: bool(v['textMultiline']),
    textMaxLength: v['textMaxLength'],
  };
}
export function canonicalUnit(value: unknown): UnitDraft {
  const v = strictRecord(value, ['code', 'symbol', 'dimension', 'translations']);
  return {
    code: text(v['code'], 128),
    symbol: text(v['symbol'], 64),
    dimension: text(v['dimension'], 128),
    translations: translations(v['translations']),
  };
}
export function option(value: unknown): OptionDraft {
  const v = strictRecord(value, ['code', 'sortOrder', 'translations']);
  return {
    code: text(v['code'], 128),
    sortOrder: order(v['sortOrder']),
    translations: translations(v['translations']),
  };
}
export function assignment(value: unknown): AssignmentDraft {
  const v = strictRecord(value, [
    'definitionId',
    'groupPlacementId',
    'sortOrder',
    'required',
    'public',
    'searchable',
    'filterable',
    'comparable',
  ]);
  return {
    definitionId: uuid(v['definitionId']),
    groupPlacementId: nullableId(v['groupPlacementId']),
    sortOrder: order(v['sortOrder']),
    required: bool(v['required']),
    public: bool(v['public']),
    searchable: bool(v['searchable']),
    filterable: bool(v['filterable']),
    comparable: bool(v['comparable']),
  };
}
export function change(value: unknown): ConfigurationChange {
  const kind = strictRecord(value, [
    'kind',
    'translations',
    'assignmentId',
    'assignment',
    'placementId',
    'groupId',
    'sortOrder',
    'moveAssignmentsTo',
    'collection',
    'orderedIds',
    'sourceTypeId',
    'expectedSourceSchemaRevision',
    'definition',
    'option',
  ])['kind'];
  const row = (keys: readonly string[]) => strictRecord(value, ['kind', ...keys]);
  switch (kind) {
    case 'type.metadata':
    case 'group.metadata':
    case 'unit.metadata':
      return { kind, translations: translations(row(['translations'])['translations']) };
    case 'type.deprecate':
    case 'type.delete':
    case 'definition.deprecate':
    case 'definition.delete':
    case 'option.deprecate':
    case 'option.delete':
    case 'group.delete':
    case 'unit.delete':
      row([]);
      return { kind };
    case 'assignment.put': {
      const r = row(['assignmentId', 'assignment']);
      return {
        kind,
        assignmentId: nullableId(r['assignmentId']),
        assignment: assignment(r['assignment']),
      };
    }
    case 'assignment.remove':
      return { kind, assignmentId: uuid(row(['assignmentId'])['assignmentId']) };
    case 'group.place': {
      const r = row(['placementId', 'groupId', 'sortOrder']);
      return {
        kind,
        placementId: nullableId(r['placementId']),
        groupId: uuid(r['groupId']),
        sortOrder: order(r['sortOrder']),
      };
    }
    case 'group.remove': {
      const r = row(['placementId', 'moveAssignmentsTo']);
      return {
        kind,
        placementId: uuid(r['placementId']),
        moveAssignmentsTo: nullableId(r['moveAssignmentsTo']),
      };
    }
    case 'type.order': {
      const r = row(['collection', 'orderedIds']);
      if (r['collection'] !== 'groups' && r['collection'] !== 'attributes')
        throw new ApplicationError('VALIDATION_FAILED', 'Invalid ordering collection.');
      return {
        kind,
        collection: r['collection'],
        orderedIds: array(r['orderedIds'], 500).map(uuid),
      };
    }
    case 'type.copy': {
      const r = row(['sourceTypeId', 'expectedSourceSchemaRevision']);
      return {
        kind,
        sourceTypeId: uuid(r['sourceTypeId']),
        expectedSourceSchemaRevision: version(r['expectedSourceSchemaRevision']),
      };
    }
    case 'definition.update':
      return { kind, definition: definition(row(['definition'])['definition']) };
    case 'option.update':
      return { kind, option: option(row(['option'])['option']) };
    default:
      throw new ApplicationError('VALIDATION_FAILED', 'Unsupported configuration change.');
  }
}
export function attributeValue(value: unknown): AttributeValue {
  const kind = strictRecord(value, ['kind', 'number', 'boolean', 'translations', 'optionIds'])[
    'kind'
  ];
  switch (kind) {
    case 'NUMBER':
      return { kind, number: text(strictRecord(value, ['kind', 'number'])['number'], 30) };
    case 'BOOLEAN':
      return { kind, boolean: bool(strictRecord(value, ['kind', 'boolean'])['boolean']) };
    case 'TEXT':
      return {
        kind,
        translations: array(strictRecord(value, ['kind', 'translations'])['translations'], 3).map(
          (item) => {
            const r = strictRecord(item, ['locale', 'text']);
            if (r['locale'] === undefined)
              throw new ApplicationError('VALIDATION_FAILED', 'Text locale is required.');
            return { locale: locale(r['locale']), text: text(r['text']) };
          },
        ),
      };
    case 'CHOICE':
      return {
        kind,
        optionIds: array(strictRecord(value, ['kind', 'optionIds'])['optionIds'], 100).map(uuid),
      };
    default:
      throw new ApplicationError('VALIDATION_FAILED', 'Unsupported typed attribute value.');
  }
}
export function values(value: unknown): readonly AttributeValueMutation[] {
  return array(value, 100).map((item) => {
    const r = strictRecord(item, ['definitionId', 'value']);
    return {
      definitionId: uuid(r['definitionId']),
      value: r['value'] === null ? null : attributeValue(r['value']),
    };
  });
}
const resources = {
  'product-types': 'types',
  attributes: 'definitions',
  'attribute-options': 'options',
  'attribute-groups': 'groups',
  units: 'units',
} as const;
export function resource(value: string) {
  const r = resources[value as keyof typeof resources];
  if (!r) throw new ApplicationError('NOT_FOUND', 'Resource not found.');
  return r;
}
export function target(name: string, id: unknown): ConfigurationTarget {
  const r = resource(name);
  return r === 'units' ? { resource: r, id: text(id, 128) } : { resource: r, id: uuid(id) };
}
export function precondition(value: unknown): string {
  if (typeof value !== 'string' || !/^s1-[a-f0-9]{64}$/.test(value))
    throw new ApplicationError('VALIDATION_FAILED', 'Expected a scope-bound impact precondition.');
  return value;
}
