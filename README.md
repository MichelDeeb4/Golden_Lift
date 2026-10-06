# Golden Lift

See [completed work and current project status](documentation/project-progress.md) for the implemented features, architecture, recorded checks and remaining milestones.

The standing instruction to follow engineering best practices and suitable design patterns is saved in [AGENTS.md](AGENTS.md). The [architecture guide](documentation/architecture.md) shows the actual layers, dependency rules and persistence choice.

```text
services/identity/src/     Staff workflows and Clean Architecture layers
services/catalog/src/      Catalog workflows and Clean Architecture layers
services/media/src/        Private uploads, processing, delivery and retirement
services/inquiries/src/    Inquiries layers; business workflows pending
services/gateway/src/      Stateless ports/adapters/controllers/composition
packages/contracts/       Dependency-free contracts
packages/platform/        Shared technical adapters
apps/storefront/          S1 multilingual public catalog shell and component lab
packages/{tokens,ui,icons,i18n,api,catalog-ui}/  Shared frontend foundation
database/                 SQL schemas, migrations and database checks
```

Service guides: [Identity](services/identity/README.md), [Catalog](services/catalog/README.md), [Media](services/media/README.md), [Inquiries](services/inquiries/README.md), [Gateway](services/gateway/README.md).

S1 adds a responsive public storefront and shared design system. Run `npm.cmd run storefront:dev` and open `http://localhost:8081`; the component showcase is `/component-lab`. See [frontend operations](documentation/operations/frontend-local.md), [design system](documentation/design-system.md) and [frontend baseline](documentation/implementation/s1-frontend-baseline.md). Demo catalog data is visibly labeled; Arabic, English and Kurdish Sorani are supported.

The [S1 completion report](documentation/s1-completed-work.md) and [dated validation evidence](documentation/validation/s1-2026-10-05T15-26-43-536Z.json) record the actual checks, visual review and remaining live-data/production limitations.

The reviewed SQL includes Dynamic Catalog Core and B5 Media upgrades. Current disposable fresh/upgrade checks cover four service databases with 66 tables, 663 columns and 73 foreign keys, with separate owners and runtime logins. No migration was applied to a live project database during B5 work.

The local server listens on `127.0.0.1:55432`. Connection strings are in `.local/database.env`; this directory is excluded from Git.

See [database/README.md](database/README.md) for installation, tests, migrations, backups and backend integration. [database/validation-report.json](database/validation-report.json) records the executed checks.

The development sequence is defined in the [backend implementation plan](documentation/backend-implementation-plan.md), covering microservices, Clean Architecture, APIs, integrations and the first working workflow.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 status
```

The backend foundation (B1/B2), Identity package (B3) and category administration (B4) are implemented locally. The [Identity plan](documentation/identity-implementation-plan.md) records the next-step scope and acceptance gates; the [Identity operations guide](documentation/operations/identity.md) explains setup, Super Admin bootstrap and staff/API flows. The [backend setup guide](documentation/operations/backend-local.md) covers the five services.

Staff login/logout, Admin invitations and lifecycle management, password recovery, live service authorization and complete category administration are available. The [Catalog guide](documentation/operations/catalog.md) covers navigation, branch moves, root/nested ordering and deletion preview/confirmation. Super Admin manages Admin accounts; Admin manages content. Database ownership and Clean Architecture boundaries remain enforced.

[Prisma adoption validation](documentation/orm-validation.json) covers the earlier ORM adoption, precision and transaction/security regressions. [Earlier engineering validation](documentation/architecture-validation.json) preserves the preceding refactor evidence. [Identity milestone validation](documentation/identity-validation.json) preserves the earlier 13-unit/28-integration evidence. [Foundation validation](documentation/backend-validation.json) preserves the earlier B1/B2 evidence. [B4 validation](documentation/validation/b4-2026-10-04T09-14-07-069Z.json) records that milestone's local evidence. Frontend, full content editors and Inquiry workflows remain later milestones.

B5 Media code is now present; [Media operations](documentation/operations/media.md) and [decision 007](documentation/decisions/007-media-core.md) describe protected uploads, immutable storage, fenced workers, Media–Catalog events and controlled delivery/retirement. Real native/scanner/broker/cloud acceptance remains open. Earlier dated reports describe earlier milestones. OpenAPI is now 0.6.0; staff product management is implemented, while technical-sheet editors, Inquiry business workflows and native applications remain deferred.

Persistence uses **Prisma 7.10.0**, with one schema/client per database-owning service. See the [Prisma plan](documentation/orm-implementation-plan.md) and [decision](documentation/decisions/004-prisma-persistence.md). Build generates the clients automatically; npm run orm:check validates schemas and npm run orm:verify checks database parity.

## Dynamic Catalog Core

The separately named Dynamic Catalog Core milestone adds configurable product types, reusable typed attributes/options/units/groups, safe schema evolution/copy, localized editing schemas and a headless product workflow with anonymous private-safe projection. [Operating guide](documentation/operations/dynamic-catalog.md), [decision](documentation/decisions/006-dynamic-catalog-core.md), [v1.2 model dictionary](database/docs/model-dictionary-v1.2.md) and [current OpenAPI](documentation/api/openapi.json) describe the implementation. Final v1.2 parity was verified on disposable databases; this remains historical evidence. [Dynamic Catalog validation](documentation/validation/dynamic-catalog-2026-10-04T11-27-52-880Z.json) records those checks.

The [Admin dashboard](documentation/admin-dashboard.md) provides real staff routes at `/admin/login` and `/super-admin/admins`, category/product/configuration editors, private Media workflows and Admin account management using the shared S1 design system. [Local operations](documentation/operations/admin-local.md) describes the explicitly reviewed Catalog 1.4 upgrade and staff configuration. SQL 21 adds product publication state; SQL 22 supplies current fresh Catalog fixtures. The current manifest contains 66 tables and 664 columns. Existing project databases were not upgraded automatically. The [completion report](documentation/implementation/admin-dashboard-completed-work.md) and [dated validation](documentation/validation/admin-dashboard-2026-10-06T12-39-33-944Z.json) record 149 passing tests with production B5 provider gates still open.
