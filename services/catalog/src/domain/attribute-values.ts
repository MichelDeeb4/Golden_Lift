import { ApplicationError } from '@business-platform/contracts';
import type {
  AttributeValue,
  AttributeValueMutation,
  EffectiveCategorySchema,
  ProductAttributeValue,
  EffectiveAttributeDto,
} from '@business-platform/contracts';
export function exactQuantity(value: string): bigint {
  if (!/^-?(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/.test(value))
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Engineering numbers require exact numeric(20,6) decimal strings.',
    );
  const negative = value.startsWith('-'),
    [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return (negative ? -1n : 1n) * BigInt(whole + fraction.padEnd(6, '0'));
}
function invalid(message: string): never {
  throw new ApplicationError('INVALID_STATE', message);
}
const validators: Readonly<
  Record<AttributeValue['kind'], (field: EffectiveAttributeDto, value: AttributeValue) => void>
> = {
  NUMBER(field, value) {
    if (value.kind !== 'NUMBER')
      return invalid('Attribute value type does not match its definition.');
    const n = exactQuantity(value.number),
      d = field.definition;
    if (
      (d.minimum !== null && n < exactQuantity(d.minimum)) ||
      (d.maximum !== null && n > exactQuantity(d.maximum))
    )
      invalid('Attribute number violates its canonical bounds.');
  },
  BOOLEAN(_field, value) {
    if (value.kind !== 'BOOLEAN' || typeof value.boolean !== 'boolean')
      invalid('Expected a boolean value.');
  },
  TEXT(field, value) {
    if (value.kind !== 'TEXT') return invalid('Expected translated text.');
    const seen = new Set<string>();
    for (const item of value.translations) {
      if (
        seen.has(item.locale) ||
        !['ar', 'en', 'ckb'].includes(item.locale) ||
        !item.text.trim() ||
        item.text.length > field.definition.textMaxLength ||
        (!field.definition.textMultiline && /[\r\n]/.test(item.text))
      )
        invalid('Invalid translated attribute text.');
      seen.add(item.locale);
    }
    if (!seen.has('ar')) invalid('Text attributes require a saved Arabic value.');
  },
  CHOICE(field, value) {
    if (value.kind !== 'CHOICE') return invalid('Expected controlled option IDs.');
    if (
      !value.optionIds.length ||
      (!field.definition.allowMultiple && value.optionIds.length !== 1) ||
      new Set(value.optionIds).size !== value.optionIds.length ||
      value.optionIds.some((id) => !field.definition.options.some((o) => o.id === id))
    )
      invalid('Invalid option ownership, duplication or cardinality.');
  },
};
export function validateValues(
  schema: Pick<EffectiveCategorySchema, 'attributes'>,
  values: readonly ProductAttributeValue[],
  requireComplete = true,
): void {
  const seen = new Set<string>();
  for (const item of values) {
    if (seen.has(item.definitionId)) invalid('Duplicate attribute value.');
    seen.add(item.definitionId);
    const field = schema.attributes.find((a) => a.definition.id === item.definitionId);
    if (!field && !requireComplete) continue;
    if (!field) invalid('Attribute is not assigned to this category.');
    if (field.definition.kind !== item.value.kind)
      invalid('Attribute value type does not match its definition.');
    validators[item.value.kind](field, item.value);
  }
  if (requireComplete && schema.attributes.some((a) => a.required && !seen.has(a.definition.id)))
    invalid('Required product attributes are missing.');
}
export function equalAttributeValues(a: AttributeValue | undefined, b: AttributeValue): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'NUMBER' && b.kind === 'NUMBER')
    return exactQuantity(a.number) === exactQuantity(b.number);
  if (a.kind === 'BOOLEAN' && b.kind === 'BOOLEAN') return a.boolean === b.boolean;
  if (a.kind === 'CHOICE' && b.kind === 'CHOICE')
    return (
      a.optionIds.length === b.optionIds.length &&
      a.optionIds.every((id) => b.optionIds.includes(id))
    );
  if (a.kind === 'TEXT' && b.kind === 'TEXT')
    return (
      a.translations.length === b.translations.length &&
      a.translations.every((t) =>
        b.translations.some((x) => x.locale === t.locale && x.text === t.text),
      )
    );
  return false;
}
export function applyValueMutations(
  schema: Pick<EffectiveCategorySchema, 'attributes'>,
  current: readonly ProductAttributeValue[],
  changes: readonly AttributeValueMutation[],
  requireComplete = true,
): readonly ProductAttributeValue[] {
  if (changes.length > 500)
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'At most 500 attribute mutations are accepted.',
    );
  const result = new Map(current.map((v) => [v.definitionId, v])),
    seen = new Set<string>();
  for (const change of changes) {
    const field = schema.attributes.find((a) => a.definition.id === change.definitionId);
    if (
      seen.has(change.definitionId) ||
      (!field && !(change.value === null && result.has(change.definitionId)))
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Unknown or duplicate attribute ID.');
    seen.add(change.definitionId);
    if (change.value === null) result.delete(change.definitionId);
    else {
      if (!field) throw new ApplicationError('VALIDATION_FAILED', 'Unknown attribute ID.');
      const previous = result.get(change.definitionId)?.value;
      if (field.definition.deprecated && !equalAttributeValues(previous, change.value))
        invalid('Deprecated attributes cannot receive new values.');
      if (change.value.kind === 'CHOICE') {
        const oldIds = previous?.kind === 'CHOICE' ? previous.optionIds : [];
        if (
          change.value.optionIds.some(
            (id) =>
              field.definition.options.some((o) => o.id === id && o.deprecated) &&
              !oldIds.includes(id),
          )
        )
          invalid('Deprecated options cannot be newly selected.');
      }
      result.set(change.definitionId, { definitionId: change.definitionId, value: change.value });
    }
  }
  const values = [...result.values()];
  validateValues(schema, values, requireComplete);
  return values;
}
