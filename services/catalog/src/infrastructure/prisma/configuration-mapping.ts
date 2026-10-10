import { locales, uuid, version } from '@business-platform/contracts';
import type {
  AttributeDefinitionDto,
  AttributeGroupDto,
  AttributeOptionDto,
  CatalogTranslation,
  Locale,
  UnitDto,
} from '@business-platform/contracts';
import type { Prisma } from './generated/client.js';
export const translationsWhere = { deleted_at: null } as const;
export const optionInclude = {
  specification_option_translations: { where: translationsWhere },
} as const;
export const unitInclude = { unit_translations: { where: translationsWhere } } as const;
export const definitionInclude = {
  specification_translations: { where: translationsWhere },
  units: { include: unitInclude },
  specification_options: {
    where: translationsWhere,
    include: optionInclude,
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.SpecificationDefinitionsInclude;
export const groupInclude = {
  specification_group_translations: { where: translationsWhere },
} as const;
export function missing(items: readonly CatalogTranslation[]): readonly Locale[] {
  return locales.filter((l) => !items.some((t) => t.locale === l));
}
export function names(
  items: readonly { locale: string; name: string; description: string | null }[],
): readonly CatalogTranslation[] {
  return items
    .map((t) => ({
      locale: t.locale as Locale,
      name: t.name,
      description: t.description,
    }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}
export function labels(
  items: readonly { locale: string; label: string }[],
): readonly CatalogTranslation[] {
  return items
    .map((t) => ({ locale: t.locale as Locale, name: t.label, description: null }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}
export function groupDto(
  row: Prisma.SpecificationGroupsGetPayload<{ include: typeof groupInclude }>,
): AttributeGroupDto {
  const translations = names(row.specification_group_translations);
  return {
    id: uuid(row.id),
    code: row.code,
    version: version(row.version.toString()),
    translations,
    missingTranslationLocales: missing(translations),
  };
}
export function unitDto(row: Prisma.UnitsGetPayload<{ include: typeof unitInclude }>): UnitDto {
  const translations = labels(row.unit_translations);
  return {
    code: row.code,
    symbol: row.symbol,
    dimension: row.dimension,
    version: version(row.version.toString()),
    translations,
    missingTranslationLocales: missing(translations),
  };
}
export function optionDto(
  row: Prisma.SpecificationOptionsGetPayload<{ include: typeof optionInclude }>,
): AttributeOptionDto {
  const translations = labels(row.specification_option_translations);
  return {
    id: uuid(row.id),
    definitionId: uuid(row.definition_id),
    code: row.code,
    sortOrder: row.sort_order.toString(),
    version: version(row.version.toString()),
    deprecated: row.deprecated_at !== null,
    translations,
    missingTranslationLocales: missing(translations),
  };
}
export function definitionDto(
  row: Prisma.SpecificationDefinitionsGetPayload<{ include: typeof definitionInclude }>,
): AttributeDefinitionDto {
  const translations = names(
    row.specification_translations.map((t) => ({
      locale: t.locale as Locale,
      name: t.label,
      description: t.help_text,
    })),
  );
  return {
    id: uuid(row.id),
    code: row.code,
    version: version(row.version.toString()),
    kind: row.value_type as AttributeDefinitionDto['kind'],
    unit: row.units ? unitDto(row.units) : null,
    minimum: row.minimum_value?.toString() ?? null,
    maximum: row.maximum_value?.toString() ?? null,
    allowMultiple: row.allow_multiple,
    public: row.is_public,
    filterable: row.is_filterable,
    deprecated: row.deprecated_at !== null,
    textMultiline: row.text_multiline,
    textMaxLength: row.text_max_length,
    translations,
    missingTranslationLocales: missing(translations),
    options: row.specification_options.map(optionDto),
  };
}
