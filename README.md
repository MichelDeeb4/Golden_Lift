# Golden Lift

See [completed work and current project status](documentation/project-progress.md) for the implemented features, architecture, recorded checks and remaining milestones.

The standing instruction to follow engineering best practices and suitable design patterns is saved in [AGENTS.md](AGENTS.md). The [architecture guide](documentation/architecture.md) shows the actual layers, dependency rules and persistence choice.

```text
services/identity/src/     Staff workflows and Clean Architecture layers
services/catalog/src/      Catalog workflows and Clean Architecture layers
services/media/src/        Media layers; processing workflows pending
services/inquiries/src/    Inquiries layers; business workflows pending
services/gateway/src/      Stateless ports/adapters/controllers/composition
packages/contracts/       Dependency-free contracts
packages/platform/        Shared technical adapters
database/                 SQL schemas, migrations and database checks
```

Service guides: [Identity](services/identity/README.md), [Catalog](services/catalog/README.md), [Media](services/media/README.md), [Inquiries](services/inquiries/README.md), [Gateway](services/gateway/README.md).

The PostgreSQL database implementation follows the v1.1 design. Four service databases contain 59 application tables, with separate owners and runtime logins.

The local server listens on `127.0.0.1:55432`. Connection strings are in `.local/database.env`; this directory is excluded from Git.

See [database/README.md](database/README.md) for installation, tests, migrations, backups and backend integration. [database/validation-report.json](database/validation-report.json) records the executed checks.

The development sequence is defined in the [backend implementation plan](documentation/backend-implementation-plan.md), covering microservices, Clean Architecture, APIs, integrations and the first working workflow.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 status
```

The backend foundation (B1/B2), Identity package (B3) and category administration (B4) are implemented locally. The [Identity plan](documentation/identity-implementation-plan.md) records the next-step scope and acceptance gates; the [Identity operations guide](documentation/operations/identity.md) explains setup, Super Admin bootstrap and staff/API flows. The [backend setup guide](documentation/operations/backend-local.md) covers the five services.

Staff login/logout, Admin invitations and lifecycle management, password recovery, live service authorization and complete category administration are available. The [Catalog guide](documentation/operations/catalog.md) covers navigation, branch moves, root/nested ordering and deletion preview/confirmation. Super Admin manages Admin accounts; Admin manages content. Database ownership and Clean Architecture boundaries remain enforced.

[Current Prisma validation](documentation/orm-validation.json) covers the ORM adoption, precision and transaction/security regressions. [Earlier engineering validation](documentation/architecture-validation.json) preserves the preceding refactor evidence. [Identity milestone validation](documentation/identity-validation.json) preserves the earlier 13-unit/28-integration evidence. [Foundation validation](documentation/backend-validation.json) preserves the earlier B1/B2 evidence. [B4 validation](documentation/validation/b4-2026-10-04T09-14-07-069Z.json) records the new local evidence. B5 Media is next; frontend, product and Inquiry workflows remain later milestones.

Persistence uses **Prisma 7.10.0**, with one schema/client per database-owning service. See the [Prisma plan](documentation/orm-implementation-plan.md) and [decision](documentation/decisions/004-prisma-persistence.md). Build generates the clients automatically; npm run orm:check validates schemas and npm run orm:verify checks database parity.

## Dynamic Catalog Core

The separately named Dynamic Catalog Core milestone adds configurable product types, reusable typed attributes/options/units/groups, safe schema evolution/copy, localized editing schemas and a headless product workflow with anonymous private-safe projection. [Operating guide](documentation/operations/dynamic-catalog.md), [decision](documentation/decisions/006-dynamic-catalog-core.md), [final model dictionary](database/docs/model-dictionary-v1.2.md) and [OpenAPI 0.4.0](documentation/api/openapi.json) describe the implementation. Final v1.2 parity is verified on disposable databases; the installed project remains v1.1 until an authorized reviewed cutover. [Dynamic Catalog validation](documentation/validation/dynamic-catalog-2026-10-04T11-27-52-880Z.json) records the final executed local checks. B5 remains Media core; full product/technical interfaces, Inquiry workflows and applications are still planned.
