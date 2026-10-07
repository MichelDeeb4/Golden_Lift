export { validateDynamicValue } from './dynamic-values';
import { z } from 'zod';
import { fieldSchema, attributeValueSchema, formSchema } from '@golden-lift/api';
import { GLCheckbox, GLInput, GLSelect, GLTextarea } from '@golden-lift/ui';
import { useAdminTranslation } from './translations';
export type AttributeField = z.infer<typeof fieldSchema>;
export type AttributeValue = z.infer<typeof attributeValueSchema>;
export function DynamicAttributeFields({
  schema,
  values,
  errors = [],
  onChange,
}: {
  schema: z.infer<typeof formSchema>;
  values: Record<string, AttributeValue>;
  errors?: string[];
  onChange: (id: string, value: AttributeValue | undefined) => void;
}) {
  const t = useAdminTranslation();
  const sections = [
    ...schema.groups.map((group) => ({ id: group.id, label: group.label })),
    { id: null, label: t('dynamic') },
  ];
  return (
    <>
      {sections.map((group) => {
        const fields = schema.fields.filter((field) => field.groupPlacementId === group.id);
        return fields.length ? (
          <fieldset className="gl-attribute-group" key={group.id ?? 'ungrouped'}>
            <legend>{group.label}</legend>
            <div className="gl-admin-grid">
              {fields.map((field) => (
                <div
                  className={
                    field.kind === 'TEXT' && field.control === 'textarea' ? 'gl-field-wide' : ''
                  }
                  key={field.definitionId}
                >
                  <DynamicAttributeField
                    key={field.definitionId}
                    field={field}
                    value={values[field.definitionId]}
                    error={errors.includes(field.definitionId) ? t('error') : undefined}
                    onChange={(value) => onChange(field.definitionId, value)}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null;
      })}
    </>
  );
}
export function DynamicAttributeField({
  field,
  value,
  onChange,
  error,
}: {
  field: AttributeField;
  value: AttributeValue | undefined;
  onChange: (value: AttributeValue | undefined) => void;
  error?: string;
}) {
  const t = useAdminTranslation();
  const label =
    field.label + (field.required ? ' *' : '') + (field.unit ? ' (' + field.unit.symbol + ')' : '');
  switch (field.kind) {
    case 'NUMBER':
      return (
        <GLInput
          label={label}
          inputMode="decimal"
          value={value?.kind === 'NUMBER' ? value.number : ''}
          onChange={(e) =>
            onChange(e.target.value ? { kind: 'NUMBER', number: e.target.value } : undefined)
          }
          help={field.description ?? undefined}
          error={error}
        />
      );
    case 'BOOLEAN':
      return (
        <GLSelect
          label={label}
          error={error}
          value={value?.kind === 'BOOLEAN' ? String(value.boolean) : ''}
          onChange={(selected) =>
            onChange(selected ? { kind: 'BOOLEAN', boolean: selected === 'true' } : undefined)
          }
          options={[
            { value: '', label: t('choose') },
            { value: 'true', label: t('true') },
            { value: 'false', label: t('false') },
          ]}
        />
      );
    case 'TEXT':
      return (
        <>
          {(['ar', 'en', 'ckb'] as const).map((locale) => {
            const props = {
              label: `${label} (${locale})`,
              dir: locale === 'en' ? 'ltr' : 'rtl',
              value:
                value?.kind === 'TEXT'
                  ? (value.translations.find((t) => t.locale === locale)?.text ?? '')
                  : '',
              maxLength: field.textMaxLength,
              error: locale === 'ar' ? error : undefined,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                const texts =
                  value?.kind === 'TEXT'
                    ? value.translations.filter((t) => t.locale !== locale)
                    : [];
                if (e.target.value) texts.push({ locale, text: e.target.value });
                onChange(texts.length ? { kind: 'TEXT', translations: texts } : undefined);
              },
            };
            return field.control === 'textarea' ? (
              <GLTextarea key={locale} {...props} />
            ) : (
              <GLInput key={locale} {...props} />
            );
          })}
        </>
      );
    case 'CHOICE': {
      const selected = value?.kind === 'CHOICE' ? value.optionIds : [];
      return field.allowMultiple ? (
        <fieldset>
          <legend>{label}</legend>
          {field.options.map((option) => (
            <GLCheckbox
              key={option.id}
              label={option.label + (option.deprecated ? ' · ' + t('deprecated') : '')}
              checked={selected.includes(option.id)}
              disabled={option.deprecated && !selected.includes(option.id)}
              onChange={(e) =>
                onChange({
                  kind: 'CHOICE',
                  optionIds: e.target.checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id),
                })
              }
            />
          ))}
        </fieldset>
      ) : (
        <GLSelect
          label={label}
          error={error}
          value={selected[0] ?? ''}
          onChange={(id) => onChange(id ? { kind: 'CHOICE', optionIds: [id] } : undefined)}
          options={[
            { value: '', label: t('choose') },
            ...field.options
              .filter((option) => !option.deprecated || selected.includes(option.id))
              .map((option) => ({
                value: option.id,
                label: option.label + (option.deprecated ? ' · ' + t('deprecated') : ''),
              })),
          ]}
        />
      );
    }
  }
}
