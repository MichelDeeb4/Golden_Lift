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
const sourceMode = process.env.EXPO_PUBLIC_CATALOG_SOURCE ?? 'demo';
if (!['demo', 'api'].includes(sourceMode))
  throw new Error('EXPO_PUBLIC_CATALOG_SOURCE must be demo or api');
const client =
  sourceMode === 'api'
    ? new PublicApiClient(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000')
    : null;
const data: CatalogDataSource = client
  ? new ApiCatalogDataSource(client)
  : new DemoCatalogDataSource();
const media: MediaResolver = client ? new ApiMediaResolver(client) : new DemoMediaResolver();
const Context = createContext<CatalogDataSource>(data);
export function useCatalog() {
  return useContext(Context);
}
export function StorefrontProvider({ children }: { children: ReactNode }) {
  const [query] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30000, gcTime: 300000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <LocaleProvider>
      <TamaguiProvider config={config} defaultTheme="light">
        <GLTokenStyles />
        <QueryClientProvider client={query}>
          <Context.Provider value={data}>
            <MediaProvider resolver={media}>{children}</MediaProvider>
          </Context.Provider>
        </QueryClientProvider>
      </TamaguiProvider>
    </LocaleProvider>
  );
}
