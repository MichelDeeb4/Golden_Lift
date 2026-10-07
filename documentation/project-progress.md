# Golden Lift: Completed Work and Project Status

The 2026-10-07 [Product Create fix](implementation/fix-product-create-disabled.md) removes Product Type, Media and specification prerequisites from initial creation. Leaf category plus Arabic name creates an inactive PostgreSQL draft and opens the category-derived editor through SPA navigation. The normal Catalog cutover was applied after full backup/restore parity and restored-copy rehearsal. Category/group relationship editing and porting historical Type-specific regression suites remain separate work. Current evidence belongs to the dated fix report.


Updated: 2026-10-07. Earlier dated milestone evidence below remains historical.

The [Category tree workspace](implementation/category-tree-completed-work.md) now replaces the flat Admin category table with recursive disclosure, ancestor search, compact ordering/actions, fixed-parent subcategory creation and mobile/RTL navigation. The persistent staff layout retains branch state and query cache across routes. Catalog creation appends siblings transactionally instead of leaving UUID-dependent order-zero ties. This task does not activate the pending category attribute-group model.

The normal local database now contains a [live catalog demonstration](operations/admin-local.md#live-local-catalog-demo): 10 published products, four featured products, seven leaf categories and six scanned/processed images. Identified placeholders were soft-deleted through authenticated APIs; useful roots, staff accounts and retained history remain. Desktop, mobile and Arabic visitor checks passed against the running APIs. [Dated evidence](validation/live-demo-2026-10-07.json) records this task separately from migration and production acceptance.

The [Category catalog and UX phase](implementation/catalog-model-and-ux-fix-completed-work.md) is **in progress**. Its staged migration, deduplicated category schema endpoint and disposable PostgreSQL/HTTP foundation tests are implemented. This historical report predates the Product Create fix and normal category-authority cutover; remaining relationship CRUD is still unfinished. This is not final phase acceptance.

The [Admin CRUD modal phase](implementation/admin-crud-modal-fix-completed-work.md) restores permanent creation actions, adds focused modal CRUD and replaces normal staff document navigation with SPA routing. Its report records the current verification and remaining contract limitations separately from the historical milestone counts below.

Current functional integration connects visitor browsing, PostgreSQL search and schema-derived filters to real services by default. Native local ClamAV/Sharp/FFmpeg/Poppler upload, association and controlled delivery are exercised with signed durable local event relays. See [the functional integration report](implementation/functional-integration-completed-work.md) and [local setup](operations/local-development.md). RabbitMQ, S3, production SMTP and Linux processor isolation still require provider acceptance; historical milestone reports below retain their original scope.

This document summarizes the implemented project in this repository. B4 adds current locally executed category administration evidence in the [timestamped B4 report](validation/b4-2026-10-04T09-14-07-069Z.json). Earlier Prisma validation at 08:37 UTC and other milestone reports remain preserved as historical evidence.

## 1. Current status

The database foundation, staff Identity workflows and Prisma integration are implemented locally. Public browsing, recursive category administration, category-derived configurable attributes, product management, private Media workflows and Super Admin account management are available. The web dashboard has [149 passing tests and dated local evidence](validation/admin-dashboard-2026-10-06T12-39-33-944Z.json); see the [completion report](implementation/admin-dashboard-completed-work.md). Production B5 provider acceptance and the deferred scope remain separate.

| Area                                            | Current state                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL databases                            | Reviewed B5 fresh/upgrade schemas: 66 tables, 663 columns, 73 foreign keys verified on disposable PostgreSQL; no live B5 cutover |
| Backend foundation, B1/B2                       | Five independent services, shared contracts, health checks and HTTP infrastructure implemented                                               |
| Identity, B3                                    | Staff authentication, invitations, password recovery and Admin lifecycle implemented                                                         |
| Catalog                                         | B4 implemented locally: editor navigation, moves, root/nested ordering and preview/confirmed branch deletion                                 |
| Media                                           | Native local scanner/Sharp/video/PDF upload and delivery tested with signed durable HTTP event relays; RabbitMQ/cloud/Linux production gates remain open |
| Inquiries                                       | Database, Prisma models, readiness and authenticated staff access checks implemented; submission/inbox/notification workflows remain planned |
| Prisma adoption                                 | Separate schemas and clients for the four database-owning services implemented                                                               |
| Public website                                  | API-default multilingual browsing, category covers, bounded collections, PostgreSQL search, schema-derived filters and controlled Media; explicit demo fixture and component lab retained |
| Staff dashboard                                | Shared S1-based web Admin/Super Admin routes, real Catalog/Media/configuration/Identity workflows and additive product management APIs implemented; see the dated Admin report |
| Mobile apps                                    | Planned; the staff dashboard is web-only |
| Production deployment                           | Planned; local validation does not establish production readiness                                                                            |

The database includes support for more business operations than the currently exposed APIs. Technical-sheet editors and Inquiry notification business workflows remain planned. B4 exposes category branch deletion, B5 adds Media processing orchestration with external acceptance gates, and Admin now exposes product publication, ordered associations and retained deletion. The current reviewed 1.4 manifest has 66 tables and 664 columns; the B5 counts in the table retain that milestone's historical evidence. No installed project database was migrated during Admin work.

## 2. Technology and service ownership

| Component         | Implemented technology                                           |
| ----------------- | ---------------------------------------------------------------- |
| Runtime           | Node.js 24.21.0, with the project restricted to the Node 24 line |
| Language          | TypeScript 6.0.3 with strict type checking                       |
| Backend framework | NestJS 12.1.2                                                    |
| Database          | PostgreSQL 18.6 in the recorded local validation                 |
| ORM               | Prisma 7.10.0 and the PostgreSQL driver adapter                  |
| PostgreSQL driver | pg 8.23.1                                                        |
| Password hashing  | Argon2id through Node crypto                                     |
| Mail              | SMTP adapter and a private development mailbox                   |
| Workspace         | npm workspaces for services and shared packages                  |

There are **four business databases and five backend processes**. Gateway routes requests and has no business database. Each business service connects only to its own database using its own runtime credentials.

| Process                   | Responsibility                                                         | Default local port |
| ------------------------- | ---------------------------------------------------------------------- | -----------------: |
| Gateway                   | Public HTTP entrypoint and service routing                             |               3000 |
| Identity                  | Staff accounts, credentials, sessions and authorization                |               3001 |
| Catalog                   | Categories, products, translations, specifications and company content |               3002 |
| Media                     | Media assets, uploads, variants and processing ownership               |               3003 |
| Inquiries                 | Inquiries and notification ownership                                   |               3004 |
| Project PostgreSQL server | Hosts the four separate service databases                              |              55432 |

These are configured development addresses, not a claim that the processes are currently running.

## 3. Architecture and saved engineering rules

The standing requirement to use maintainable solutions, established best practices and suitable design patterns is saved in [AGENTS.md](../AGENTS.md). Prisma is the explicitly selected ORM. These instructions apply to future changes in this repository.

The services follow Clean Architecture:

| Layer          | Implemented responsibility                                            |
| -------------- | --------------------------------------------------------------------- |
| Domain         | Business policies, staff role rules and category validation           |
| Application    | Use cases, focused ports, authorization and transaction orchestration |
| Infrastructure | Prisma persistence, HTTP clients, cryptography and mail adapters      |
| Presentation   | Controllers, transport validation and response mapping                |
| Composition    | Dependency construction, configuration, startup and shutdown          |

Domain and application code remain independent of NestJS, Prisma, PostgreSQL drivers, SMTP and environment/filesystem access. Cross-service dependencies use contracts and APIs rather than another service's implementation or database.

```text
Golden_Lift/
  AGENTS.md
  services/
    identity/
    catalog/
    media/
    inquiries/
    gateway/
  packages/
    contracts/
    platform/
  database/
    sql/
    tests/
    scripts/
    schema-manifest.json
  documentation/
    decisions/
    operations/
    api/openapi.json
  infrastructure/containers/
  scripts/
```

A database-owning service has its own `prisma/schema.prisma` and `prisma.config.ts`. Its authored code lives under `src/domain`, `src/application`, `src/infrastructure`, `src/presentation` and `src/composition`. Prisma clients are generated into the owning service's infrastructure. Gateway uses application/infrastructure/presentation/composition without an artificial business domain or database.

Implemented patterns include:

- **Repository:** application ports isolate use cases from persistence models and queries.
- **Unit of Work:** Identity and Catalog mutations use Prisma interactive transactions.
- **Constructor injection:** composition supplies dependencies through focused interfaces.
- **Adapters:** HTTP, persistence, cryptography and email implementations stay in infrastructure.
- **Transactional outbox:** applicable Identity and Catalog event records commit with business changes.
- **Interface segregation:** read workflows receive narrow reader ports.
- **Bounded retry:** serialization/deadlock failures retry complete local transactions; external mail/HTTP/file effects remain outside retries.

Architecture checks reject reversed layers, cross-service implementation imports, ORM/framework imports in business layers, circular imports and shared-package boundary violations. See the [architecture guide](architecture.md).

## 4. Database work completed

| Database              | Tables, including local ops tables |
| --------------------- | ---------------------------------: |
| golden_lift_identity  |                                  5 |
| golden_lift_catalog   |                                 43 |
| golden_lift_media     |                                  6 |
| golden_lift_inquiries |                                  5 |
| **Total**             |                             **59** |

The total comprises 50 business/support tables, eight messaging tables and one private Catalog write gate. The recorded schema contains **577 columns and 64 database-local foreign keys**.

The implemented database supports:

- Staff accounts, hashed session/action tokens and credential revocation.
- Category trees, localized text, products, retained product codes and media associations.
- Typed specifications, choices, units, filtering rules and company content/settings.
- Technical sheets, sections, configurations, conditions, measurements, notes and private source observations.
- Media assets, upload sessions, variants and processing jobs.
- Inquiries, idempotency, notification settings/deliveries and cancellation rules.
- Per-service inbox deduplication and outbox event storage.

Implemented protections include owner/runtime separation, denied cross-database access, expected-version checks, generated values, retained soft-deleted records, physical deletion/truncation restrictions, lifecycle triggers and deferred Catalog integrity checks. Six agreed root categories have a seed script with Arabic and English names.

Database management tools support local initialization/start/stop/status, installation, seeding, tests, schema export and custom-format backups. Fresh installations were compared with the installed schemas, and the additive v1.0-to-v1.1 Catalog upgrade was verified. Backup restoration and disaster recovery remain deployment validation work.

See [database documentation](../database/README.md), the [schema dictionary](../database/schema-manifest.json) and [database validation](../database/validation-report.json).

## 5. Prisma integration completed

Each database-owning service has a separate schema and generated client:

- [Identity schema](../services/identity/prisma/schema.prisma).
- [Catalog schema](../services/catalog/prisma/schema.prisma).
- [Media schema](../services/media/prisma/schema.prisma).
- [Inquiries schema](../services/inquiries/prisma/schema.prisma).

All 59 physical tables are represented. The private Catalog write gate is ignored by Prisma, leaving **58 client-accessible models** and preserving runtime access restrictions.

Identity/Catalog repositories and outbox writes use generated Prisma model operations. Composition creates the clients using each service's checked PostgreSQL pool. Repository and outbox operations inside a unit of work receive the same transaction client. Catalog uses Serializable isolation; Identity uses ReadCommitted with explicit locking. Shared retry/error handling recognizes Prisma and nested PostgreSQL failures. Shutdown disconnects Prisma and closes the pool.

BigInt/Decimal values remain exact in infrastructure and become strings at business/API boundaries. Binary hashes use bytes. Identity uses narrow parameterized Prisma SQL for exact timestamp cursors, locks and server-timed atomic token rules.

Reviewed SQL remains the authority for migrations, grants, triggers, deferred constraints, generated expressions and partial indexes. ORM integration preserves these mechanisms. Schema checks compare the Prisma bindings and installed database catalogs with the reviewed dictionary. Introspection writes review files into ignored local storage instead of overwriting approved schemas automatically.

See the [Prisma decision](decisions/004-prisma-persistence.md) and [implementation plan](orm-implementation-plan.md).

## 6. Staff and Identity workflows completed

Identity implements:

- Operator-only initial Super Admin bootstrap, protected against repeat/concurrent creation.
- Staff login, current-session retrieval and logout.
- Argon2id passwords and random opaque session tokens stored as hashes.
- Single-use Admin invitations and password setup.
- Password-reset requests, token consumption and authenticated password changes.
- Super Admin listing/detail/invitation/edit/enable/disable/soft deletion of Admin accounts.
- Expected-version checks and invitation resending that invalidates earlier links.
- Live session verification for Catalog, Media and Inquiries with separate caller credentials.
- Origin/CSRF checks, HttpOnly session cookies, rate limits and safe errors/logs.
- Account-change triggers that revoke affected credentials, plus minimal transactional events.
- SMTP delivery and an ignored private development mailbox.

Role permissions are separate: **Super Admin manages Admin accounts; Admin manages content and inquiries.** Both roles can manage their own password/session. Ordinary API routes cannot create additional Super Admin accounts or change an Admin into Super Admin.

Email delivery runs after the database transaction. The current delivery coordinator is bounded in memory; durable broker-backed delivery remains later work. Action links and credentials are excluded from ordinary logs and API responses.

See the [Identity operating guide](operations/identity.md) for bootstrap, invitations, recovery and configuration.

## 7. Catalog, Gateway and HTTP APIs completed

Catalog provides public reads plus Admin editor detail with actual saved translations/counts, bounded deep child/breadcrumb/destination navigation, complete branch moves, atomic root/nested sibling ordering, and read-only deletion preview with explicit confirmed soft deletion. Scope-bound list/path/branch preconditions protect concurrency without exposing the private gate. All writes/outbox share a Serializable Prisma transaction. Verified asset covers are optional; shared sheets, registrations/files, source evidence and code reservations remain retained. See the [Catalog operating guide](operations/catalog.md).

Gateway routes the implemented public/staff APIs, propagates approved request context, limits input, rejects untrusted role headers and exposes the OpenAPI document. Internal Identity introspection is not routed through Gateway. Health/readiness checks report service/dependency availability. Anonymous Catalog reads continue to work during an Identity outage; protected actions fail safely.

| Capability                   | Implemented routes                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Health                       | GET /health/live; GET /health/ready                                                                                     |
| Public categories            | GET /api/v1/categories; GET /api/v1/categories/{id}                                                                     |
| Staff sessions               | POST /api/v1/auth/login; GET /api/v1/auth/session; POST /api/v1/auth/logout                                             |
| Invitation acceptance        | POST /api/v1/auth/invitations/accept                                                                                    |
| Password recovery/change     | POST /api/v1/auth/password/reset-request; POST /api/v1/auth/password/reset; POST /api/v1/auth/password/change           |
| Admin directory/invitations  | GET and POST /api/v1/staff/admins                                                                                       |
| Admin detail/edit/delete     | GET, PATCH and DELETE /api/v1/staff/admins/{id}                                                                         |
| Admin lifecycle/resend       | POST /api/v1/staff/admins/{id}/enable, /disable and /invitation                                                         |
| Protected category changes   | POST /api/v1/admin/categories; PATCH /api/v1/admin/categories/{id}; POST /{id}/move; POST /reorder; DELETE /{id}        |
| Admin category navigation    | GET /api/v1/admin/categories; GET /{id}; GET /{id}/breadcrumbs; GET /{id}/move-destinations; GET /{id}/deletion-preview |
| Media staff-access check     | GET /api/v1/admin/media/session                                                                                         |
| Inquiries staff-access check | GET /api/v1/admin/inquiries/session                                                                                     |

The complete current contract, version 0.3.0, is stored in [OpenAPI](api/openapi.json) and served at GET /api/v1/openapi.json. The Media/Inquiries session routes verify access; they do not implement their remaining business workflows.

## 8. Development and delivery tooling completed

The repository includes locked workspace dependencies, per-service builds, strict type checking, formatting, architecture enforcement and unit/integration/process runners. Build generates all four Prisma clients before compiling their owning services.

Local tools manage authentication secrets, service configuration, five-process development startup, Super Admin bootstrap and database maintenance. Real credentials and local mail stay in ignored `.local` storage.

A GitHub Actions workflow is configured for backend/database checks, and a Docker build recipe creates service-specific runtime artifacts. Hosted CI and Docker execution have not been verified in the local environment.

Useful commands, run from the repository root:

```powershell
npm.cmd run build
npm.cmd run check
npm.cmd run test:integration
npm.cmd run smoke
npm.cmd run smoke:identity
npm.cmd run orm:check
npm.cmd run orm:verify
npm.cmd run dev
```

`orm:generate` generates clients, `orm:format` formats schemas and `orm:pull` saves introspection for review. See the [local setup guide](operations/backend-local.md) for installation, environment configuration and process startup.

## 9. Recorded verification

Historical B4 verification passed: **24 unit tests across 6 files; 58 PostgreSQL/API integration tests across 5 files (24 B4 tests); 84 source files and 11 architecture probes; both five-process smoke suites; four Prisma schemas and complete runtime parity; seven SQL suites, four concurrency scenarios and 12 denied cross-database connections**. Disposable database cleanup found zero remaining test databases. See the [timestamped B4 report](validation/b4-2026-10-04T09-14-07-069Z.json) for exact commands, source hashes and limitations.

The preserved [Prisma validation report](orm-validation.json), dated 2026-10-04 at 08:37 UTC, records the earlier ORM adoption results:

| Check                                   | Recorded result                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Build, strict types and formatting      | Passed                                                                                                |
| Architecture                            | Passed for 70 authored source files and 11 enforcement probes                                         |
| Prisma schema validation/catalog parity | Passed across four services, 59 models, 577 columns and 64 foreign keys                               |
| Unit tests                              | 20 passed across five files                                                                           |
| PostgreSQL/API integration tests        | 34 passed across four files                                                                           |
| Process checks                          | Two passed suites, each exercising five independent services                                          |
| SQL verification                        | Seven suites, four fresh databases and the v1.0 upgrade passed                                        |
| Database concurrency                    | Four scenarios passed                                                                                 |
| Cross-service database isolation        | All 12 connection attempts denied                                                                     |
| Read-only introspection                 | Approved Prisma bindings remained unchanged                                                           |
| Fixture cleanup                         | Zero disposable databases and zero staff accounts in the real Identity database at the recorded audit |

Coverage includes transaction/outbox atomicity, rollback, deferred validation, optimistic conflicts, real serialization retries, authorization/revocation, token-consumption races, mail adapters, exact numeric/binary mappings, microsecond cursors, retained partial uniqueness and runtime permissions.

Earlier [foundation](backend-validation.json), [Identity](identity-validation.json) and [engineering](architecture-validation.json) reports retain their historical results. Their smaller test counts describe earlier milestones. The counts above describe the earlier Prisma milestone. The [new B4 report](validation/b4-2026-10-04T09-14-07-069Z.json) records current commands, results and source hashes, including the larger category suite and expanded five-process workflow.

## Dynamic Catalog Core

Implemented separately after B4, before full product management. Product types control ordinary attributes; categories control leaf placement. Types/groups/definitions/options/units, actual translations, restrictive privacy, effective revisions, impact previews/confirmed changes, deprecation/soft deletion, explicit copy, headless product create/edit/read/type change/placement and anonymous projection are implemented. B3/B4 behavior and retained technical evidence remain.

Reviewed SQL 13/14/15, explicit inventory/mapping/backfill/validation/switch tooling, final manifest and owning Prisma bindings are verified on disposable databases. Installed project data remains v1.1 and was inventoried read-only. [Decision 006](decisions/006-dynamic-catalog-core.md), [operating guide](operations/dynamic-catalog.md), [dictionary](../database/docs/model-dictionary-v1.2.md) and [OpenAPI 0.4.0](api/openapi.json) explain capabilities and limits. [Timestamped Dynamic Catalog evidence](validation/dynamic-catalog-2026-10-04T11-27-52-880Z.json) records 29 unit tests, 82 integration tests, 108 authored source files/11 architecture probes, both five-process smokes, final 66-table/646-column/73-FK Prisma parity, and explicit v1.1/v1.2 SQL verification. Prior evidence remains historical.

## 10. Remaining implementation

**S1 shared design system and public storefront shell are implemented (2026-10-05).** Six shared frontend packages support the Expo Router/React Native Web/Tamagui application, Arabic/English/Sorani, responsive catalog pages and component lab. The default preview uses visibly labeled isolated fixtures; adapters exist for current category/product-detail/media authorization contracts. Local verification passed 36 backend unit tests, five frontend unit tests, five Edge browser tests including four visual comparisons, 174 source-file ownership checks, 14 architecture probes, strict types and web export. No live backend/database/process integration or production readiness is claimed for S1. See [completed work](s1-completed-work.md), [validation evidence](validation/s1-2026-10-05T15-26-43-536Z.json), [design system](design-system.md) and [frontend operations](operations/frontend-local.md). S2 product backend, S3 full Admin and S4 remaining live product integration are deferred.

**B4 category administration is implemented and locally verified.** Its operating limits are explicit: pages contain up to 100 children/path rows; complete sibling reorder and exhausted-gap recovery support at most 500 affected siblings. There is no fixed hierarchy depth or maximum root count. Media URL/delivery revocation is not implemented by Catalog soft deletion.

**B5 Media core code is now present (2026-10-05); operational acceptance is incomplete.** Upload/library APIs, bounded resumable transfers, immutable sealing, private filesystem/S3 adapters, fenced PostgreSQL jobs, native processing/scanner adapters, B5-only RabbitMQ relays, Catalog coordination, controlled delivery, blocking and retained retirement are implemented. Local evidence includes real Sharp processing and disposable PostgreSQL/API regressions. Actual image/video/PDF scanning/event acceptance, broker/worker restarts, S3/CDN capability tests, browser/native playback and coordinated recovery remain unverified where dependencies are unavailable. This is not a production-readiness claim. See [Media operations](operations/media.md) and [decision 007](decisions/007-media-core.md).

Subsequent work includes:

- B5 real ClamAV/FFmpeg/Poppler/RabbitMQ/S3 acceptance, deployment isolation, retention recovery and load/abuse verification.
- Technical-sheet editors and broader content APIs beyond the implemented Admin product/media workflows.
- Company-content/settings administration beyond the existing database support.
- Anonymous Inquiry submission, trusted product snapshots, staff inbox/status management and notification workflows.
- Broader supported event consumers outside the implemented B5-only Media/Catalog paths.
- Public storefront live-data collection/search integration and production hosting, plus Android/iOS applications.
- Production hosting, HTTPS/reverse-proxy configuration, real mail/storage providers, load/abuse controls and backup restoration exercises.

The [backend implementation plan](backend-implementation-plan.md) records the wider milestone sequence. This status report describes what is implemented today and identifies the remaining work separately.
