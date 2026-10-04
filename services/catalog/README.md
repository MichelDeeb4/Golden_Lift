# Catalog service

Category, product, translation and content ownership. Local port: 3002. The service connects only to its own PostgreSQL database/runtime login. Dependencies across services use API/event contracts.

| Layer | Actual example |
| --- | --- |
| Domain | [domain/category.ts](src/domain/category.ts) |
| Application ports | [application/ports/catalog.ts](src/application/ports/catalog.ts) |
| Use cases | [application/use-cases/create-category.ts](src/application/use-cases/create-category.ts) |
| Infrastructure | [infrastructure/prisma/category-repository.ts](src/infrastructure/prisma/category-repository.ts) |
| Presentation | [presentation/http/admin-categories-controller.ts](src/presentation/http/admin-categories-controller.ts) |
| Composition | [composition/application.ts](src/composition/application.ts) |

B4 category administration is implemented: public browsing; protected editor detail/saved translations; paginated deep navigation/breadcrumbs/destinations; branch moves; atomic root/nested sibling ordering; read-only deletion preview and confirmed branch soft deletion. Products, Media delivery and broader content APIs remain later packages. See the [Catalog operating guide](../../documentation/operations/catalog.md) and [concurrency decision](../../documentation/decisions/005-category-administration.md).

Build from the root with npm run build; start with npm start --workspace=@golden-lift/catalog. The entrypoint is src/composition/main.ts. Tests live under tests where applicable; domain/application do not import NestJS, Prisma, pg or other service implementations.

See [standing rules](../../AGENTS.md), [architecture/patterns](../../documentation/architecture.md) and [backend setup](../../documentation/operations/backend-local.md).

Prisma models: [schema.prisma](prisma/schema.prisma). Client factory: [client.ts](src/infrastructure/prisma/client.ts). Build generates the owning client; SQL continues to manage constraints, triggers and grants. See [Prisma decision](../../documentation/decisions/004-prisma-persistence.md).

## Dynamic Catalog Core

Product types, shared attributes/options/units/groups, per-type placements/order, guarded impact/copy workflows and narrow headless product create/edit/read/type-change/placement are implemented. [Domain strategies](src/domain/attribute-values.ts), [schema ports](src/application/ports/product-schema.ts), [safe schema changes](src/application/use-cases/change-catalog-schema.ts), [Prisma dependency reader](src/infrastructure/prisma/schema-change-reader.ts) and [controllers](src/presentation/http/dynamic-configuration-controller.ts) show the actual layers. See the [operating guide](../../documentation/operations/dynamic-catalog.md), [decision](../../documentation/decisions/006-dynamic-catalog-core.md) and [OpenAPI](../../documentation/api/openapi.json). New workflows require explicit Catalog v1.2 cutover. Existing v1.1 readiness/B4 remain compatible; Media delivery and full product/technical editing UX remain planned.
