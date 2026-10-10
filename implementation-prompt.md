# MASTER IMPLEMENTATION PROMPT — BUSINESS PLATFORM

## Role and mission

Act as the principal ERP architect, staff backend engineer, database/security architect, and delivery lead for this repository. Your task is to **implement the complete `plan.md` in the existing `business-platform` project, phase by phase**, using a **greenfield target architecture**. Do not merely add tenancy to the existing catalog or preserve the old service topology. Build a correct, tested, production-oriented foundation first, then implement the specified ERP capabilities.

**Read `plan.md` from the repository root in full before making decisions. It is the authoritative target architecture and 12-phase delivery contract.** This prompt governs execution, phase discipline, and how to handle the current codebase. If `plan.md` is not present, stop and report the missing required input; do not infer its content from older plans.

Do not declare any feature, phase, security control, or business workflow complete without executable evidence. Work on the repository; do not respond with proposals alone when the current authorized phase requires implementation.

## A. Current state — reference, not the target

The dated architecture baseline (2026-10-10) reports:
- The repository is already named `business-platform` with `@business-platform/*` workspaces.
- The working product is a **single-company catalog**, with global staff Identity, Media, Gateway, and an Inquiries foundation.
- The previous inventory found **five services, four PostgreSQL databases, fourteen workspaces, and 71 existing database models**. Recheck these facts against the live repository; do not assume the inventory is still current.
- **Tenant isolation, RLS, a multi-company organization model, and ERP accounting/inventory/purchasing/sales are not implemented.** Documentation proposing them does not count as implementation.
- A previous Identity smoke test failed against a retired endpoint; installer/CI compatibility and several hosted/provider/browser/recovery checks were not fully verified. Record current results afresh; distinguish pre-existing failures from new failures.
- Earlier architecture documents and ADRs describe both implemented legacy constraints and proposed changes. They are useful evidence but **do not override `plan.md`**.

**The product is under construction, with no deployed customer constraints provided.** Architectural correctness outranks preserving old service count, database count, APIs, file layout, and internal domain models. You may redesign/rebuild them. However, never destroy a database, backup, Git history, secret, remote resource, or potentially valuable user data without an explicit safety assessment and authorization. Use new, disposable development databases for greenfield validation. Keep a recoverable snapshot of the old project until the new system passes acceptance.

The previously completed **legacy “Phase 01 repository normalization”** is *not* the new `plan.md` **Phase 01 complete architectural specification**. Track these separately. Do not treat old migration notes (including company-equals-tenant assumptions or an earlier per-service RLS proposal) as approved target design.

## B. Non-negotiable target decisions

Implement the accepted direction in `plan.md` without silently substituting alternatives:

1. **ERP architecture:** A NestJS/TypeScript **modular monolith for the tightly coupled ERP transactional core**, with DDD/Clean Architecture and automated dependency enforcement. No microservice per module.
2. **SaaS control plane:** Separately deployable platform API/management area, with its own PostgreSQL control-plane database for tenant registry, memberships/identity associations, plans/entitlements, storage routing, lifecycle, and fleet operations.
3. **Hybrid multi-tenancy, fully implemented in the foundation:**
   - **Pooled mode:** multiple tenants in shared PostgreSQL tables, mandatory `tenant_id` on tenant-owned rows, database-enforced PostgreSQL RLS for reads and writes.
   - **Dedicated mode:** one tenant's ERP data in its own PostgreSQL database; tenant ownership and authorization rules remain enforced.
   - **One canonical logical ERP schema, one migration stream, one business codebase**, working in *both* modes; `tenant_id` retained even in dedicated databases.
   - Central trusted tenant registry and storage router, bounded connection management, schema-fleet versioning, provisioning, backup, restoration, and **tested pooled-to-dedicated migration/cutover/rollback**.
4. **Multi-company native from the beginning:** One tenant may contain many legal companies; do not equate tenants, companies, branches, departments, cost centers, warehouses, and stock locations. Financial ledgers and stock ownership are company-scoped.
5. **Authentication and authorization:** OIDC-based identity; trusted tenant membership resolution; company-scoped RBAC/permissions; deny-by-default; resource ownership checks; privileged auditing and revocation. No client-controlled database selection.
6. **Transactional ERP integrity:** Accounting, inventory, purchasing, sales, and payments live in the same tenant transactional database. Use clear aggregate ownership, application-coordinated ACID transactions for operations requiring atomicity, and outbox/idempotent workers for asynchronous effects. Never assume atomic commits across control-plane and tenant databases.
7. **Stack and interfaces:** PostgreSQL, NestJS, TypeScript, Next.js for web, REST/OpenAPI, S3-compatible object storage, durable workers, structured logging/tracing/metrics, containers and CI/CD. Prisma is conditional on proof tests for RLS, transaction context, migrations, connection budgets, and routing; use reviewed SQL or choose a documented alternative if Prisma fails those tests.
8. **Greenfield implementation:** Legacy functionality may be reused only after validation against target domain and security rules. Do not write adapters or workaround layers solely to preserve a design that the new platform replaces.
9. **Future growth:** Stable bounded contexts, published contracts, small shared kernel, approved extension mechanisms. Do not prematurely build manufacturing, POS, HR/payroll, CRM, fixed assets, projects, or mobile apps unless separately scoped; design their integration boundaries in Phase 01.

## C. Repository and documentation authority

Target structure (adjust only through an accepted ADR supported by evidence):

```text
business-platform/
  plan.md
  apps/
    erp-api/
    erp-web/
    platform-api/
    platform-admin/
    worker/
  modules/
    platform/{tenants,provisioning,subscriptions,entitlements,storage-routing}/
    identity-access/
    organization/
    business-partners/
    product-catalog/
    pricing-tax/
    accounting/
    inventory/
    purchasing/
    sales/
    payments-banking/
    reporting/
    integrations/
  packages/{contracts,shared-kernel,ui,tooling}/
  infrastructure/{tenancy,database,messaging,storage,security,observability,deployment}/
  tests/{architecture,tenant-isolation,company-authorization,database-migrations,transaction-integrity,recovery,performance,end-to-end}/
  docs/{architecture,specifications,operations}/
  documentation/decisions/  # Existing canonical ADR location; do not fork numbering or authority
```

A domain module should separate `domain/`, `application/`, `infrastructure/`, and `presentation/` where code actually requires these boundaries. `domain/` must not depend on frameworks, ORM, HTTP, or another module's internals. Business modules communicate using explicit published contracts and authorized orchestration, not unrestricted writes to one another's tables. Do not create empty folders or generic abstractions for appearance only.

**Document precedence:** `plan.md` + newly approved target ADRs govern the desired system. `docs/architecture/` (dated baseline) and `documentation/architecture.md` are historical/current-implementation evidence until superseded. Follow the existing `documentation/decisions/` ADR numbering and update its index; do not create a conflicting ADR tree. Where an old accepted ADR only applies to the legacy system, explicitly mark it historical/superseded through a new ADR instead of pretending it is still the target. Preserve the dated report's provenance.

## D. Execution contract — mandatory for every phase

1. **Discovery:** Read the complete `plan.md`, root instructions (including `AGENTS.md`), existing ADRs, current baseline, source, schema, tests, scripts, and runtime configuration. Verify actual repository state; never assume old documentation is current.
2. **Design first:** Before coding each phase, write/update its requirements, ownership map, API/event/data contracts, invariants, failure modes, security concerns, migration plan, and executable acceptance tests.
3. **Greenfield workspace:** Designate the new implementation clearly. Prefer clean target applications/modules and disposable databases rather than gradually corrupting the legacy structure. Do not create two production sources of truth. When replaced components are no longer used, remove obsolete implementation **after** the new target passes verification and recoverable legacy evidence is secured.
4. **Quality:** Implement real code, not stubs disguised as features; test actual PostgreSQL roles, APIs, workers, and frontend behavior where relevant. Architecture and authorization tests are first-class requirements. Protect operations from duplication, concurrency races, and partial failure.
5. **No speculative production changes:** Never touch live external databases, deployment infrastructure, DNS, secrets, or irreversible provider settings without explicit authorization. Do not assume existing data must be migrated into the new model. If approved later, devise and verify a separate data import/cutover plan.
6. **Verification:** At each phase, run clean install, format/lint, build, typecheck, unit, database integration, architecture, tenancy/security, and appropriate E2E tests. Run actual commands and record exact results. Mark unavailable external/provider tests `BLOCKED`, not `PASS`.
7. **Exit gates:** A phase closes only when all of that phase's `plan.md` acceptance criteria are met. Write signed-off evidence in `docs/implementation/phases/phase-XX.md` with changed files, command output summaries, design decisions, test results, remaining risks, and next-phase prerequisites.
8. **Owner approval:** Phase 01 has an explicit approval gate. Missing requirements (scale, jurisdictions, launch workflows, RPO/RTO, availability, retention, integrations, hosting budget) must be presented as specific decisions with reasoned recommendations and clearly labeled assumptions; **do not fabricate approved values**. Do not start Phase 02 until Phase 01 is approved. For other phases, continue only when the defined exit gate is verified and any required owner-controlled actions are authorized.
9. **Change control:** Never silently replace hybrid tenancy with database-per-tenant or pooled-only, or silently change the ERP core to distributed microservices. A real need to change an accepted direction requires a new ADR: evidence, alternatives, impacts, test implications, and owner approval.
10. **Session continuity:** This is a multi-phase, multi-session project. Persist design, state, acceptance evidence, and exact next actions in the repository. On every subsequent session, reread `plan.md` and the latest phase report and resume at the earliest unpassed gate. Do not pretend to finish twelve phases in one response or claim unexecuted work is done.

## E. Required foundational engineering details

These cross-cutting requirements must be designed in Phase 01 and implemented/tested in their assigned foundation phases:

**Tenant isolation and security**
- Authenticate identity, verify membership, check tenant lifecycle, then resolve authoritative storage assignment. Requested subdomain/path/tenant hint alone is never authorization.
- Handle control-plane unavailability, revoked access, suspended tenants, cached routes, routing generations, credential rotation, and in-flight requests securely.
- In pooled databases, every tenant-owned table has enforced RLS including `WITH CHECK` write protection, restricted runtime roles, fail-closed transaction-local tenant context, same-tenant composite keys/FKs and unique constraints.
- Test bypass risks: role ownership, `BYPASSRLS`, superusers, SECURITY DEFINER, views, raw SQL, bulk operations, exports, cross-tenant joins, session pooling, background workers, and connection reuse.
- Dedicated tenant databases also maintain tenant IDs, same domain constraints, least-privilege credentials, and company-scope authorization.
- Enforce isolation consistently in caching, S3 keys/policies, queues, jobs, notification recipients, reports, generated files, search indexes, logs and support tooling.
- Never use arbitrary per-tenant SQL table names or tenant-specific business-schema forks.

**Hybrid operations**
- Maintain one versioned schema/migration lineage across pooled and dedicated tenant storage.
- Automate tenant provisioning, activation, suspension, readiness, migration fleet status, backup, per-tenant restore procedures, retention and deletion.
- Use bounded database pools, connection budgets, eviction and backpressure. Prove supported behavior with the selected ORM/driver.
- Pooled-to-dedicated migration must test consistent snapshots, either replay/catch-up or controlled write freeze, byte/data integrity checks appropriate to stored content, id/relationship preservation, coordinated router cutover, stale-worker rejection, reruns, failure rollback and later source cleanup. Never delete source data before acceptance.
- No distributed ACID assumption across control-plane and tenant databases; use durable workflow state and reconciliation.

**Multi-company and financial integrity**
- Identity/user and tenant membership are distinct from legal-company authorization. A user can belong to multiple tenants/companies.
- Define tenant-shared vs company-owned products, parties, pricing, taxes, ledgers, warehouses, and reporting; enforce with DB constraints where feasible.
- Organization owns companies/branches/units and organization policy; Inventory owns detailed warehouses, stock locations and movement/valuation records, linked to owning company. No duplicate warehouse ownership models.
- Accounting uses precise decimals, currencies, rounding rules, fiscal years/periods, journal balance invariants, immutable posted entries, reversals and intercompany rules.
- Inventory uses movement ledgers, reservations, count/adjustment workflows, explicit negative stock policy, valuation and accounting reconciliation.
- Sales and purchasing use explicit states/approvals, tax/price precision, document numbering, correct fulfillment/receipt and reversal/return/refund workflows.
- For workflows requiring atomicity, the orchestrating application service coordinates domain-owned operations in **one tenant database transaction** without violating module encapsulation. External notifications/events use outbox and idempotent consumers; do not claim exactly-once message delivery.

**Security and operational maturity**
- OIDC, secure tokens/sessions, role and permission scopes, MFA for high privilege, session revocation, least-privilege credentials, auditable admin/financial actions, secrets management and encrypted storage/transport.
- Supported languages/time zones, localization/RTL where required, company fiscal calendars, lawful tax configuration, privacy/retention rules and data export.
- Versioned OpenAPI contracts, validation, idempotency keys, rate limits, secure files, reliable background jobs, telemetry, alerting, tested backups, restores and disaster-recovery runbooks.
- Establish numeric scale, latency, capacity, availability, RPO/RTO and retention criteria with owner approval; do not invent business constraints.

## F. Execute the 12 phases in `plan.md` — exact order and scope

### Phase 01 — Complete target architecture specification (next phase)
Produce/reconcile:
- `docs/architecture/system-architecture.md`
- `docs/architecture/tenancy-architecture.md`
- `docs/architecture/erp-domain-model.md`
- `docs/architecture/transaction-design.md`
- `docs/architecture/security-architecture.md`
- `docs/architecture/engineering-standards.md`
- Canonical ADRs, capacity model, domain ownership matrix, company-sharing rules, transaction/event matrix, threat model, deployment diagram, contract conventions, operational SLO assumptions and **executable acceptance specifications** for both storage modes.

Review the old `docs/architecture/*`, `documentation/decisions/*`, `documentation/architecture.md`, and existing code as evidence, **not** as mandated implementation topology. Identify and explicitly supersede conflicting legacy decisions. Decide physical control-plane separation, database role hierarchy, how Prisma establishes secure transaction-scoped RLS context and handles connection budgets (or document its replacement), migration orchestration, provisioning state machine, tenant transfer, business ownership boundaries, and environment strategy.

**Phase 01 gate:** The specification is internally consistent, every foundation-critical choice is recorded and reviewed, unknown product/NFR thresholds are listed for owner approval, and all proposed acceptance tests are traceable to requirements. **No new ERP modules or foundation implementation in this phase. Pause for required architecture/product approval.**

### Phase 02 — Greenfield repository and engineering foundation
Build the clean target monorepo from the approved architecture: applications and modules, package boundaries, dependency tests, NestJS entrypoints, Next.js shells, versioned API/OpenAPI, environment validation, Docker development environment, CI, logs/traces/health and test harnesses. Avoid dependencies on legacy service topology. **Gate:** reproducible fresh clone/install/build/start/tests and automated architecture-boundary verification.

### Phase 03 — Hybrid database infrastructure
Implement control-plane database; pooled tenant ERP database; automated dedicated tenant database creation; canonical schema/migrations; fleet migration/version registry; validated role/connection/transaction behavior; bounded pools and failure reporting. Test fresh provisioning and upgrades in disposable PostgreSQL instances. **Gate:** same logical schema/constraints and migration state in both modes; repeatability, failed-migration detection and safe recovery.

### Phase 04 — Tenant lifecycle, isolation and routing
Implement registry, trusted tenant routing, lifecycle, RLS and dedicated tenancy isolation, provisioning state machine, pooled-to-dedicated migration, cutover and rollback. Until Phase 05 identity is complete, expose sensitive routes only through a **real restricted internal principal or closed test harness**, never public unauthenticated access or mock authorization sold as complete. **Gate:** at least two pooled tenants plus one dedicated tenant pass isolation and transfer tests across API, SQL, concurrent request and worker paths.

### Phase 05 — Identity and company-scoped authorization
Integrate OIDC and central identity; tenant/company memberships, roles and scopes, company switching, session/permission revocation, privileged operations and audit. Remove temporary internal test admission paths from any exposed production flows. **Gate:** negative tests for forgery, cross-tenant/company access, privilege escalation, stale sessions and revoked memberships pass in both storage modes.

### Phase 06 — Multi-company organization
Implement legal companies, branches, operating units, department/cost-center scope and organization hierarchy; company constraints and explicit shared-master-data policies. Define warehouse/company ownership contracts here but reserve detailed warehouse/stock entities and movements for the Inventory module in Phase 10. **Gate:** same-tenant/company constraints, organization permissions, sharing and forbidden cross-company links pass on pooled and dedicated databases.

### Phase 07 — Platform reliability and shared services
Implement durable transactional outbox, idempotent tenant-aware workers, retries/dead-letter policy, audit, file storage authorization, entitlement enforcement, bounded cache, localization foundation, metrics/alerting, backup/restore, limits, and operator runbooks. **Gate:** failure/retry/invalidation behavior proves no tenant leaks, duplicate business effects, unauthorized files or silent job loss.

### Phase 08 — Foundation certification
Run all foundation tests in `plan.md` plus actual integration/browser/worker/security/concurrency/load/backup-recovery/fault/migration rehearsals. Record measurable results against approved targets. **Hard gate:** do not begin ERP modules until both pooled and dedicated modes, multi-company authorization, migrations, tenant transfer, DR and operational controls are demonstrably working.

### Phase 09 — Shared ERP master data
Implement business partners, catalog, variants, units, currencies, taxes, pricing, document numbering and controlled customization, following explicit tenant/company sharing rules. Deliver matching UI flows, APIs, migrations and tests. **Gate:** ownership, precision, constraints, authorization and state transitions correct in both modes.

### Phase 10 — Accounting and Inventory transactional cores
Implement company ledgers, chart of accounts, fiscal periods, balanced journal posting/reversals, financial dimensions and AR/AP foundations; implement warehouse/stock-location ownership, movement ledger, reservations, transfers, counts, valuation and financial reconciliation. Use explicitly defined transaction ownership and concurrency policies, with UI/API tests. **Gate:** prove balance, immutability, stock movement integrity, valuation/reconciliation, idempotency and race protection.

### Phase 11 — Sales, Purchasing, Payments and Banking
Implement complete order-to-cash and procure-to-pay, orders/fulfillment/receipts, invoices, returns, credit notes, refunds, approvals, payments and banking integration; reconcile subledgers, general ledger and inventory. Build incrementally integrated UI/API/worker flows. **Gate:** verified accounting/stock consistency, permissions, retries and complete flows in both modes.

### Phase 12 — Reporting and ERP core release
Implement financial statements, operational/stock reports, authorized cross-company views, exports, core ERP UX, platform administration, approved integrations and release hardening. Rehearse deployment/rollback, tenant lifecycle, performance, disaster recovery, security and audit readiness. **Gate:** signed-off release acceptance, both tenant storage modes, real end-to-end workflows and operational runbooks.

Outside the 12-phase core release: manufacturing, POS, HR/payroll, CRM, projects, fixed assets, mobile apps and country tax packs remain explicitly separately scoped future increments. Prepare boundaries, not fake implementations.

## G. Required test matrix and proof

Maintain machine-readable test matrices covering:
- Tenant A and B sharing pooled tables with no cross-tenant read/write or inference.
- Tenant C in a dedicated DB running the same application/schema/business contracts.
- Two companies within one tenant with distinct permissions, accounting and inventory ownership.
- Untrusted/missing tenant context, owner/BYPASSRLS misuse, raw queries, race conditions and connection reuse.
- Cross-tenant leakage through gateway, APIs, workers, queues, caches, files, reports, exports, search and audit/support tools.
- Pooled-to-dedicated transfer: snapshots, delta/write freeze, checksums/counts/foreign keys, routing generation and recovery from failures.
- Fleet-wide migration/rollback compatibility, dedicated DB backup/restore, isolated recovery of one pooled tenant without overwriting others.
- Revocation, tenant suspension, privileged access and company permissions.
- Ledger balance, immutable posting, reversal, inventory consistency/valuation, idempotency, decimal/tax precision and concurrency.
- CI build/security checks, browser/API/worker E2E, observable failures, connection/load budgets and the agreed recovery objectives.

Write **test code and run it**. A diagram, a mock-only test, a passing compilation, or an old single-company test suite is insufficient.

## H. Output required at every working session

At the end of each session, provide concise, factual output:
1. Current `plan.md` phase and gate status (`PASS`, `FAIL`, `BLOCKED`, `NOT STARTED`).
2. What source/design/database/test files actually changed.
3. Commands executed and results; tests not run with reasons.
4. Architecture decisions and whether proposed or accepted.
5. Risks, remaining work, and the exact next implementation task.
6. Explicit owner decisions required, if any. Never imply owner approval.

**Start now with `plan.md` Phase 01**, reconciling the old repository baseline against the greenfield target. Produce the required architecture specifications, acceptance-test design, and clear product decisions that require approval. Do not interpret the old normalized-repository Phase 01 as completing the new specification phase. After the Phase 01 gate is approved, implement Phases 02–12 in the documented sequence, without silently changing the architecture and without promoting incomplete work to a completed phase.
