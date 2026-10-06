import type { z } from 'zod';
import type { fieldSchema, attributeValueSchema } from '@golden-lift/api';
type AttributeField = z.infer<typeof fieldSchema>;
type AttributeValue = z.infer<typeof attributeValueSchema>;
function quantity(value: string) {
  if (!/^-?(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/.test(value)) throw new Error('invalid');
  const negative = value.startsWith('-'),
    [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return (negative ? -1n : 1n) * BigInt(whole + fraction.padEnd(6, '0'));
}
export function validateDynamicValue(field: AttributeField, value: AttributeValue | undefined) {
  if (!value) return !field.required;
  if (value.kind !== field.kind) return false;
  try {
    switch (value.kind) {
      case 'NUMBER': {
        const n = quantity(value.number);
        return (
          (field.minimum === null || n >= quantity(field.minimum)) &&
          (field.maximum === null || n <= quantity(field.maximum))
        );
      }
      case 'BOOLEAN':
        return true;
      case 'TEXT':
        return (
          value.translations.some((t) => t.locale === 'ar' && t.text.trim()) &&
          value.translations.every((t) => t.text.length <= field.textMaxLength)
        );
      case 'CHOICE':
        return (
          (!field.required || value.optionIds.length > 0) &&
          (field.allowMultiple || value.optionIds.length <= 1) &&
          value.optionIds.every((id) => field.options.some((option) => option.id === id))
        );
    }
  } catch {
    return false;
  }
}
