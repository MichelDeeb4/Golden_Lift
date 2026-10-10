# Business Platform — Master Architecture and Implementation Plan

**Project:** `business-platform`  
**Plan version:** 1.0  
**Baseline date:** 2026-10-10  
**Status:** Agreed implementation baseline; specifications and measurable nonfunctional requirements must be approved in Phase 1.  
**Product:** Multi-tenant, multi-company SaaS ERP.  
**Build strategy:** Greenfield architecture and implementation. Existing services, databases, and code are optional reference material, not constraints.

> **Governing rule:** Design and verify the foundation before implementing ERP business modules. Never substitute a temporary single-tenant architecture, unchecked tenant context, or fake authorization for a completed foundation. Do not change an accepted architectural decision without a documented, reviewed Architecture Decision Record (ADR) demonstrating a concrete reason and impact.

## 1. Fixed architectural direction

| Concern | Agreed direction |
|---|---|
| ERP deployment architecture | **Modular monolith** for the tightly coupled transactional ERP core, with enforceable domain boundaries |
| SaaS administration | Separate logical and deployable **control plane** |
| Backend | NestJS + TypeScript on supported Node.js LTS |
| Database | PostgreSQL |
| Multi-tenancy | **Hybrid**, implemented and acceptance-tested from the foundation: pooled shared tables **and** dedicated tenant databases |
| Default tenant storage | Shared-table PostgreSQL pools with `tenant_id` and Row-Level Security (RLS) |
| Isolated tenant storage | Dedicated PostgreSQL database for an individual tenant |
| Logical ERP model | One canonical tenant-owned schema and migration stream across pooled and dedicated modes; `tenant_id` remains present in both |
| Organization | One tenant can contain **multiple legal companies**; branches, departments, operating units, warehouses, and stock locations are distinct concepts |
| Transactional ERP persistence | Accounting, inventory, sales, purchasing, and dependent domains operate within the same tenant transactional database |
| Authentication | OIDC identity provider and platform-managed user/tenant/company memberships |
| Authorization | Server-side scoped permissions/RBAC, resource ownership checks, separation of duties where necessary |
| API | Versioned REST + OpenAPI; explicit application contracts |
| Backend layering | DDD for domains + Clean Architecture dependency direction |
| ORM | Prisma if it passes RLS, migration, tenant routing, connection and transaction proof tests; use reviewed SQL where necessary |
| Event integration | Domain events and transactional outbox; idempotent consumers |
| Async execution | Durable, tenant-aware background workers |
| Web | Next.js + TypeScript |
| Mobile | React Native/Expo when an approved workflow requires it; no assumed launch dependency |
| Files | S3-compatible object storage with tenant-aware access and lifecycle |
| Engineering | CI/CD, architecture checks, observability, secret management, backup/restore and disaster-recovery tests |

### 1.1 Non-negotiable architecture principles

1. Do not recreate the existing five-service/four-database design merely to reuse code.
2. Do not create a microservice for every ERP module. Split a service only for an evidenced operational or business boundary.
3. Do not permit arbitrary cross-module table writes. Ownership and published contracts must be explicit.
4. Do not separate tightly coupled posting workflows into independently committed databases without a justified consistency design.
5. Design both tenancy modes together. Both must work in the **foundation release**, not as an unspecified later enhancement.
6. Do not treat a tenant, legal company, branch, warehouse, and user as interchangeable identity/ownership concepts.
7. Do not equate architecture diagrams or passing unit tests with production-ready isolation; prove security and recovery in running deployments.
8. Reuse legacy code only if it meets the target design and is independently verified.

## 2. System context and runtime boundaries

```text
Customers / ERP Users                 Platform Operators
          |                                   |
      ERP Web UI                         Platform Admin UI
          |                                   |
      ERP API -------------------------- Platform API
          |                                   |
          |                     SaaS Control Plane Database
          |                     - tenant registry & status
          |                     - membership / entitlement data
          |                     - storage location & schema status
          |                                   |
    Trusted Tenant Resolution <---------- Provisioning / Routing
          |
    ERP Modular Transactional Core
    - Organization / Parties / Catalog
    - Accounting / Inventory
    - Purchasing / Sales / Payments
    - Reporting / Integrations
          |
       Storage Router
          |
   +------+----------------------------+
   |                                   |
Pooled ERP PostgreSQL             Dedicated Tenant PostgreSQL
- tenant A, B, C                   - tenant D database
- shared tables + RLS              - tenant E database
- tenant_id on records             - same logical schema and contracts
   |                                   |
   +------------- Workers / Outbox -----+
                   |  |  |
           Files / Messages / Telemetry
```

**Deployment note:** Control-plane operations are separated from business processing. The ERP core is modular, even if multiple web/API/worker processes consume common packages. One ERP implementation supports both storage modes.

### 2.1 Organizational model

- **Tenant:** SaaS customer, subscription boundary, and top-level ERP data isolation boundary.
- **Legal company:** Accounting/legal ownership boundary within a tenant; owns statutory ledgers, tax configurations, and inventory ownership.
- **Operating unit / department / branch:** Organization and access/reporting structures, not automatically a legal entity.
- **Warehouse / stock location:** Physical or logical stock custody; ownership and cross-company servicing must be explicit.
- **User:** Authenticated identity; may have memberships in more than one tenant and selected companies.
- **Roles and scopes:** Enforced in application and appropriate database constraints; a tenant member does not automatically see all companies.

Shared catalog or business-partner records need explicit visibility rules. Company-specific accounting mappings, pricing, inventory balances, tax settings, and operational records retain company ownership where applicable. Intercompany transactions are explicit, not untracked cross-company writes.

## 3. Repository structure (target)

```text
business-platform/
├── apps/
│   ├── erp-api/                 # Transactional ERP API composition
│   ├── erp-web/                 # Tenant-facing web application
│   ├── platform-api/            # SaaS control-plane API
│   ├── platform-admin/          # Platform operations UI
│   └── worker/                  # Durable outbox/jobs processing
├── modules/
│   ├── platform/
│   │   ├── tenants/
│   │   ├── provisioning/
│   │   ├── subscriptions/
│   │   ├── entitlements/
│   │   └── storage-routing/
│   ├── identity-access/
│   ├── organization/
│   ├── business-partners/
│   ├── product-catalog/
│   ├── pricing-tax/
│   ├── accounting/
│   ├── inventory/
│   ├── purchasing/
│   ├── sales/
│   ├── payments-banking/
│   ├── reporting/
│   └── integrations/
├── packages/
│   ├── contracts/              # Published API and event contracts
│   ├── shared-kernel/          # Only genuinely shared domain primitives
│   ├── ui/                     # UI design system
│   └── tooling/                # Enforced engineering conventions
├── infrastructure/
│   ├── tenancy/
│   │   ├── tenant-context/
│   │   ├── storage-router/
│   │   ├── pooled-storage/
│   │   ├── dedicated-storage/
│   │   └── tenant-migration/
│   ├── database/
│   ├── messaging/
│   ├── storage/
│   ├── security/
│   ├── observability/
│   └── deployment/
├── tests/
│   ├── architecture/
│   ├── tenant-isolation/
│   ├── company-authorization/
│   ├── database-migrations/
│   ├── transaction-integrity/
│   ├── recovery/
│   ├── performance/
│   └── end-to-end/
└── docs/
    ├── architecture/
    ├── adr/
    ├── specifications/
    └── operations/
```

Each business module has the following **conceptual** internal layering; create subfolders only as needed by actual code:

```text
module/
├── domain/              # Aggregates, entities, value objects, invariants, events
├── application/         # Use cases, ports, orchestration
├── infrastructure/      # Persistence and external adapters
└── presentation/        # Transport adapters / HTTP
```

Dependency rule: presentation/infrastructure may depend on application and domain; the domain must not depend on frameworks, persistence, transport or another module's internals. Keep cross-module contracts narrow and versioned.

## 4. Hybrid multi-tenancy requirements

### 4.1 Pooled storage

- `tenant_id` is mandatory on all tenant-owned business records and is protected by database constraints.
- Enforce PostgreSQL RLS for both reads and writes with restricted application database roles.
- Fail closed when trusted tenant context is absent or invalid. Do not trust a client-provided tenant ID alone.
- Establish transaction-local database context safely with connection pooling; do not leak state between requests/jobs.
- Test RLS behavior against owner/superuser/BYPASSRLS exceptions and SECURITY DEFINER functions.
- Validate tenant-scoped foreign keys, uniqueness, reporting, exports, bulk operations, maintenance and migrations.

### 4.2 Dedicated storage

- A dedicated tenant DB uses the same business schema, contracts, tenant identifiers and domain rules as pooled storage.
- Restrict database credentials and validate all requests against the authorized tenant/DB assignment.
- Enforce company-level authorization identically to pooled storage.
- Do not fork business logic or maintain tenant-specific schema changes.

### 4.3 Routing, operations and migration

- Control plane maintains the authoritative tenant-to-storage mapping, lifecycle state, version, and routing generation.
- Resolve tenant from authenticated membership and trusted request context; the browser cannot choose an arbitrary database.
- Bound per-database connection pools and application-wide connection budgets; define lifecycle/eviction and backpressure.
- One versioned migration stream is orchestrated across all target databases, with compatibility windows and failure reporting.
- Automate creation, schema initialization, readiness, suspension, backup, restore and deletion/retention workflows.
- Implement pooled-to-dedicated tenant movement with initial snapshot, incremental catch-up or bounded write freeze, verification, controlled cutover, retry/rollback, and source cleanup only after acceptance.
- Do not assume a single ACID transaction across the control plane and all ERP databases; use explicit durable workflows and reconciliation.
- Tenant-scoped cache keys, files, queues, jobs, events, logs, reports and exports must respect the same isolation boundary.
- Plan quotas, noisy-neighbor mitigation, rate limits, per-tenant usage metering, and physical/operational capacity.

## 5. ERP domain and consistency requirements

### Accounting

- Company-scoped ledgers, fiscal years/periods, accounts, financial dimensions, currencies and tax rules.
- Double-entry balanced journal posting; exact decimal monetary representations and explicit rounding/exchange-rate policies.
- Draft versus posted lifecycle; immutable posted entries with reversal/adjustment flows.
- Ledger period locks, stable document sequencing and concurrency safeguards.
- Defined integrations for receivables, payables, banking, payments, inventory valuation, intercompany and consolidation.
- Auditable financial approval chains and separation of duties where relevant.

### Inventory

- Company ownership, warehouses, stock locations, stock movements, reservations and allocations.
- Traceable movement ledger; quantity-on-hand derives from authorized movements or reconciled projections.
- Receipts, issues, transfers, adjustments, counts, returns; explicit negative-stock and reservation rules.
- Cost/valuation methods and reconciled inventory accounting; lot/serial tracking where supported.
- Idempotent posting, concurrency controls and clear cross-company transfer semantics.

### Sales, purchasing, payments

- Explicit document state machines, approvals, numbering, tax/pricing, currency and quantity rules.
- Procure-to-pay and order-to-cash workflows reconciled with inventory and general ledger.
- Corrections/credit notes/refunds/returns instead of destructive edits to posted operations.
- Exactly-once *business effects* achieved through transactions, unique constraints and idempotency, not by assuming messages deliver exactly once.
- Cross-module transaction ownership documented before implementation.

### Master data and internationalization

- Explicit sharing versus company-specific data for products, parties, price lists, taxes and configurations.
- Units and conversions, categories, variants, currency and precision, tax jurisdiction configuration.
- Localization-ready UI, per-tenant language/time zone/business calendar settings; RTL support if required by product markets.
- Extensible fields through controlled schemas/contracts, not unlimited per-tenant database mutations.

## 6. Security, compliance, and operational requirements

- OIDC authentication, MFA for privileged users, session/token revocation, tenant and company memberships.
- Authorization at every action and data path; deny-by-default; audit privileged/financial operations.
- Encryption in transit and at rest, secret management, least-privilege roles, file authorization and signed delivery when appropriate.
- Defined retention, deletion, export, privacy, support access, legal hold (if required) and incident response.
- CI/CD with reproducible builds, dependency/security checks, migrations and deployment rollback mechanisms.
- Traces, structured logs and metrics with safe tenant diagnostic tagging and no unnecessary personal/financial detail leakage.
- Automated backups, verified restore, tenant-specific recovery methods, DR procedures, RPO/RTO objectives.
- Load tests, concurrency tests, failure injection, migration tests and end-to-end UI/API/worker tests.

## 7. Twelve-phase implementation roadmap

**Rule:** A phase is complete only with implemented behavior (where applicable), recorded test evidence and a signed-off gate. Documentation-only proposals never count as deployed controls. Develop necessary frontend vertical slices alongside the matching backend phases, not only at the end.

### Stage A — Architecture and engineering foundation

#### Phase 01 — Complete architectural specification

**Work**
- Confirm product scope and success criteria for a regular ERP supporting the listed business domains.
- Approve bounded contexts and module ownership, application/runtime boundaries, data relationships and organization hierarchy.
- Specify both tenancy modes, a canonical data model, storage routing, provisioning, pooled-to-dedicated movement, migration versioning and capacity budgets.
- Define isolation threat model, authentication/authorization, company-sharing rules and lifecycle/security cases.
- Specify accounting/stock invariants, transaction and event boundaries, error handling, concurrency and consistency guarantees.
- Define environments, CI/CD, observability, backups, recovery, licensing/entitlements, API standards and extension rules.
- Make product requirements measurable: projected tenants/users, peak load and latency, uptime target, recovery/retention target, jurisdictions, launch modules and integrations.
- Record accepted ADRs with alternatives, tradeoffs, and rejection reasons.

**Deliverables**
- `docs/architecture/system-architecture.md`
- `docs/architecture/tenancy-architecture.md`
- `docs/architecture/erp-domain-model.md`
- `docs/architecture/transaction-design.md`
- `docs/architecture/security-architecture.md`
- `docs/architecture/engineering-standards.md`
- ADR set, tenancy threat model, domain/ownership matrix, transaction matrix, capacity model, dependency diagram, future module contracts, phase acceptance tests.

**Exit gate:** All foundation-critical decisions approved; traceable requirements and measurable acceptance tests exist for both tenant storage modes. No application module implementation in Phase 1.

#### Phase 02 — Greenfield repository and engineering standards

**Work**
- Create the agreed monorepo and application/module/package boundaries, using the neutral name `business-platform` and `@business-platform/*` namespace where appropriate.
- Implement module import rules, domain/application/infrastructure conventions, published contracts and architecture lint/checks.
- Establish NestJS compositions, Next.js shell, local Docker environment, tested installs/builds, CI/CD, OpenAPI baseline and test harnesses.
- Add migration scaffolding, environment/secret validation, structured logs, tracing and health endpoints.

**Exit gate:** Reproducible clean checkout, startup, build, typecheck, lint, architecture checks and CI smoke/integration tests pass without legacy dependencies.

#### Phase 03 — Hybrid database infrastructure

**Work**
- Implement control-plane storage, pooled ERP storage and dedicated tenant database provisioning/templates.
- Establish canonical tenant schema and shared migration stream, version tracking, migration orchestration and compatibility strategy.
- Prove ORM/SQL support for both modes and implement bounded connection management and transaction conventions.
- Include provisional tenant/company fixture entities only as needed for infrastructure testing; do not implement ERP modules.

**Exit gate:** Both storage modes provision repeatedly, migrate identically and maintain schema parity; failed migrations are detected and recoverable.

### Stage B — Working multi-tenant platform

#### Phase 04 — Tenant lifecycle, isolation and routing

**Work**
- Implement tenant registry, trusted resolution, storage routing, activation/suspension and entitlement-aware admission.
- Implement PostgreSQL RLS and write policies in pooled storage; test dedicated storage isolation and DB account privileges.
- Implement pooled-to-dedicated tenant movement with write coordination, integrity verification, cutover and rollback.
- Add tests for request/transaction pool reuse, raw SQL, workers, concurrent tenants, bulk reads/exports and failure paths.

**Exit gate:** At least two pooled and one dedicated test tenants are isolated; migration/cutover works and unauthorized access is rejected.

#### Phase 05 — Identity and company-scoped authorization

**Work**
- Integrate OIDC, sessions/token validation, global identities, tenant memberships and company memberships.
- Implement role/permission scopes, tenant switching, revocation, privileged policies and authorization auditing.
- Test cross-tenant identity, cross-company roles, forged context, privilege escalation and stale sessions.

**Exit gate:** Every protected operation validates authenticated identity, tenant membership and applicable company permission; negative tests pass.

#### Phase 06 — Multi-company organization

**Work**
- Implement companies, branches, operating units, departments/cost centers, warehouses and locations with correct ownership semantics.
- Enforce same-tenant and, where required, same-company referential integrity.
- Implement allowed company-shared resources and explicit intercompany boundary contracts (not full business modules).

**Exit gate:** Organization, company ownership, permissions, cross-company constraints and authorized sharing pass real database/API tests in both modes.

#### Phase 07 — Platform services and reliability

**Work**
- Implement durable outbox/jobs, idempotency framework, audit trail, object-storage authorization, tenant-safe caches and entitlements.
- Add localization scaffolding, monitoring/alerts, secrets practices, resilience, retries, dead letters and operational tooling.
- Implement baseline backups/restore workflows and usage limits; exercise failure scenarios.

**Exit gate:** Failed/retried work cannot leak tenants or duplicate business effects; audit, files, jobs and operational controls have end-to-end tests.

#### Phase 08 — Foundation certification

**Work**
- Execute pooled and dedicated isolation/security, authorization, migration, routing, concurrency, retry and recovery suites.
- Perform pooled-to-dedicated migration, database fleet upgrade rehearsal, failure injection, load/resource-budget tests and DR exercises.
- Verify deployment, browser/API/worker paths, provisioning, observability, backups, restore and documented runbooks.

**Exit gate:** Every mandatory foundation acceptance scenario below passes with recorded evidence against approved nonfunctional targets. No ERP business module work begins before this gate.

### Stage C — ERP business implementation

#### Phase 09 — Shared ERP master data

**Work**
- Implement business partners, products, variants, categories, units, currencies, tax setup, pricing, document numbering and supported custom fields.
- Enforce tenant and company ownership/sharing across both storage modes.

**Exit gate:** Data integrity, decimal/rounding, uniqueness, valid sharing and permission cases pass.

#### Phase 10 — Accounting and inventory cores

**Work**
- Implement general ledger, chart of accounts, accounting periods, balanced journals, reversal rules, financial dimensions, basic AR/AP foundations.
- Implement warehouses, movements, reservations, transfers, counts, cost/valuation records and posting integration.
- Exercise concurrent posting, retries, idempotency, financial balance/stock invariants and reconciliation.

**Exit gate:** Ledger and inventory invariants demonstrably hold; valuation reconciles to defined accounting policy; posted records are controlled.

#### Phase 11 — Sales, purchasing and payments

**Work**
- Implement order-to-cash and procure-to-pay, fulfillment/receiving, invoices, returns, credit notes, refunds, payments/banking and approvals.
- Integrate inventory, AR/AP and general ledger via documented transaction/event contracts.

**Exit gate:** Complete workflows reconcile documents, stock, subledgers and general ledger without duplicate posting in both tenancy modes.

#### Phase 12 — Reporting and core ERP release

**Work**
- Implement financial statements, inventory/operational reports, authorized multi-company reporting and export.
- Complete tenant ERP UI for supported workflows and SaaS operational interfaces, subscriptions, integrations and release documentation.
- Validate deployment, performance, backups, security, incident/recovery operations and core ERP end-to-end scenarios.

**Exit gate:** Production-readiness assessment and explicit release acceptance pass across tenant storage modes, modules, web APIs/UI and workers.

### Later product increments (not omitted from architecture)

Manufacturing, POS, HR/payroll, CRM, projects, fixed assets, advanced consolidation, mobile-specific workflows, localization/tax country packs, and public integration marketplaces are separate product scope decisions. Their extensibility/ownership contracts are addressed in Phase 1; full implementations are not falsely promised within the 12-phase core release.

## 8. Foundation acceptance matrix (mandatory Phase 08)

- [ ] Tenant A and B share pooled tables; neither can read/write the other's rows.
- [ ] Tenant C runs in a dedicated database using the same business contracts and schema version.
- [ ] Invalid or missing tenant context fails closed, including raw SQL and background tasks.
- [ ] Unauthorized company access fails within an otherwise authorized tenant.
- [ ] Concurrent requests and database connection reuse do not leak tenant context.
- [ ] Files, jobs, caches, events, reports, exports, logs and support tooling respect tenant boundaries.
- [ ] Pooled-to-dedicated migration preserves IDs, relations and validated record counts/checksums.
- [ ] Write coordination, route cutover, replay, retry and rollback are exercised under failure.
- [ ] Canonical migrations work for both modes and fleet schema-version drift is detectable.
- [ ] Pooled tenant recovery and dedicated database restore are tested without corrupting other tenants.
- [ ] Tenant suspension, membership revocation and session invalidation work.
- [ ] Load and fault tests meet approved tenant count, throughput, connection budget, latency and recovery targets.
- [ ] Authorization uses restricted database roles and RLS cannot be bypassed by the app runtime role.
- [ ] Source-controlled CI, environment builds, observability alerts and operator runbooks are verified.

## 9. Engineering gates for every phase

1. **Before coding:** Write the scope, invariants, dependencies, threat/failure scenarios, schema/contracts and acceptance tests.
2. **During coding:** Maintain one authoritative implementation per business rule, correct layering, bounded transactions, migrations and testable adapters.
3. **Before merge:** Build, typecheck, lint, run unit/integration/security/architecture tests; review generated schema/API changes and secrets.
4. **Before phase acceptance:** Execute live end-to-end gates, record commands and results, document unresolved risks, recovery and rollback procedures.
5. **Change control:** Accepted architecture changes require a reviewed ADR, dependency analysis and proof that the change improves correctness rather than hides an incomplete phase.
6. **No false completion:** A mock, diagram, proposal or unexecuted check cannot satisfy a required production behavior.

## 10. Open product parameters to finalize in Phase 01

These are requirements to measure and approve; **do not invent values**:

| Parameter | To establish |
|---|---|
| Scale | Expected launch and multi-year tenant count, users per tenant, peak concurrent requests, data volume |
| Performance | Critical API latency, transaction volume, reporting workload, acceptable connection/compute budgets |
| Availability | SLO, maintenance windows, recovery-point objective (RPO), recovery-time objective (RTO) |
| Markets | Countries and tax jurisdictions, supported currencies, languages, time zones and fiscal rules |
| First ERP release | Required exact workflows/modules and mandatory integrations; defer nonessential modules explicitly |
| Security/privacy | Retention periods, export/deletion policy, audit retention, backup region, regulatory obligations |
| Operations | Team size, hosting budget, supported environments, alerting/on-call responsibilities |

**Phase 1 approval is required before Phase 2 implementation.** These parameters determine capacity and the acceptance thresholds, not the already-agreed requirement for hybrid tenant storage.

## 11. Immediate next action

**Start Phase 01: architecture specification, not application code.**

1. Put this file at the root of the new `business-platform` repository as `plan.md`.
2. Create the six Phase 1 architecture documents, the ADRs and the ownership/transaction/threat matrices listed above.
3. Specify both pooled and dedicated tenancy in every relevant diagram, migration strategy, security contract and acceptance test.
4. Set realistic measurable product and nonfunctional requirements in collaboration with the product owner; mark unknowns as *open*, not guessed.
5. Review the Phase 1 deliverables against this plan and approve the exit gate before bootstrapping the repository in Phase 2.

### Source/reference basis for architecture review

- PostgreSQL: Row Security Policies — https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- AWS SaaS tenant isolation and storage patterns — https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/welcome.html
- Microsoft Azure Architecture Center: Microservices architecture — https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/microservices
- Microsoft Azure Architecture Center: Transactional Outbox — https://learn.microsoft.com/en-us/azure/architecture/best-practices/transactional-outbox

These references are design inputs, not proof that this particular application has passed any acceptance test.
