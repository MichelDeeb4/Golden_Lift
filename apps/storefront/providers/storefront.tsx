import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TamaguiProvider } from 'tamagui';
import { config, GLTokenStyles } from '@golden-lift/ui';
import { LocaleProvider } from '@golden-lift/i18n';
import { ApiCatalogDataSource, ApiMediaResolver, PublicApiClient } from '@golden-lift/api';
import type { CatalogDataSource, MediaResolver } from '@golden-lift/api';
import { MediaProvider } from '@golden-lift/catalog-ui';
import { DemoCatalogDataSource, DemoMediaResolver } from '../features/catalog/demo';
import { frontendConfiguration } from '../configuration';
const sourceMode = frontendConfiguration.dataMode;
const client = sourceMode === 'api' ? new PublicApiClient(frontendConfiguration.apiOrigin) : null;
const data: CatalogDataSource = client
  ? new ApiCatalogDataSource(client)
  : new DemoCatalogDataSource();
const media: MediaResolver = client ? new ApiMediaResolver(client) : new DemoMediaResolver();
const Context = createContext<CatalogDataSource>(data);
const InvalidationContext = createContext<(() => Promise<void>) | null>(null);
export function usePublicCatalogInvalidation() {
  return useContext(InvalidationContext);
}
export function useCatalog() {
  return useContext(Context);
}
export function StorefrontProvider({ children }: { children: ReactNode }) {
  const [query] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30000, gcTime: 300000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );
  return (
    <LocaleProvider>
      <TamaguiProvider config={config} defaultTheme="light">
        <GLTokenStyles />
        <QueryClientProvider client={query}>
          <Context.Provider value={data}>
            <InvalidationContext.Provider
              value={() => query.invalidateQueries({ queryKey: ['catalog'] })}
            >
              <MediaProvider resolver={media}>{children}</MediaProvider>
            </InvalidationContext.Provider>
          </Context.Provider>
        </QueryClientProvider>
      </TamaguiProvider>
    </LocaleProvider>
  );
}
