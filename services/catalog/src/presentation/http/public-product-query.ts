import { ApplicationError, locale, uuid } from '@golden-lift/contracts';
import type { PublicProductFilter, PublicProductQuery } from '@golden-lift/contracts';
import { strictRecord } from './category-query.js';

const invalid = (): never => {
  throw new ApplicationError('VALIDATION_FAILED', 'Invalid public product query.');
};
function bounded(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,3}$/.test(value) || Number(value) > max)
    return invalid();
  return Number(value);
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return invalid();
  return value.trim();
}
function filters(value: unknown): readonly PublicProductFilter[] {
  if (value === undefined) return [];
  if (typeof value !== 'string' || value.length > 4096) return invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return invalid();
  }
  if (!Array.isArray(parsed) || parsed.length > 10) return invalid();
  const seen = new Set<string>();
  return parsed.map((item: unknown): PublicProductFilter => {
    const v = strictRecord(item, [
      'definitionId',
      'kind',
      'minimum',
      'maximum',
      'value',
      'optionId',
    ]);
    const definitionId = uuid(v['definitionId']);
    if (seen.has(definitionId)) return invalid();
    seen.add(definitionId);
    switch (v['kind']) {
      case 'NUMBER': {
        strictRecord(v, ['definitionId', 'kind', 'minimum', 'maximum']);
        const minimum = v['minimum'] === undefined ? undefined : text(v['minimum'], 22);
        const maximum = v['maximum'] === undefined ? undefined : text(v['maximum'], 22);
        if (minimum === undefined && maximum === undefined) return invalid();
        return {
          definitionId,
          kind: 'NUMBER',
          ...(minimum !== undefined ? { minimum } : {}),
          ...(maximum !== undefined ? { maximum } : {}),
        };
      }
      case 'BOOLEAN':
        strictRecord(v, ['definitionId', 'kind', 'value']);
        if (typeof v['value'] !== 'boolean') return invalid();
        return { definitionId, kind: 'BOOLEAN', value: v['value'] };
      case 'TEXT':
        strictRecord(v, ['definitionId', 'kind', 'value']);
        return { definitionId, kind: 'TEXT', value: text(v['value'], 200) };
      case 'CHOICE':
        strictRecord(v, ['definitionId', 'kind', 'optionId']);
        return { definitionId, kind: 'CHOICE', optionId: uuid(v['optionId']) };
      default:
        return invalid();
    }
  });
}
export function publicProductQuery(value: unknown): PublicProductQuery {
  const q = strictRecord(value, [
    'locale',
    'page',
    'pageSize',
    'category',
    'productType',
    'search',
    'sort',
    'filters',
  ]);
  if (q['sort'] !== undefined && !['featured', 'name'].includes(String(q['sort'])))
    return invalid();
  return {
    locale: locale(q['locale']),
    page: bounded(q['page'], 1, 1000),
    pageSize: bounded(q['pageSize'], 12, 100),
    sort: q['sort'] === 'name' ? 'name' : 'featured',
    filters: filters(q['filters']),
    ...(q['category'] !== undefined ? { categoryId: uuid(q['category']) } : {}),
    ...(q['productType'] !== undefined ? { productTypeId: uuid(q['productType']) } : {}),
    ...(q['search'] !== undefined ? { search: text(q['search'], 200) } : {}),
  };
}
