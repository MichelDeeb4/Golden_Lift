import type {
  AttributeValue,
  AttributeDefinitionDto,
  PublicAttributeValue,
  CatalogTranslation,
  EffectiveCategorySchema,
  CategoryFormSchema,
  EffectiveAttributeDto,
  SchemaGroupDto,
  FormField,
  Locale,
} from '@business-platform/contracts';
export function translated(items: readonly CatalogTranslation[], language: Locale) {
  const selected = items.find((t) => t.locale === language),
    ar = items.find((t) => t.locale === 'ar');
  return {
    name: selected?.name ?? ar?.name ?? '',
    description: selected?.description || ar?.description || null,
    resolvedLocale: selected?.name ? language : ('ar' as Locale),
  };
}
export function publicAttribute(field: EffectiveAttributeDto): boolean {
  return field.public && field.definition.public;
}
export function publicValue(
  value: AttributeValue,
  definition: AttributeDefinitionDto,
  language: Locale,
): PublicAttributeValue {
  if (value.kind === 'TEXT') {
    const selected =
      value.translations.find((t) => t.locale === language) ??
      value.translations.find((t) => t.locale === 'ar');
    return {
      kind: 'TEXT',
      text: selected?.text ?? '',
      resolvedValueLocale: selected?.locale ?? 'ar',
    };
  }
  if (value.kind === 'CHOICE')
    return {
      kind: 'CHOICE',
      options: value.optionIds.flatMap((id) => {
        const option = definition.options.find((o) => o.id === id);
        if (!option) return [];
        const label = translated(option.translations, language);
        return [{ id, label: label.name, resolvedLabelLocale: label.resolvedLocale }];
      }),
    };
  return value;
}
export function categoryFormSchema(
  schema: EffectiveCategorySchema,
  language: Locale,
): CategoryFormSchema {
  return {
    categoryId: schema.categoryId,
    schemaRevision: schema.schemaRevision,
    ...formContent(schema, language),
  };
}
function formContent(
  schema: {
    readonly groups: readonly SchemaGroupDto[];
    readonly attributes: readonly EffectiveAttributeDto[];
  },
  language: Locale,
) {
  return {
    groups: schema.groups.map((g) => ({
      id: g.id,
      label: translated(g.group.translations, language).name,
      sortOrder: g.sortOrder,
    })),
    fields: schema.attributes.map((field) => {
      const d = field.definition,
        text = translated(d.translations, language);
      const control: FormField['control'] =
        d.kind === 'NUMBER'
          ? 'number'
          : d.kind === 'BOOLEAN'
            ? 'checkbox'
            : d.kind === 'TEXT'
              ? d.textMultiline
                ? 'textarea'
                : 'text'
              : d.allowMultiple
                ? 'multiselect'
                : 'select';
      return {
        assignmentId: field.id,
        definitionId: d.id,
        code: d.code,
        label: text.name,
        description: text.description,
        resolvedLabelLocale: text.resolvedLocale,
        kind: d.kind,
        control,
        required: field.required,
        groupPlacementId: field.groupPlacementId,
        groupPlacementIds:
          field.groupPlacementIds ?? (field.groupPlacementId ? [field.groupPlacementId] : []),
        sortOrder: field.sortOrder,
        unit: d.unit
          ? {
              code: d.unit.code,
              symbol: d.unit.symbol,
              label: translated(d.unit.translations, language).name,
            }
          : null,
        minimum: d.minimum,
        maximum: d.maximum,
        allowMultiple: d.allowMultiple,
        textMaxLength: d.textMaxLength,
        deprecated: d.deprecated,
        options: d.options.map((o) => ({
          id: o.id,
          label: translated(o.translations, language).name,
          deprecated: o.deprecated,
        })),
        savedTranslations: d.translations,
        missingTranslationLocales: d.missingTranslationLocales,
      };
    }),
  };
}
