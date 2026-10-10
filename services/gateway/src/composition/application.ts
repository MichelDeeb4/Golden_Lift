import { httpApplication } from '@business-platform/platform';
import type { HttpConfig } from '@business-platform/platform';
import type { BusinessService } from '@business-platform/contracts';
import { HttpCatalogReader } from '../infrastructure/http/catalog-reader.js';
import {
  CatalogController,
  ProductsController,
  CATALOG_READER,
} from '../presentation/http/catalog-controller.js';
import { HttpStaffProxy } from '../infrastructure/http/staff-proxy.js';
import { StaffController, STAFF_PROXY } from '../presentation/http/staff-controller.js';
import { OpenApiController } from '../presentation/http/openapi-controller.js';
export function gatewayApplication(
  config: HttpConfig,
  upstreams: Readonly<Record<BusinessService, string>>,
) {
  return httpApplication(config, {
    controllers: [CatalogController, ProductsController, OpenApiController, StaffController],
    providers: [
      { provide: CATALOG_READER, useValue: new HttpCatalogReader(upstreams.catalog) },
      { provide: STAFF_PROXY, useValue: new HttpStaffProxy(upstreams) },
    ],
    ready: async () => {
      const results = await Promise.all(
        Object.values(upstreams).map(async (origin) => {
          try {
            return (
              await fetch(origin + '/health/ready', {
                signal: AbortSignal.timeout(1500),
                redirect: 'error',
              })
            ).ok;
          } catch {
            return false;
          }
        }),
      );
      return results.every(Boolean);
    },
  });
}
