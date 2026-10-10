# Hybrid tenancy architecture

Owner approved revision target-specification-2026-10-10-v1 and ADRs 030–035 on 2026-10-10. Earlier proposal labels below record the specification origin; approval and bounded deadlines are recorded in [the decision register](../specifications/phase-01-owner-decisions.md). This approval does not certify implementation.

Date: 2026-10-10. Phase 01 design; unimplemented. Fixed direction: pooled and dedicated support are mandatory in the foundation. [ADR 031](../../documentation/decisions/031-hybrid-isolation-routing.md) and [ADR 034](../../documentation/decisions/034-persistence-and-schema-fleet.md) propose the mechanics.

## Ownership and admission

Tenant is a SaaS isolation/lifecycle/subscription boundary; legal company is a financial and stock ownership boundary within a tenant. Global identity may have several tenant memberships and company grants. Authenticate the principal, verify current membership and tenant lifecycle, resolve the requested company and permission, then obtain the authoritative storage assignment. Host/path/header tenant hints help locate a requested tenant; they never authorize it. No caller-supplied database, schema, credential reference or routing generation is trusted.

The registry stores tenant_id, lifecycle/version, storage_assignment_id, mode, database reference, route_generation, schema compatibility and workflow state. Connection secrets are stored in a secrets manager; registry returns authorized references, never secrets in public contracts. Every request and job binds actor, tenant, authorized companies, permission version, admission expiry and routing generation. Admission is checked live through the control plane initially. Route caches hold connection metadata only; cached admission cannot outlive membership/lifecycle checks. Control-plane outage denies new business admission and freezes route changes. Already admitted transactions follow the bounded policy in security architecture; a transfer must drain them before switching.

## Canonical schema and database roles

One reviewed ERP SQL migration stream serves both modes. Tenant-owned rows have NOT NULL tenant_id, including company rows, outbox, inbox, idempotency, jobs, files and audit. Dedicated databases retain the same tenant columns, RLS, keys and authorization; a private database configuration binds the one expected tenant and rejects any other context. Pooled databases permit several registered tenants. Database-local operational configuration is outside the tenant graph and inaccessible to business runtime writes.

Entity uniqueness is (tenant_id, id); company-owned relationships use (tenant_id, company_id, id). Foreign keys include the complete ownership key. Tenant-shared master references require an explicit authorized company association where company applicability matters. Unique business codes are scoped to their intended tenant/company boundary. Global identifiers alone are not relationship authorization.

| Role                    | Authority                                                    | Restrictions                                                               |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| erp_owner (NOLOGIN)     | Own schema and policies                                      | Never granted to runtime; FORCE RLS on tenant tables                       |
| erp_migrator            | Approved DDL under controlled execution                      | Separate short-lived credential; no public request use                     |
| erp_runtime / erp_job   | Scoped business reads/writes                                 | Nonowner, NOSUPERUSER, NOBYPASSRLS, no CREATE/TRUNCATE/role changes        |
| fleet_provisioner       | Create selected databases/roles through operational workflow | Isolated process credential, reviewed identifier allowlist; no ERP API use |
| lease_discovery         | Discover bounded lease metadata                              | No business payload or broad BYPASSRLS grant                               |
| backup/restore operator | Explicit authorized recovery operations                      | Separate audited credential; isolated staging, no user-request path        |
| control-plane runtime   | Registry/membership and control-plane use cases              | No ERP credential or ownership role                                        |

Default privileges are explicit and tested on every new table; revoke PUBLIC schema/function access where unnecessary. Migrations reject missing RLS, missing WITH CHECK, wrong ownership keys and accidental runtime role membership. PostgreSQL owners normally bypass policies, FORCE RLS subjects owners, and superusers/BYPASSRLS always bypass. Referential constraints can expose conflicts independently of policies. Therefore role restrictions, ownership keys and safe errors are mandatory alongside RLS. [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

## Transaction-local context

Every business read/count/export and write starts one database transaction after trusted admission. On the acquired transaction connection, parameterized set_config with is_local=true binds tenant, company authorization scope, actor and generation; validate the format before SQL. Missing/empty/malformed context denies access. Policies apply USING and explicit WITH CHECK to tenant and company-owned rows, with reviewed policy functions; company lists must come from trusted admission. Tenant-shared reads do not grant all-company access.

Repositories receive only the current transaction session. No root ORM reader, pool.query, implicit nested transaction, session SET, user search_path or unsafe raw interpolation may bypass it. Locks, raw queries, outbox and idempotency use that same connection. Commit/rollback clears local scope; connection reuse and failure paths are negative-tested. External effects are outside retried callbacks. Dedicated context also matches the private expected-tenant binding.

Prisma remains a candidate. Phase 03 must prove interactive transactions preserve the same PostgreSQL backend PID/context for model/raw/outbox operations under rollback, retry, timeout, reuse and bounded pool pressure. Test driver-adapter ownership, shutdown and total client count. Failure means a documented reviewed-SQL/node-postgres selection through ADR 034 evidence before use, never weakened RLS. No proof has run in Phase 01. Prisma documents interactive transactions and transaction timeout/isolation settings; the project must still prove its own adapter behavior. [Prisma transactions](https://www.prisma.io/docs/orm/fundamentals/transactions).

A shared runtime credential that can set trusted context has a shared blast radius if compromised. RLS catches omitted scope and unauthorized ordinary operations; it cannot independently authenticate a user-supplied GUC or contain arbitrary malicious runtime code. Dedicated database credentials and expected-tenant binding narrow that boundary.

## Lifecycle and provisioning

Provisioning workflow: REQUESTED → VALIDATING → ALLOCATING → MIGRATING → SEEDING → VERIFYING → READY → ACTIVE. Each step has an idempotency key, durable attempt/checkpoint, actual resource identifier and reconciliation action. Failure records FAILED plus last safe step; retry discovers existing resources instead of duplicating them. Activation requires schema hash, least-privilege grants, test probes and owner configuration readiness.

Business admission lifecycle is PROVISIONING, ACTIVE, SUSPENDED, MAINTENANCE, TRANSFERRING, DELETING, DELETED. Explicit transition guards prevent admission before readiness. Suspension rejects new admission; deletion preserves approved retention and scoped cleanup authority. Entitlement disable blocks business use cases but permits narrowly authorized recovery/retention jobs. Never claim atomic control-plane and ERP commits.

## Fences and pooled-to-dedicated transfer

Controlled write freeze is the initial proposed strategy. Registry workflow intent alone is insufficient: each ERP transaction acquires a shared tenant gate lock and validates local state/generation within that lock. Freeze takes the exclusive gate, waits for prior transactions, sets local closed admission/generation state, then commits. New or stale requests and workers cannot pass the closed gate. Gate scope is per tenant, not a singleton serializing all tenants. Read consistency during transfer is either old frozen source or rejected admission; it never mixes routes.

Transfer durable checkpoints:

1. Validate source assignment/generation, destination capacity, matching migration checksums and exclusive transfer ownership. Allocate destination with admission closed.
2. Close control-plane admission, install the local source fence, drain requests/leases and record zero active writers. Fence external file publishers using generation-bound capabilities and storage workflow gates; revoke/expire old grants and drain accepted transfers.
3. Export the complete tenant graph from a consistent source snapshot under freeze, including jobs, inbox/outbox, audit, retained documents and idempotency state. Copy objects using a versioned tenant manifest; retain the source.
4. Import preserving IDs, company keys and versions; validate canonical row hashes, counts, relationships, monetary totals, object byte hashes and migration lineage. Check suspended/deleting/failed jobs explicitly; do not republish already delivered effects.
5. Prepare destination local gate for generation g+1 while control-plane admission stays closed; it has no public route. CAS control-plane assignment from source/g to destination/g+1 only when all checks pass. Activate admission last. A crash at any point is reconciled from durable step receipts and observed local gates.
6. Invalidate old routes/credentials; old generation workers and source transactions fail local checks. Verify API, SQL, jobs and files on destination before acceptance.
7. Retain source frozen/quarantined through approved retention. Source cleanup is a separate authorized operation after recovery acceptance.

Before destination accepts writes, rollback can revalidate source, fence destination, advance the registry generation again and reopen source. After destination has accepted writes, never flip back to stale source. Freeze destination and perform a validated reverse transfer or restore/catch-up workflow with a new generation. Failure to reconcile leaves admission closed. Tests inject crashes before/after every checkpoint, replay the workflow and prove no lost/duplicate business effects. Source data is not deleted during validation.

## Fleet migrations, connections and recovery

Canonical migration ledger records ordered version, content checksum, applied state and release compatibility; control-plane fleet registry tracks each database's observed version and readiness. Apply under per-database advisory lock with controlled concurrency, transactional SQL where supported and explicit resumable steps where not. Drift or failed migrations quarantine affected assignments; never hide failure as ready. Upgrade compatibility is declared before rollout; destructive down migrations are not the default rollback. Use compatible application rollback or validated backup restore.

Bounded pools have configured per-process database count, per-pool connection cap, global semaphore, acquire deadline, queue bound and overload error. Reference-count leased pools; evict only idle pools, close cleanly and include workers/administration in the server-wide budget. A dedicated tenant does not imply one permanently open pool per replica. [Capacity model](../specifications/phase-01-capacity.md) gives formulas and owner parameters.

Dedicated recovery restores into an isolated new database and verifies schema, graph and bytes before fenced routing cutover. Pooled single-tenant recovery restores a whole backup into isolated staging, extracts only the authorized tenant graph at the approved recovery point and imports into an isolated destination or frozen tenant slot; tenant B stays untouched. Reconcile outbox/idempotency/provider effects to avoid replaying external payments. RPO/RTO, backup cadence, regional retention and deletion windows remain owner decisions, not achieved guarantees.
