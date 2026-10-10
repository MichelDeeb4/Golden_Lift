# Target engineering and acceptance standards

Owner approved revision target-specification-2026-10-10-v1 and ADRs 030–035 on 2026-10-10. Earlier proposal labels below record the specification origin; approval and bounded deadlines are recorded in [the decision register](../specifications/phase-01-owner-decisions.md). This approval does not certify implementation.

Date: 2026-10-10. Phase 01 specification. [ADR 034](../../documentation/decisions/034-persistence-and-schema-fleet.md) and [ADR 035](../../documentation/decisions/035-delivery-recovery-and-capacity.md) are proposed.

## Structure and dependency enforcement

NestJS composition/presentation depends on application ports; infrastructure implements them; domain has no framework/ORM/HTTP dependency. Module public exports are the only cross-module imports. Authorized application orchestration can import published module commands; modules cannot import sibling repositories/entities or create cycles. Shared contracts/kernel remain small and framework-independent. Technical infrastructure cannot become an unrestricted business service locator.

Phase 02 implements an AST-aware dependency checker covering path aliases, reexports, dynamic imports, inline import types, package exports and cycles, with negative probes. The old scripts/check-boundaries.mjs covers legacy services and cannot certify the new target directories. Test modules separately and enforce package manifests/export boundaries in fresh CI. Keep strict TypeScript, no unsafe any, explicit validation and safe error mapping.

Do not create empty contexts or generic base repositories for appearance. No domain branch based on customer name, tenant-specific table name or schema fork. Typed custom fields are validated business data; executable extensions require an approved constrained contract.

## Transport and event conventions

REST /api/v1 uses generated OpenAPI from reviewed DTOs/contracts. Tenant/company path IDs are request hints; admission and ownership checks are mandatory. Mutation contracts include idempotency key and resource version where appropriate. Return consistent safe errors: UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, VALIDATION_FAILED, DEPENDENCY_UNAVAILABLE, ROUTING_STALE; avoid cross-scope existence details. Pagination cursors bind query/tenant/company/permission scope and deterministic order; lists/counts/exports share authorization.

Identifiers are UUID strings; versions/generations and exact Decimal/BigInt values are strings. Money carries currency and approved rounding policy; quantities carry unit/precision. Timestamps are UTC RFC3339 while company/tenant display uses an IANA timezone; fiscal boundaries use explicit company policy. Localization resources support owner-approved languages and RTL; legacy ar/en/ckb is evidence, not a new approved release requirement.

Event v1 target envelope contains messageId, schemaVersion, eventType, occurredAt, tenantId, optional companyId for tenant-shared events, aggregateId/version, correlationId, causationId and minimal validated payload. Company-owned events require companyId. Control-plane global events use a distinct envelope schema, never a missing-tenant fallback in ERP consumers. Routing generation is delivery admission metadata rather than immutable business ownership. Workers re-resolve current assignment. Producers/consumers use explicit compatibility windows; no automatic translation of arbitrary legacy events.

OpenAPI and contract schemas are checked into the release; breaking changes need versioning and consumer acceptance. No legacy adapter solely to preserve replaced APIs. API examples never embed secrets or real customer records.

## Database, migrations and ORM proof

Reviewed SQL controls canonical tenant schema, RLS, grants, composite ownership keys and immutable business constraints. Prisma schema/client is an adapter binding if proof passes; db push, runtime synchronization and schema-owner business credentials are forbidden. Control-plane migrations form a separate stream; the ERP stream is identical for pooled/dedicated databases with a checksum ledger. [Tenancy architecture](tenancy-architecture.md) defines role/context/fleet behavior.

Phase 03 proof must measure real runtime role behavior, backend PID/local context, rollback/reuse, generated and raw operations, migration parity, shutdown, pool caps, route churn and timeouts. Passing unit mocks is insufficient. If Prisma fails, record exact evidence and a reviewed-SQL driver decision before target adoption. The master prompt already authorizes an evidenced alternative; silently abandoning hybrid/RLS is forbidden.

Every migration has preflight, compatibility, ownership/RLS checks, isolated fresh+upgrade tests, interruption recovery and checksum verification. Operational nontransactional DDL has durable checkpoints. No automatic destructive rollback. Disposable fixtures use an explicit allowlisted cluster marker and IDs; tests refuse supplied production/existing-user database endpoints.

## Test layers and evidence

Phase 01's [machine-readable acceptance specification](../specifications/phase-01-acceptance.json) is validated by tests/architecture/phase-01-specification.test.mjs. These tests check traceability, storage modes, realistic fixtures, required fault/negative evidence and approval gates. They do not prove runtime isolation or ERP correctness.

The companion runtime evidence verifier requires independently executed scenario receipts bound to the current release, actual commands, exit codes and artifact hashes. It refuses missing receipts, wrong fixtures, mock-only security evidence, unapproved capacity thresholds and absent required categories. In Phase 01 all target runtime cases remain NOT STARTED; the verifier returns BLOCKED rather than skip-as-pass. Later phases implement scenario-specific tests against PostgreSQL/API/browser/worker fixtures; receipts are reviewed proof, not self-certifying claims.

Foundation fixtures: A and B share pooled tables; C is dedicated; every tenant has at least two companies. Test negative read/write/inference, roles/views/functions, raw/bulk/join/export, missing scope, connection reuse, concurrent requests, jobs/cache/files/search/reports/audit, forged identity, revocation/suspension, migrations, tenant transfer/rollback and isolated restore. Runtime database checks query actual role and catalog metadata. Phase 08 cannot pass on old single-company tests.

ERP tests verify exact precision, balanced immutable journals, reversals, reservations/valuation, document states, idempotency and race protection in both modes. Browser flows use actual APIs and scoped identities. Load/fault/recovery results are compared against owner-approved values, never invented launch constraints.

## CI, observability and recovery

Fresh install uses lockfile/pinned runtime; CI runs format/lint/type/build/unit/architecture plus disposable PostgreSQL integration/security/migration tests and relevant browser/worker suites. Hosted provider/deployment/DR tests are BLOCKED if environment is absent. Release images are nonroot, immutable, scanned and independently deployable for control/ERP/worker profiles. Configuration validation rejects missing secrets, wildcard trust defaults or unrestricted database selection.

Structured logs/traces carry correlation and safe scoped identifiers; readiness reports schema compatibility and dependencies without secrets. Liveness measures process health separately. Telemetry buffers/queues and retries are bounded. Runbooks cover provision/suspend/rotation/fleet migration/transfer/backup/restore/DLQ and break-glass with measured drills.

Phase reports at docs/implementation/phases/phase-XX.md record changed files, exact commands/results, failures, unavailable tests, ADR status, risks and next unpassed gate. Owner sign-off is explicit and dated. Phase 01 approval precedes Phase 02. The Phase 08 hard gate precedes ERP development; source recovery and data backups precede any removal/cutover.
