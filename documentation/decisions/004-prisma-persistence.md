# 004: Prisma persistence behind service-owned ports

Accepted 2026-10-04. The user explicitly selected Prisma and required durable engineering solutions. This supersedes the persistence/tooling parts of decisions 001 and 003; their historical validation remains dated.

## Decision

Pin Prisma CLI, Client and PostgreSQL adapter to 7.10.0, the stable release verified in the npm registry. Prisma 8 currently has a release-candidate tag. Give Identity, Catalog, Media and Inquiries separate schemas and generated clients; Gateway has none. Domain/application retain their focused repository and unit-of-work ports. Use constructor injection and explicit infrastructure-to-domain mappings rather than a generic base repository or exposing generated models through API contracts.

The committed schemas describe 59 physical tables and 64 database-local foreign keys. Catalog's private WriteGate has @@ignore, so no runtime Prisma delegate is generated. Build generates the four clients, then compiles them into the owning service's artifact. Generated source is excluded from Git and authored-code style checks; business imports of generated infrastructure remain forbidden. See [Prisma client generation](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client).

## Database and transaction ownership

PrismaPg reuses the checked service runtime pool. Composition constructs one Prisma client and injects it into repositories/use cases through adapters. Shutdown disconnects Prisma before closing the external pool. Prisma interactive transactions own acquisition, commit and rollback; every repository/outbox in a use case receives the same transaction client. Catalog uses Serializable; Identity uses ReadCommitted with explicit account/token ordering. Platform shares bounded whole-transaction retry and safe structured error inspection, including P2034 and PostgreSQL errors nested in Prisma adapter metadata. Mail/HTTP/files remain outside retry callbacks. See [Prisma transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).

Reviewed SQL remains the migration authority for constraints, deferred validation, retention triggers, grants, private write gates, generated expressions and partial indexes. Do not run Prisma db push or auto-create migrations against these databases. No runtime schema-owner credentials or automatic synchronization are introduced. This is an intentional database ownership decision: [Prisma documents database features requiring additional SQL](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/unsupported-database-features).

## Compatibility decisions

Use generated model operations for implemented CRUD, version checks, localized category reads and outbox inserts. BigInt and Decimal stay exact in infrastructure and become strings at business/API boundaries. Bytes are Uint8Array. Do not set generated search/email/code columns; database expressions own them.

Prisma Date uses milliseconds. Identity therefore uses narrow parameterized SQL for exact cursor keys/timestamps, row/advisory locks, server-timed session/action-token checks and atomic token consumption. These expressions execute through the owning Prisma transaction/client. They preserve database precision and authorization behavior. No unsafe query methods or string-built user SQL are used. See [Prisma raw-query parameters](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries).

Partial indexes remain SQL-managed, without enabling preview features. Category translation replacement reads the live translation and updates/creates it after the unit of work inserts/touches the root and acquires the private Catalog write gate. Serializable retries preserve concurrency behavior and deleted translations remain retained. Composite product ownership references use singular defining fields with collection inverse relations in Prisma: PostgreSQL still enforces all original keys/deferred rules. No artificial unique constraint is added. Media upload-session inverse relations are collections because historical sessions coexist with the partial OPEN-session uniqueness rule.

ORM query logging is disabled. Public errors and operational logs continue to exclude query parameters, tokens, credentials and PII. Soft deletion filters remain explicit repository behavior; Prisma does not apply them automatically.

## Verification and maintenance

npm run orm:check validates committed Prisma schemas. npm run orm:verify compares every model/column/type/nullability/default/generated expression/primary key/foreign key to the reviewed dictionary, then compares installed columns, constraints, indexes and triggers with runtime credentials. npm run orm:pull writes fresh introspection into ignored .local/prisma-introspection files for review, never overwriting approved bindings. After a reviewed SQL change, update the dictionary and owning Prisma schema, format/generate and rerun parity and behavior checks.

Existing PostgreSQL/API/process regressions plus dedicated bigint/decimal/bytes/JSON, microsecond-cursor, retention and permission tests verify this adoption. Current results are recorded separately in orm-validation.json. Hosted CI, Docker and production deployment/provider verification require their respective environments.

