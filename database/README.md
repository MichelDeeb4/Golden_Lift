# Golden Lift database implementation

Implemented from [the supplied v1.1 design](docs/design-v1.1.md). The local PostgreSQL 18.6 server has all four service databases installed. Fresh installation, migration, integrity, permission and concurrency checks have been executed; see [validation-report.json](validation-report.json).

| Database | Tables including ops | Ownership |
| --- | ---: | --- |
| golden_lift_identity | 5 | Staff accounts, sessions and action tokens |
| golden_lift_catalog | 43 | Categories, products, translations, specifications, company content, technical sheets and the write gate |
| golden_lift_media | 6 | Assets, variants, uploads and processing jobs |
| golden_lift_inquiries | 5 | Inquiries, notification deliveries and settings |
| **Total** | **59** | 50 business/support tables, eight messaging tables and one write gate |

See the [backend implementation plan](../documentation/backend-implementation-plan.md) for the development sequence. The [backend setup guide](../documentation/operations/backend-local.md) describes the implemented foundation and [Identity operating guide](../documentation/operations/identity.md) covers staff authentication and bootstrap.

The v1.1 counts above describe the original installation. Current reviewed Catalog 1.4 adds Dynamic Catalog, B5 registration and Admin product activation: the manifest has 66 tables and 664 columns across four databases. `21_catalog_product_management.sql` is the additive Admin upgrade after Dynamic/B5; `22_catalog_admin_fresh.sql` composes current fresh Catalog fixtures. Inspect with `npm.cmd run db:admin`; applying requires explicit `apply --reviewed`. Runtime roles cannot migrate. See [Admin operations](../documentation/operations/admin-local.md); installed project databases were not automatically upgraded.

## Local setup

Requirements: PostgreSQL 18 binaries and Node.js. The tools use the existing installations at `C:/Program Files/PostgreSQL/18/bin` and `C:/Program Files/nodejs/node.exe`. Set `PG_BIN` to another PostgreSQL binary directory when needed. There are no npm dependencies.

From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 all
```

This initializes a project-local PostgreSQL cluster, starts it, provisions separate owner/runtime roles, installs the four schemas, seeds the six agreed root categories, runs tests, verifies fresh installation and upgrade in disposable databases, and exports the schema dictionary. Existing installations with the same schema checksum are reused. An untracked or changed schema causes setup to stop for a reviewed migration.

The `ExecutionPolicy` option applies to that PowerShell process. It does not change the machine's policy.

The server listens on **127.0.0.1:55432**. Data and configuration are in `.local/postgres`. The existing server on port 5432 is separate. Each service has a non-login owner and its own runtime login. Passwords are generated randomly, host authentication uses SCRAM, and `.local` is ignored by Git.

Connection details:

- `.local/database.env`: `IDENTITY_DATABASE_URL`, `CATALOG_DATABASE_URL`, `MEDIA_DATABASE_URL`, `INQUIRIES_DATABASE_URL` for the backend.
- `.local/database.json`: local administrator and service credentials for these management tools.
- Database client: host `127.0.0.1`, port `55432`, database and runtime credentials from the files above.

Useful commands:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 verify
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 backup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 stop
```

`init` creates/starts the cluster; `setup` installs schemas and permissions; `seed` installs the six roots once; `manifest` exports the installed metadata. Backups use PostgreSQL custom format and are written to `.local/backups`.

Startup/shutdown from Codex's restricted Windows sandbox requires process-control escalation. Running these commands in the user's normal terminal controls the same local cluster. The server can be restarted without recreating its data.

## SQL and deployment

Each service owns a separate UTF-8 PostgreSQL database. Provision owners and runtime credentials through the target environment's secret mechanism. Use the migration owner, `psql -X -v ON_ERROR_STOP=1 --single-transaction`, and the matching service entry file:

| Database | Fresh installation entry |
| --- | --- |
| golden_lift_identity | sql/01_identity.sql |
| golden_lift_catalog | sql/02_catalog.sql |
| golden_lift_media | sql/03_media.sql |
| golden_lift_inquiries | sql/04_inquiries.sql |

Entry scripts include common operations and their integrity routines. `02_catalog.sql` includes v1.1 automatically. Initial SQL is applied once, in one transaction per database. The local installer stores the version and SQL checksum in the database comment, without adding migration tables to the approved 59-table design.

For an existing **v1.0 Catalog**, back up first, apply only `sql/09_technical_sheets.sql` with `--single-transaction`, then run `sql/06_smoke_test.sql` and `sql/10_technical_sheets_test.sql`. The migration includes `09_technical_integrity.sql`. Its upgrade path was tested against the original v1.0 SQL in `tests/fixtures/v1.0`; the resulting schema matches a fresh v1.1 installation.

The inquiry notification cancellation behavior is included in a fresh `04_inquiries.sql`. An existing baseline Inquiry database can apply `12_inquiry_integrity.sql` once with `--single-transaction`.

`07_permissions_template.sql` is an executable permission script, with database-specific `database_name`, `service_schema`, `owner_role`, `runtime_role` and `is_catalog` variables. The local installer runs it for each database. Reapply service grants after later migrations introduce objects. Runtime roles cannot mutate the private Catalog gate, invoke internal validators, delete/truncate tables, assume ownership or disable triggers. Cross-service database connections are denied.

`08_seed_roots.sql` contains the six Arabic/English root categories. The management command prevents accidental repeat seeding, including recreation of retained deleted roots. Company contact details, products and technical dimensions require actual company input.

`11_technical_queries.sql` contains prepared read/filter query examples; it is not a migration. These queries scope notes by intersection, perform Arabic fallback, exclude private source evidence, respect selected configurations and correlate numerical criteria to one configuration/condition.

## Backend integration

- Use each service's runtime connection string. Staff API authorization must enforce the separate Admin and Super Admin capabilities.
- Catalog mutations require explicit `SERIALIZABLE` transactions and bounded whole-transaction retries for SQLSTATE `40001` and `40P01`.
- Check the owning product/category/sheet `version` and advance it for child edits in the same transaction. A zero-row expected-version update is an edit conflict.
- Commit local business changes and outbox events together. Consumers commit inbox deduplication and effects together. External uploads, messages and email run after commit.
- Verify Media readiness before registering Catalog assets. Check `public_asset_usage` for public delivery and `active_asset_usage` for retirement. Public access must also match its owner context.
- Keep raw source observations and clarification details private. Product specifications require explicit company applicability; generic references cannot satisfy product filters.
- Workers claim bounded batches with `FOR UPDATE SKIP LOCKED` and fence completion with the current lease token. Provider notification idempotency and delivery authorization belong in the service/infrastructure integration.
- Soft deletion retains records and files. Use `soft_delete_branch` and `soft_delete_technical_sheet` with expected versions. No restoration or hard-delete migration is provided.

## Executed validation

Seven SQL suites cover Catalog creation/deletion, deep trees and branch moves, typed specifications, technical source fidelity and missingness, min/exact/max rules, PDF privacy, actual prepared queries, Identity credential revocation, Media lifecycle, Inquiry cancellation, and runtime permissions. Fixtures roll back.

Verification independently installs all schemas in four uniquely named disposable databases, compares their schema dumps to the installed databases, runs the suites, and tests four scenarios with separate PostgreSQL connections:

1. Child creation versus product creation, including serialization retry and final-state rejection.
2. Concurrent expected-version edits, with stale retry updating zero rows.
3. Asset retirement versus a new attachment.
4. Two workers claiming one job with `SKIP LOCKED`.

All 12 cross-service connection attempts are rejected. A separate disposable Catalog validates the v1.0 upgrade. Verification cleans up only the uniquely named test databases created by that run. Local start/stop/restart and custom-format backup creation were also exercised.

[Schema manifest](schema-manifest.json) exports actual installed columns, types, defaults, constraints, indexes and triggers. Production workload benchmarks, infrastructure delivery behavior, service authorization endpoints and disaster-recovery restoration require validation during their implementation.

PostgreSQL mechanisms were checked against the official [initdb](https://www.postgresql.org/docs/18/app-initdb.html), [CREATE TRIGGER](https://www.postgresql.org/docs/18/sql-createtrigger.html) and [GRANT](https://www.postgresql.org/docs/18/sql-grant.html) documentation.



Backend persistence now uses service-local Prisma schemas and generated clients. Reviewed SQL remains the migration and integrity authority. See the [Prisma decision](../documentation/decisions/004-prisma-persistence.md) and [current ORM validation](../documentation/orm-validation.json).

## Dynamic Catalog Core

The prepared final v1.2 schema has 66 physical tables / 646 columns / 73 local foreign keys, verified on disposable databases. The installed project databases remain the v1.1 baseline above. Default setup stays v1.1; explicitly use `sql/15_catalog_dynamic.sql` for a final fresh Catalog or the reviewed expansion/backfill/validation/cutover tool for an authorized upgrade. Never use an old setup/manifest run to overwrite final migration evidence.

`node database/scripts/verify-dynamic.mjs` exercises explicit final fresh/upgrade parity, SQL/privacy/lifecycle/grants, concurrency and cross-database isolation in disposable databases. [Model dictionary](docs/model-dictionary-v1.2.md) and [operator guide](../documentation/operations/dynamic-catalog.md) cover the new schema. Existing `02_catalog.sql`, `05_catalog_integrity.sql` and `09_technical_sheets.sql` remain applied-history authority; final switch replaces category value eligibility only. Final query examples in `11_technical_queries.sql` require v1.2; legacy regression fixtures retain their original queries under `tests/fixtures/v1.1`. No real business-data cutover was executed.
