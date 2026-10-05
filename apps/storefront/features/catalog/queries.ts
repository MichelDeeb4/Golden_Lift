import { useQuery } from '@tanstack/react-query';
import { catalogKeys } from '@golden-lift/api';
import type { ProductQuery } from '@golden-lift/api';
import { useLocale } from '@golden-lift/i18n';
import { useCatalog } from '../../providers/storefront';
export function useCategories(parent: string | null = null, cursor?: string) {
  const source = useCatalog(),
    { locale } = useLocale();
  return useQuery({
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
