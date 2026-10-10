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

Category administration includes public browsing, protected metadata editing, recursive navigation, branch moves, atomic sibling ordering and reviewed retained branch deletion. Products use leaf-category schemas and real Media contracts. See the [Catalog operating guide](../../documentation/operations/catalog.md) and [concurrency decision](../../documentation/decisions/005-category-administration.md).

Build from the root with npm run build; start with npm start --workspace=@golden-lift/catalog. The entrypoint is src/composition/main.ts. Tests live under tests where applicable; domain/application do not import NestJS, Prisma, pg or other service implementations.

See [standing rules](../../AGENTS.md), [architecture/patterns](../../documentation/architecture.md) and [backend setup](../../documentation/operations/backend-local.md).

Prisma models: [schema.prisma](prisma/schema.prisma). Client factory: [client.ts](src/infrastructure/prisma/client.ts). Build generates the owning client; SQL continues to manage constraints, triggers and grants. See [Prisma decision](../../documentation/decisions/004-prisma-persistence.md).

## Current category-driven Catalog

Products belong to one live leaf Category. Category/Group and Group/Attribute relationships are reusable many-to-many joins. Initial relationships are created atomically; subsequent edits and product category moves require captured impact review. Category schemas render unique typed fields and preserve normalized product values. Runtime Product Type models, routes and persistence bindings are removed after reviewed migration parity.

[Domain values](src/domain/attribute-values.ts), [schema ports](src/application/ports/product-schema.ts), [relationship commands](src/application/use-cases/manage-catalog-relationships.ts), [Prisma relationship adapter](src/infrastructure/prisma/catalog-relationships.ts) and [controllers](src/presentation/http/catalog-relationships-controller.ts) show the actual layers. See the [model](../../documentation/architecture/catalog-classification-model.md), [decision 020](../../documentation/decisions/020-final-category-relationships.md), [migration procedure](../../documentation/operations/product-type-migration.md) and [OpenAPI](../../documentation/api/openapi.json). Existing databases require the reviewed staged migration; fresh disposable installations use SQL 25. Historical Dynamic Catalog reports describe earlier authority and remain dated evidence.
