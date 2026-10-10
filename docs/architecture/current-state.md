# Current state

Date: 2026-10-10. Baseline commit: 5477808. The tracked tree was clean before this task. Local observations are separate from hosted deployment evidence.

## Repository inventory

The npm lockfile v3 monorepo contains one application, five services and eight shared packages: fourteen workspaces, all version 0.1.0 under @business-platform. Inspected versions: Node 24.21.0, TypeScript 6.0.3, NestJS 12.1.2, Prisma/PrismaPg 7.10.0, local PostgreSQL 18.6, Expo 57.0.26/Router 57.0.24, React 19.2.3, React Native 0.86.3 and Tamagui 2.7.7. TanStack Query, React Hook Form and Zod own server/form/validation state. These are observations, not upgrade recommendations.

- apps/storefront: public category/product/search/filter pages, ar/en/ckb presentation, Admin content workflows, Super Admin accounts and component lab. Real Gateway is the default; demo mode is explicit. Native packaging remains unvalidated.
- services: Identity, Catalog, Media and Inquiries have separate databases; Gateway has none. [Inventory](service-inventory.md) distinguishes implemented behavior from pending workflows.
- packages: contracts, platform, api, catalog-ui, i18n, icons, tokens and ui. Contracts are dependency-free; platform is technical infrastructure.
- database/sql and database/tests: reviewed PostgreSQL definitions/upgrades and integrity/migration fixtures. Prisma describes installed models and generates clients; Prisma migrate is not the migration authority.
- infrastructure/containers: API Dockerfile and Media worker template. No tracked Compose file was found. The configured backend CI was inspected, not executed as hosted CI.
- scripts: build, types, format, boundaries, service tests/smokes, local startup, doctor, database upgrades, Media tools and checked identity rename.

Sources: [manifest](../../package.json), [lockfile](../../package-lock.json), [app manifest](../../apps/storefront/package.json), [CI](../../.github/workflows/backend.yml), [API container](../../infrastructure/containers/Dockerfile), [worker template](../../infrastructure/containers/MediaWorker.Dockerfile).

## Implemented behavior

Identity implements opaque digest-backed sessions, Argon2id, invitations/recovery, live staff verification and non-hierarchical ADMIN/SUPER_ADMIN policies. SUPER_ADMIN manages Admin accounts and does not inherit content permission. Tenant/company memberships are absent.

Catalog owns categories, products, groups/attributes/options/units, translations, typed values, publication, ordered Media, reviewed schema changes and permanent deletion. Classification is leaf Category -> ordered Groups -> unique Attributes. Retired Product Type tables/bindings and technical/elevator evidence remain in persistence; runtime retirement does not authorize deleting them.

Media implements private filesystem/S3 adapters, bounded uploads, scanning, sealed bytes, fenced jobs/workers, image/video/PDF processing, controlled delivery and Catalog-coordinated cleanup. Inquiries has persistence, health and staff access; submission/inbox/notification business workflows are pending. Gateway exposes allowlisted public/staff routes and strips untrusted authority headers. The saved [OpenAPI](../../documentation/api/openapi.json) is 0.9.0; internal coordination/introspection is not publicly routed.

## Live observations

The selected server has 71 physical tables: Identity 5, Catalog 54, Media 7, Inquiries 5. Installed parity covers 714 columns, 76 foreign keys and reviewed constraints/indexes/triggers. Read-only inspection found zero RLS-enabled business/ops tables and zero policies in each database. Runtime roles are non-superuser, NOBYPASSRLS, NOCREATEDB and NOCREATEROLE; these restrictions alone do not implement tenancy.

Doctor passed for five APIs, frontend, four databases, ClamAV and native tools. The selected native-local-http event profile has both signed relay listeners ready. RabbitMQ port 5672 was unreachable. Independent service startup smoke passed; existing normal development processes were preserved rather than starting a conflicting second stack.

The configured origin is https://github.com/MichelDeeb4/business-platform.git. Remote network permissions/reachability were not checked. The physical writable workspace remains C:/Projects/Golden_Lift; moving it requires closing processes/IDE and regenerating absolute local tool paths. No active workspace move is performed.

## Evidence limits

No tenancy/RLS, organizational, accounting, inventory, entitlement or provisioning implementation exists. No scale/residency/production isolation promise follows from local checks. See [Phase 01 report](phase-01-report.md) for current failures and unavailable provider gates. Old reports remain dated evidence.
