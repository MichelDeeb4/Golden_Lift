import { useQuery } from '@tanstack/react-query';
import { catalogKeys } from '@business-platform/api';
import type { ProductQuery } from '@business-platform/api';
import { useLocale } from '@business-platform/i18n';
import { useCatalog } from '../../providers/storefront';
export function useCategories(parent: string | null = null, cursor?: string, enabled = true) {
  const source = useCatalog(),
    { locale } = useLocale();
  return useQuery({
    enabled,
    queryKey: catalogKeys.categories(source.identity, locale, parent, cursor),
    queryFn: ({ signal }) => source.categories(locale, parent, signal, cursor),
  });
}
export function useCategory(id: string) {
  const source = useCatalog(),
    { locale } = useLocale();
  return useQuery({
    queryKey: catalogKeys.category(source.identity, locale, id),
    queryFn: ({ signal }) => source.category(id, locale, signal),
    enabled: !!id,
  });
}
export function useProducts(query: ProductQuery = {}) {
  const source = useCatalog(),
    { locale } = useLocale();
  return useQuery({
    queryKey: catalogKeys.products(source.identity, locale, query),
    queryFn: ({ signal }) => source.products(locale, query, signal),
    retry: false,
  });
}
export function useProduct(id: string) {
  const source = useCatalog(),
    { locale } = useLocale();
  return useQuery({
    queryKey: catalogKeys.product(source.identity, locale, id),
    queryFn: ({ signal }) => source.product(id, locale, signal),
    enabled: !!id,
    retry: false,
  });
}
