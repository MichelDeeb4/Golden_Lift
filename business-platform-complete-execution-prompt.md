# BUSINESS PLATFORM - COMPLETE ZERO-SHORTCUT EXECUTION DIRECTIVE (V2)

**Project:** `business-platform` (`@business-platform/*`)
**Target architecture revision:** `target-specification-2026-10-10-v1`
**Governing roadmap:** `plan.md`, 12 phases
**Existing accepted decisions:** ADRs 030-035 and their recorded bounded owner deferrals
**Starting verification commit:** `0973610e5fc3c75dda1540c08ed33eaa6998d3bf`
**Verified GitHub Actions run:** https://github.com/MichelDeeb4/business-platform/actions/runs/38065009923

## 0. Your mission and execution behavior

You are the implementation lead: principal ERP architect, senior NestJS/TypeScript engineer, PostgreSQL architect, security engineer, DevOps engineer and independent test reviewer. **Execute the existing approved plan, not a new planning exercise.** Work inside the existing `business-platform` repository, but treat old Catalog/Identity/Media/Inquiries/Gateway code as optional reference, not target architecture. The project is under construction and may be rebuilt. Do not preserve a defective topology merely because it exists.

Implement the roadmap **phase by phase, in order, to the end of Phase 12**. The non-negotiable first milestone is a **fully proven Phase 08 foundation** before ERP transactional domains begin. Continue automatically from one verified phase to the next **while your execution session and permissions allow**. Do not stop after drafting, scaffolding, compiling, one green unit test, or writing a report. Do not ask for repetitive "continue?" permissions when the existing owner-approved plan already authorizes the work. Fix each failure at its root cause and rerun the affected gates. Persist exact, reproducible state between sessions so the next agent invocation can resume immediately at the earliest unpassed gate.

This instruction cannot create unlimited background execution, override environment limits, provide missing credentials, or approve unknown business policies. If you encounter a **genuine external-access or owner-decision dependency**, complete all independently safe work, write a precisely scoped `BLOCKED` status, and ask one consolidated question listing only missing items. Never fake authorization, choose an unapproved business/legal value, weaken a test, fabricate verification, or move past a hard gate. The standard is **zero knowingly unresolved critical architectural/security/data-integrity defects**, backed by evidence, not an impossible guarantee of zero software defects.

## 1. Current state: verify rather than assume

1. The original repository had five service processes, four PostgreSQL databases, 71 legacy data models, and a catalog application. Its runtime structure was **not approved as the ERP target**.
2. Phase 01 target specifications have been owner-approved under revision `target-specification-2026-10-10-v1`; ADRs 030-035 are accepted, with seven owner-decision groups and **bounded deferrals**. Do not reopen them without a specific demonstrated contradiction and a new owner-approved ADR.
3. Phase 02 created five **target application** entrypoints: `apps/erp-api`, `apps/platform-api`, `apps/worker`, `apps/erp-web`, `apps/platform-admin`, plus shared packages, CI, architectural checks, containers and test harnesses. **Five target app processes do not mean a return to five independently owned legacy business microservices.** One modular transactional ERP core remains mandatory; the platform control plane is separate.
4. Existing reports had Phase 02 `BLOCKED` solely on hosted CI. **Fresh external verification:** GitHub Actions run `38065009923` completed `success` for commit `0973610e5fc3c75dda1540c08ed33eaa6998d3bf`, including clean install, Playwright Chromium, `npm run check`, OpenAPI and diff check, disposable PostgreSQL, Docker, and security scan. Confirm the run, commit, workflow steps, and repository tree yourself. If still valid, update `docs/implementation/phases/phase-02.md`, `phase-02-acceptance.json`, `phase-02-verification.json` and the appropriate phase state to **PASS**, recording real hosted evidence. Do not invent results or skip another mandatory criterion.
5. Phase 03 has not been implemented as of that baseline. Hybrid tenant databases, tenant routing, actual RLS, OIDC, multi-company organization and ERP modules are not yet completed.
6. GitHub currently uses `main`; use a reviewed working branch for new changes where feasible. Protect unrelated local user modifications. Never force-push, delete history, silently overwrite uncommitted files, or perform a destructive production operation.
7. Recheck the real Git status, branch, code, dependency graph, repo permissions and acceptance artifacts at the start of work; repository facts may have advanced since this directive was written.

## 2. Absolute authority and change control

Read **in full before editing**: `plan.md`, `implementation-prompt.md`, all six approved target documents under `docs/architecture/`, the canonical `documentation/decisions/` sequence (especially ADRs 030-035), `docs/specifications/phase-01-decisions.json`, `docs/specifications/phase-01-owner-decisions.md`, current phase reports and machine-readable acceptance matrices, root/nested `AGENTS.md`, manifest/scripts/CI configuration, database source and tests. Confirm paths rather than assuming files exist. Cross-check proposed ADR text against accepted status; do not confuse old acceptance with new approval.

Authority order:

1. Explicit owner-approved decisions and accepted ADRs.
2. `plan.md` (approved 12-phase architecture and scope).
3. Accepted target architecture specifications and actual source contracts.
4. Current engineering rules consistent with 1-3.
5. Legacy documentation, schemas and runtime as historical evidence only.

If an older `AGENTS.md` section still demands service-per-domain databases, legacy Expo-only UI, global single-company identity, or unconditional per-service Prisma, treat that passage as superseded. Keep useful general quality and security rules. Never silently make a second ADR tree or source of truth. A real architectural change requires a written decision identifying the failure, alternatives, tradeoffs, compatibility, security, data impacts, acceptance changes and explicit approval.

## 3. Fixed deployment and code architecture

```text
business-platform/
  apps/
    erp-api/          # One NestJS composition for transactional ERP modules
    erp-web/          # Next.js ERP tenant UI
    platform-api/     # Separate SaaS control plane deployment
    platform-admin/   # Next.js SaaS operator UI
    worker/           # Durable background processing; tenant-aware
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
  docs/{architecture,specifications,operations,implementation/}
  documentation/decisions/ # canonical ADR authority
```

This is a **conceptual target structure**, not permission to generate empty module shells. Only create module files for accepted use cases. For each implemented module distinguish `domain`, `application`, `infrastructure`, and `presentation` concerns without overengineering. Domain code has no ORM/NestJS/HTTP/provider dependencies. Application use cases depend on domain and published ports/contracts; infrastructure and presentation implement adapters. Prevent another module from writing owned tables directly. Use dependency-checking rules, public exports and negative tests to enforce boundaries on imports, re-exports, cycles, generated clients and runtime dependency injection.

Hard invariants:

- NestJS/TypeScript backend, Next.js/TypeScript frontend, PostgreSQL.
- **Modular monolith** for accounting, stock, sales, purchasing, payments and other tightly coupled ERP transactional domains; no per-module microservice/database drift.
- Separate control-plane service and **physical control-plane DB** for registry, entitlements, tenant admission, storage metadata and provisioning.
- Both **pooled shared PostgreSQL tables with `tenant_id` and enforced RLS** and **dedicated tenant PostgreSQL databases** supported by one canonical ERP schema/migration lineage and one business implementation. Keep `tenant_id` on tenant-owned records in both modes.
- Multi-company per tenant. Legal company is distinct from tenant, branch, organization unit, warehouse, stock location and identity. Company accounting/inventory ownership and cross-company permissions are explicit.
- OIDC identity, securely verified claims, tenant/company memberships, scoped authorization, controlled privileged access. No trusted authorization decision based solely on request headers or database location.
- Prisma **only after real proof** of transaction-scoped RLS, routing, isolation, migrations, driver connections and pool budgets; supplement with reviewed SQL or replace the ORM through approved evidence if it fails.
- Durable workers, transactional outbox, idempotency, REST/OpenAPI, S3-compatible files, observability, recovery, release-quality CI.
- Mobile/advanced industries are future increments unless specifically approved; do not silently add manufacturing, payroll, POS, CRM or separate mobile apps.

## 4. General delivery rules for every phase

**Plan -> implement -> run -> observe -> fix -> rerun -> record -> move forward.** Before changing a feature, trace caller -> contract -> domain invariant -> transaction -> database/worker -> UI -> tests. Consider both tenant modes and all affected company roles. Prefer small, complete vertical slices, not mass-generated code or superficial stubs. Never leave a hidden duplicate/parallel business implementation.

For each phase:

1. Read predecessor phase gate and owner-decision deadlines. Create/update an explicit requirements-to-tests matrix; state scope, boundaries, invariants, API/event/data contracts, dependencies, threat/failure scenarios, reversibility and deployment impact.
2. Design the smallest production-grade mechanism that actually satisfies requirements. Avoid framework-shaped cargo cult abstractions, `any` suppression, `TODO` security, broad bypasses and hard-coded tenant IDs.
3. Write positive, adversarial and failure tests first or alongside implementation. Unit tests alone do not prove DB/RLS/security/recovery correctness.
4. Implement the backend, migrations, API, UI, security/authorization, instrumentation and worker integration relevant to that phase. Keep OpenAPI and client contracts generated and checked for drift.
5. Use disposable test-owned infrastructure. Prove transactions, real restricted database roles, rollback, concurrent access and process failures; do not alter valuable existing databases or external resources without separate authorization.
6. Run clean-install/build/typecheck/lint/format/module-boundary/unit/real database/API/browser/worker and provider/fault tests as applicable. Always run impacted regression suites from earlier phases. Run hosted CI on the **exact commit**; capture run/steps/artifacts. Never count blocked/skipped tests as passes.
7. Fix root causes, not merely the assertion or check runner. Document any failed first attempt and verified remediation. Do not silence warnings or delete tests to obtain green status.
8. Update `docs/implementation/phases/phase-XX.md`, machine-readable phase acceptance and verification evidence: code SHA, exact environment, commands/exit codes, passed and failed assertions, migration hashes, traces, CI URL, risks, owner decisions, rollback/runbooks and next phase.
9. Gate: all mandatory tests PASS and required owner decisions approved or validly deferred **past this phase**. If `BLOCKED`, explain the exact missing evidence or policy, complete unrelated safe work, and do not start a dependent phase.
10. Continue into the next phase automatically after a verified gate, until Phase 12 completes or a genuine external/owner blocker arises. Persist a restart pointer if an agent session ends mid-phase.

Use a working branch and reviewable commits. No force push, broad branch resets, secret extraction, direct unreviewed production migration, source/data destruction or merging into protected branches without authorization. Do not run automated destructive tenant/data cleanup against anything other than positively identified disposable test fixtures.

## 5. Owner decisions: preserve real deadlines

Existing owner approval covered **architecture revision, ADRs 030-035, and bounded deferrals**, not invented product policies. Read `docs/specifications/phase-01-decisions.json` and preserve the following gates:

| Decision | Owner value required before |
|---|---|
| OWNER-SCALE | Phase 03: connection/capacity budget and `maxDatabaseConnections`; Phase 08: workload, tenants, concurrency, TPS, p95/p99 and measurable scale targets |
| OWNER-HOSTING | Phase 03: hosting approach, region, budget and database failure domains; Phase 05: OIDC/MFA choice; Phase 07: object storage/broker provider choice |
| OWNER-RECOVERY | Phase 04: maximum tenant-transfer freeze duration; Phase 07: availability, RPO/RTO, backup cadence and retention/source-cleanup policy |
| OWNER-SCOPE | Phase 07: languages/timezones/localization requirement; Phase 09: launch jurisdictions, currencies, workflows and integrations |
| OWNER-DATA | Before handling real data: residency; Phase 04: any retention-aware deletion; Phase 05: support access; Phase 07: exact retention, deletion and recovery policies |
| OWNER-FINANCE | Before Phase 09 dependent business configuration: fiscal, FX, tax, numbering and approval policy; before Phase 10: costing/valuation, negative stock, backdating, intercompany posting |

Do not substitute fixture values or recommendations for owner approval; unknown targets stay `null` until approved. You may use clearly labeled **non-production synthetic test values** to exercise algorithms, without treating them as deployable policy. Do not infer compliance or accounting rules for an unspecified country. When due, prepare **one consolidated owner decision request** with short recommendation, alternatives, consequence and exact dependency. Continue all unaffected work while waiting, but block the dependent gate correctly.

## 6. Phase-by-phase implementation and proof

### Phase 01 - EXISTING APPROVAL (do not redo)

- Verify approved six target architecture specifications and accepted ADRs 030-035, owner message, revision and decisions are in the repository.
- Resolve only factual inconsistency or missing accepted authority; do not produce another competing architecture tree.
- Phase 01 status is already PASS for the accepted architecture with bounded deferrals. Do not mistake old single-company baseline documents for governing design.

### Phase 02 - RECONCILE AND CLOSE THE VERIFIED ENGINEERING FOUNDATION

- Confirm GitHub Actions run `38065009923` for `0973610e5fc3c75dda1540c08ed33eaa6998d3bf`: `success`, correct repo/workflow/source, all required steps passed. Verify local `main` and working tree against that commit.
- Inspect the accepted 13 criteria including install, build, types, lint, boundaries, API/HTTP, web, OpenAPI, telemetry, database harness, Docker, security and hosted CI. Confirm relevant Docker/PostgreSQL local receipts and current dependencies. Do not falsely close if any criterion is missing or the workflow does not cover the accepted source.
- Update Phase 02 report, acceptance state and evidence; repair gate tooling if it fails to recognize a real verified run without bypassing any assertion. Keep historical prior `BLOCKED` evidence dated.
- Phase 02 gate is PASS **only after recorded evidence and gate tool validation**. The target active graph must compile/run without needing legacy microservice code or old databases.
- Start Phase 03 immediately if its owner deadline requirements are satisfied; otherwise execute all policy-independent research/proof scaffolding and present the consolidated capacity/hosting decision.

### Phase 03 - HYBRID POSTGRESQL AND DATA-ACCESS FOUNDATION

Implement real code and SQL, not just interfaces:

1. **Control DB:** independent physical PostgreSQL database with platform-only schema/migration lineage, tenant registry/bootstrap metadata, storage locations/mode, lifecycle, generation, fleet schema version, provisioning/migration operation records, company-membership design hooks, change history and optimistic concurrency. Explicit authority and consistency boundaries between control plane and tenant DB; no fantasy cross-DB ACID.
2. **Canonical ERP database schema:** one versioned tenant-owned lineage used identically in pooled and dedicated databases. UUID/key and tenant-id design, company ownership hooks, composite tenant-aware FKs/uniqueness, immutable/auditable metadata, precise timestamps, deterministic constraints/indexes, per-mode validation. No schema forks and no per-ERP-module databases.
3. **Provisioner:** safe idempotent create/init/migrate/readiness/retry workflows for shared pools and dedicated databases. Restrict runtime roles vs migration/owner roles, avoid wide credentials in services, and guard only task-owned fixtures for removal.
4. **Migration fleet:** canonical migration manifest and checksum drift detector; control/ERP distinct migration streams; forward/back compatibility policy; version admission window; deterministic order, partial failure visibility, retry/recovery and migration locking; unchanged already-applied SQL.
5. **Connection manager:** bounded per-database and overall pools, LRU/TTL eviction, no unbounded dedicated DB connections, backpressure when limits reached, credential rotation, close/disposal, cancellation and session reset.
6. **Data-access proof:** build actual restricted-role SQL/ORM integration tests showing transaction context, `SET LOCAL`/safe transaction-scoped context, interactive transactions and connection pooling across concurrent requests, queries/raw SQL and failures. If Prisma cannot safely meet proof obligations, record evidence and select a supported alternative through accepted review instead of weakening RLS.
7. **Safety:** no real tenant data or artificial production performance targets. All tests use disposable PostgreSQL, one pooled fixture and multiple dedicated fixtures.

**Required gate:** real PostgreSQL databases repeatedly provision and migrate, preserve schema/constraint parity, detect checksum drift and failed migrations, enforce role separation, stay within approved connection budget and recover idempotently. Negative and failure-injection tests PASS. Freeze authorization/capacity/hosting decisions must not be invented.

### Phase 04 - TENANT REGISTRY, ADMISSION, RLS, ROUTING AND TRANSFER

1. Trusted tenant resolution from verified internal identity/admission; tenant hint is not authority. Versioned storage route and tenant lifecycle (pending/active/suspended/migrating/failed/deleting); fail closed on missing/untrusted/obsolete context. Before Phase 05 OIDC, allow **only real restricted internal test principals or closed test harnesses**; do not expose insecure publicly accessible APIs.
2. Pooled RLS for every tenant-owned table: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` where appropriate, correct `USING` and `WITH CHECK`, transaction-local trusted context, restricted non-owner roles without `BYPASSRLS`, tenant-aware FK/unique constraints. Include reporting and bulk paths.
3. Dedicated DB routing checks active tenant, authorized assignment and generation before acquiring an approved DB. Dedicated credentials cannot access other tenants. Same schema and company rules as pooled mode.
4. Tenant lifecycle/provisioning admission, write freeze mechanisms, durable transfer operation IDs, idempotent retries, route version/fencing, consistency and rollback markers; account for in-flight HTTP operations, active DB transactions, queued jobs, stale workers, cache and outbox events.
5. **Pooled-to-dedicated migration:** consistent snapshot under supported isolation/write coordination; copy tenant rows and linked records, validate IDs, FKs, row counts, checksums and bytes for applicable media/files; delta replay or approved bounded write freeze; verify destination, atomically update authoritative route generation, reject stale generation, unfreeze and validate. Keep source until retention policy permits cleanup; never delete source pre-acceptance.
6. Failure tests at every stage (before copy, during copy, before cutover, during route switch, after cutover), repeated execution, recovery and pre/post-switch rollback/forward-only rules; document controlled manual operator intervention where exact automatic reversal is unsafe.

**Mandatory matrix:** Tenant A and B in same pooled DB, Tenant C in dedicated DB; company X/Y fixtures; parallel requests and pool reuse; missing context, forged route, owner/superuser bypass, `SECURITY DEFINER`, views, raw SQL, joins, writes, bulk and exports; suspended/revoked access; stale route/job; transfer integrity and failures. Confirm no unauthorized read, write, inference or cross-tenant cache/file leakage.

**Gate:** all real DB/API/worker negative tests PASS, including migration and rollback; approved freeze window policy recorded before functional transfer activation.

### Phase 05 - GLOBAL IDENTITY AND TENANT/COMPANY AUTHORIZATION

1. OIDC integration with well-validated issuer/audience/signature/key rotation/nonce/state, secure session/cookies and MFA policy. Provider chosen under owner gate. A locally deployed compatible identity provider is acceptable for repeatable verification, not as silent production provider choice.
2. Separate global identity from tenant membership, company membership and role grants. Users may belong to multiple tenants and distinct subsets of companies. Admin account management, membership change, role revocation, tenant switching and temporary privileged access must be explicit and auditable.
3. Authorize at use-case/service and resource boundary; tenant membership and company ownership are rechecked, not trusted from browser claims alone. Define company-shared vs company-private resources and cross-company visibility matrix. Enforce separation of duties for privileged and finance-approving operations when applicable.
4. Reject forged headers, JWT kid/alg confusion, revoked/expired tokens, stale caches, suspended tenants, stale route generations, privilege escalation, confused deputy service-to-service calls and cross-tenant object IDs. Token/session invalidation semantics and maximum revocation latency documented and tested.
5. Platform operator roles must not imply unrestricted business access; use explicit time-bounded break-glass policy, consent/dual control where approved, audit and least privilege.
6. Integrate login/session/role flows through both API and browser; remove temporary untrusted/test admission from production paths.

**Gate:** real authenticated API/browser/provider-like flows prove cross-tenant and cross-company denial, revocation, scoped permissions and least privilege in pooled and dedicated storage. Required OIDC and support-access decisions approved.

### Phase 06 - LEGAL COMPANY AND ORGANIZATION DOMAIN

1. Model tenant -> legal company -> optional branches, operating units/departments and cost centers, with validated hierarchies and no cycles. Companies own accounting books/tax setup and stock ownership boundaries; do not conflate cost center with ledger or branch with tenant.
2. Canonical company ID/tenant ID constraints and resource ownership rules; shared resource visibility must be explicit. Never let a company-scoped FK point into another tenant or unauthorized legal company.
3. Organization module owns legal entities, branches and organization policy. **Inventory module owns detailed warehouses, stock locations, movements and valuation** when implemented in Phase 10; Phase 06 defines just the company-to-warehouse contract and any minimal fixtures genuinely needed for integration tests. This resolves roadmap shorthand without creating duplicate owners.
4. Define intercompany transaction contracts (not full postings yet) and company closure/archiving guardrails. Company disable/archive must not erase posted financial records.
5. Build necessary company/branch/admin APIs and UI with company picker reflecting real memberships.

**Gate:** database and HTTP/UI tests for multi-company ownership, company-role filtering, nested org integrity, legal-company isolation, allowed sharing, forbidden links, and both tenancy modes.

### Phase 07 - PLATFORM RELIABILITY, OPERATIONS AND CROSS-CUTTING SERVICES

1. Transactional outbox written in the **same ERP transaction** as the business change; publish asynchronously with durable delivery state, safe ordering where needed, retries, exponential backoff, dead letters, replay and business-level idempotent consumers. Do not claim exactly-once delivery.
2. Tenant-aware workers: verified tenant and generation, authorized storage routing, bounded worker concurrency, safe redelivery/cancellation, explicit job ownership and provenance. No tenant context leak across tasks.
3. Authorized S3-compatible media: tenant/company ownership, safe object keys, per-object authorization, signed URLs where needed, malware/content checks as applicable, upload limits, integrity/versioning and deletion/retention. Never trust a media key from another tenant.
4. Cache, queues, search/report/export keys and event envelopes include validated tenant and company scopes. Enforce data-minimizing telemetry and safe customer identifier cardinality.
5. Entitlements, rate limits, quotas, usage metering, feature flags, activation/suspension and cross-service admission. No silent service bypass on control-plane outage; design deliberate fail-safe policies by operation class.
6. Security audit and privileged/financial action audit, immutable/tamper-evident retention design as approved; correlation/tracing, metrics, alerts, operational dashboards, secure secrets and key rotation.
7. Implement and rehearse backup, recovery, tenant-specific restoration, pooled restore without clobbering other tenants, dedicated DB restore, schema fleet repair, incident response, source retention and DR runbooks. Provider choices and approved RPO/RTO/availability/retention requirements are due.
8. Localization foundation supports approved UI languages/time zones, consistent UTC persistence and local business dates, RTL if selected, tenant/company locale defaults and format-only fallbacks. Do not invent supported market language requirements.

**Gate:** forced crashes, duplicate/delayed messages, worker restart, failed upload, cache poison, revoked access, outages, backup restoration and alert delivery have measured tests and evidence in both storage modes. No security/data-integrity leak or duplicate financial effect.

### Phase 08 - MANDATORY FOUNDATION CERTIFICATION: DO NOT SKIP

Stop **all ERP business-domain work** until this is fully certified. Build executable scenario suites, run them in disposable and representative environments, collect real traces/logs/artifacts/DB proofs, and fix every critical failure.

Certify at least:

- Two pooled tenants + one dedicated tenant with shared canonical logical schema; tenant/company negative access cases.
- Actual runtime RLS (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, upserts, raw SQL, imports, exports, views, functions, background jobs, cache/files/events/search).
- Dedicated credential isolation, route-generation validation, connection pool sharing and reuse under parallel load, timeout/cancellation/error paths, admission failure when control-plane state changes.
- Real OIDC validation, scoped company RBAC, revocation, MFA policy and privileged access; deny-by-default everywhere.
- Provisioning, suspension, move pooled -> dedicated, mid-transfer injected crashes, retry, freeze, checksum, cutover, rollback and later source-retention policy.
- Migration fleet parity, partial failure, hash drift, compatibility window, repeated application, controlled rollback/recovery.
- Job queue/outbox replay, duplicate messages, file isolation, cache invalidation, cross-tenant exports/reports and audit.
- Container/Linux CI, real browsers, API integration, running workers and observability/alerts.
- Backup and restore including **single pooled-tenant recovery that leaves others untouched**, dedicated recovery, deleted/failed fixture restore, recovery documentation.
- Approved numerical workload, concurrency, p95/p99 latency, capacity/DB connection budget, availability/RPO/RTO, maintenance window. Use actual measurements and environment descriptions; failed thresholds = FAIL, missing thresholds = BLOCKED, not PASS.
- No high/critical vulnerability left unmitigated, no known isolation break, no secret in repository, no acceptance test skipped.

Every item needs **an actual executable test and evidence**, not a diagram, mocked provider-only unit test, or script that merely detects a missing fixture. Independently inspect schema, role privileges, SQL policies, isolation and recovery receipts. Review for missing failure paths. Phase 08 PASS requires an auditable acceptance matrix and complete operator runbooks. Only then enter Phase 09.

### Phase 09 - SHARED ERP MASTER DATA

Implement real owner-scoped modules and UIs for business partners, customer/supplier roles, contact/address data and tax identifiers; product catalog, categories and variants; units and exact conversions; base/display currencies, currencies' decimal handling and rates; pricing/tax configuration (only approved jurisdictions), price-list visibility, document numbering and controlled extensibility. Define and enforce tenant-shared versus company-owned instances. Add legitimate admin setup screens and workflows, import/export and validation. Version migrations, APIs and events, negative authorization, decimal/tax configuration consistency, concurrency and both tenancy modes. No arbitrary per-tenant schema forks, fake locale packs or default financial policy. Gate: traceable CRUD/lifecycle, cross-company sharing, permissions, precision, uniqueness, migration and UI acceptance.

### Phase 10 - ACCOUNTING AND INVENTORY CORES

**Company-scoped Accounting:** chart of accounts, fiscal calendars/periods, ledger ownership, currencies/FX policy, financial dimensions, draft -> approved -> posted transitions, balanced double-entry journals, noneditable posted records, reversal/adjustment, close/reopen guards and document sequencing. Explicit AR/AP foundations with reconciliation. Monetary arithmetic uses precise decimal or safe scaled integers, never binary floats for money. Every currency rounding/valuation behavior follows approved policy, not a fixture default. Prevent unbalanced/duplicate postings using DB constraints, transaction boundaries, lock/retry discipline and idempotency.

**Company-scoped Inventory:** warehouses and locations (sole owner = Inventory), receipts/issues/movement ledger, stock counts/adjustments/transfers, availability vs reservations, lot/serial only if approved, company ownership, valuation/cost layers per approved method, returns and revaluation. Verify no negative-stock violation according to approved policy, row/lock-safe concurrent reservation and issue handling, traceable adjustments and postable accounting effects. Distinguish internal location transfer from intercompany trade.

**Cross-module consistency:** explicitly orchestrated atomic operations via published domain ports inside a **single tenant ERP DB transaction** when atomic business invariants require it; no unrestricted repository calls into another module and no cross-control-plane distributed transaction fantasy. Use transactional outbox for outside-DB effects. Tests must prove immutable journals, balances, reversal, date-period locking, no double post, no negative stock per policy, valuation/GL reconciliation, concurrency races, crash recovery and both tenancy modes.

### Phase 11 - ORDER-TO-CASH, PROCURE-TO-PAY, BANKING

Implement the approved exact lifecycle and UI flows for quote/order, purchase request/order, approval, fulfillment/receiving, invoice, payment, refund, credit note, sales/purchase returns, settlement and reconciliation. Explicit document state machines with allowed/forbidden transitions and permissions, tax/price/currency/discount precision, stable numbering, duplicate prevention, idempotent retries, partial deliveries/receipts/payments and cancellations. The relevant goods and money effects reconcile with stock ledgers, AR/AP and GL; distinguish reversible drafts from reversed posted artifacts. Approved provider integrations only; do not fake bank settlement. Prove end-to-end business transaction invariants under failure, retries, concurrent processing, cross-company access and both tenant modes.

### Phase 12 - REPORTING, INTEGRATIONS, RELEASE

Build financial statements (trial balance, balance sheet, P&L, AR/AP aging and reconciliations), stock/valuation reports, operational purchasing/sales reports, tenant/company-authorized consolidation views where actually approved, protected exports, filters and drilldowns. Finish actual supported ERP workflows in tenant-facing Next.js UI and SaaS operator controls (provisioning, tenant health, entitlements, storage mode/transfer, schema fleet, alerts, audit). Implement approved integrations and stable contracts. Verify end-to-end report reconciliation to immutable ledgers and movements, query efficiency, report/row-level security and both tenant modes. Perform upgrade/deploy/rollback rehearsals, load and DR, accessibility/responsive/RTL for approved locales, secret/security/license review and operator training runbooks. Release gate requires current successful CI, measurable SLO/DR acceptance, financial integrity, independent security checks and explicit owner release approval. Do not claim compliance certifications that were never assessed.

## 7. Mandatory cross-cutting adversarial test catalogue

For every changed cross-cutting component, extend the permanent test matrix:

- **Trust boundary:** missing/forged/expired tenant claim; membership removed mid-request; disabled company; stale worker; invalid route generation; suspended tenant; control-plane outage; revocation and cache staleness.
- **PostgreSQL escape routes:** superuser/table owner/BYPASSRLS confusion, `FORCE ROW LEVEL SECURITY`, SECURITY DEFINER, views, `COPY`, raw SQL, unsafe maintenance roles, `SET` vs `SET LOCAL`, rollback/reset after transaction, connection reuse and nested/parallel transactions.
- **Keys and constraints:** composite `(tenant_id,id)` FK, same-company FK where required, tenant-aware unique indices, null/soft-delete semantics, orphan writes, cross-company reporting, prohibited archival of referenced legal records.
- **Transactions:** double submit, stale revision, duplicate delivery, deadlock/serialization failure, optimistic-lock collision, partial commit, retry after timeout, message crash between DB commit and publish, refund/reversal overlap.
- **External boundaries:** object IDs and signed URLs, wrong tenant file key, cache/session poison, notification recipient mismatch, export/email attachments, metric/log PII, search/filter leaks, webhook origin/signature/replay.
- **Transfer and DR:** source snapshot inconsistency, copy retry, delta gap, cross-tenant data included, writer not frozen, cutover race, bad migration checksum, rollback after cutover, partial restore of pooled tenant affecting another, corrupted backup and timeout budget.
- **ERP invariants:** unbalanced journal, mutated posted record, closed period posting, race on number sequence, concurrent insufficient stock, mismatched lot/serial, valuation drift, AR/AP mismatch, FX rounding, tax scope mistakes, intercompany flow without accounting pair.
- **Operational:** startup with missing secrets, provider outage, retries without limit, connection storm from dedicated tenants, noisy tenant, CI platform differences, native dependency/library/version drift, unsupported browsers and UI permission bypass.

Use at least one positive and negative case per security-sensitive trust boundary, with running-process tests and actual restricted SQL roles. No `skip`, fake receipt, mocked external results as sole evidence, test deletion or broad suppression to satisfy a gate.

## 8. Required quality policy and definition of DONE

A phase is **not DONE** unless:

- Its implemented behavior matches its accepted scope; no fake CRUD, stub service or decorative empty module is counted.
- Data model, constraints, migrations, domain invariants, application use cases, public API, UI, events/workers and docs are consistent where that phase touches them.
- Both pooled and dedicated modes work for relevant features and company authorization behaves identically.
- All mandatory live DB, service, browser, worker, fault/recovery and CI tests pass with verified receipts tied to a concrete source SHA.
- No known open critical security/isolation/ledger/stock correctness issue remains. High-severity risks are assessed and either fixed or legitimately block release.
- No accepted architecture drift, duplicate source of truth, hard-coded tenant credential, secret leak or obsolete runtime dependency is introduced.
- Backup/rollback/recovery and operational changes are documented and actually exercised where relevant.
- Owner-controlled parameters due at this gate are recorded as **approved actual decisions**, not filled from a developer guess or demo fixtures.
- The phase gate script returns a genuine `PASS` and report/verification files agree with source and observed runtime.

Use supported framework versions/pinned lockfile, strict TypeScript, DTO validation and safe errors, deterministic dependencies, validated migrations, separation of build-time vs runtime credentials, least privilege, appropriate indexes with query-plan/load verification, and consistent lint/format/testing conventions. Enforce contract evolution and backwards compatibility where data is already used; do not rewrite applied migrations. Prefer correct root-cause solutions over patches. If a design is genuinely wrong, fix it comprehensively across all layers and record rationale rather than retaining a flawed assumption.

## 9. Legacy retirement and preservation

The old Catalog/Identity/Media/Inquiries/Gateway source, four old DBs and original 71 models are **not** the new ERP. Do not silently reintroduce their service boundaries, database coupling or old single-company assumptions. Reuse only audited, testable domain logic/media tooling compatible with the approved architecture. Keep legacy sources excluded from target runtime and dependency graph. Inventory obsolete references in package scripts, CI, Docker, docs, object paths and admin UI. Retire old code/configuration **only after** target replacements are verified and all dependent callers switched. Protect committed source history, preexisting uncommitted work, database data, media, backups and external resources. Deleting legacy data or provider resources requires a separately approved disposition and verified backups; the existing `.local` source snapshot is not a database/object backup.

## 10. Delivery mechanism: work continuously but never lie about a gate

Maintain the following source-controlled evidence:

- `docs/implementation/STATUS.md` - one-page truth table for phases 01-12, active gate, SHA, blockers and next exact command.
- `docs/implementation/phases/phase-XX.md` - per-phase implemented behaviors, changed files, decisions, risks, actual tests and cutover/rollback.
- `docs/implementation/phases/phase-XX-acceptance.json` and `phase-XX-verification.json` or the existing canonical machine state paths. Reuse the established schema; do not fork parallel status systems.
- `docs/specifications/phase-01-decisions.json` - approved owner numbers and deadlines when legitimately supplied, never invented.
- `documentation/decisions/` - canonical, reviewed ADR numbering; supersession rather than rewriting history.
- Reproducible scripts/CI evidence for actual integration, tenant/company security, migrations, workers, transfers, recovery, performance and UI.

At the end of **each actual working session** report compactly:

1. Exact commit/branch and phase gate status.
2. Implemented source/schema/API/UI/worker/infrastructure changes (not just documents).
3. Test commands with PASS/FAIL/BLOCKED, counts, environment, SHA and CI URL.
4. Known open issues and owner decisions due **now**, not speculative future questions.
5. Exact next action and runnable command; leave the repo consistent so the next session starts without re-planning.

Do not announce that you will work asynchronously or that all 12 phases are finished unless the running environment actually completed them. Continue into the next phase within the currently available session after each verified gate. If execution-time limits terminate work, persist a precise restart checkpoint. Do not turn time limits into a false "PASS".

## 11. Immediate commands and next step

1. Inspect `git status`, HEAD, accepted requirements and the `0973610...` GitHub Actions run; check its **actual completed result** for `run 38065009923` and all required steps.
2. Reconcile the Phase 02 acceptance artifacts; mark PASS only after evidence is verified and the gate tool confirms. Do not redo Phase 01 or rebuild already passing Phase 02 functionality.
3. Inspect the Phase 03 owner-decision deadlines and record their exact status. **Do not ask the owner to buy hosting, supply a deployment budget, choose a cloud service, or guess production capacity merely to run local development.** Build and test against disposable local PostgreSQL/Docker now. Use clearly labeled local test limits and measured connection data, never pass them off as approved production SLOs. An unmet accepted owner-decision gate stays BLOCKED; complete all independent work before requesting only the actual missing decision needed to accept that gate.
4. Complete all Phase 03 work safe under current authorization, with real PostgreSQL proofs. Do not stop at a paperwork request while database, security, migration, transaction and isolation implementation can continue safely. Do not override missing approvals, however; resolve a genuinely unpassable gate with one consolidated, minimal request only after all independent tasks are complete.
5. Proceed one verified gate at a time through Phase 08 foundation certification and then Phases 09-12. Do not stop at scaffolding, early green unit tests, documentation or a single happy path.

**Continue with the additional non-optional execution contracts and acceptance matrices below. They are expansions of the approved plan, not new product scope or permission to overwrite owner decisions.**

---

# PART II - DETAILED ENGINEERING CONTRACTS AND NO-OMISSION CHECKLISTS

The instructions below make the existing approved roadmap executable. They do not change the scope or allow invented owner decisions. If an implementation detail is already fixed more specifically by an accepted ADR or source contract, use that accepted detail and record any discrepancy. Treat a conflict as a design defect requiring reconciliation, not permission to create two implementations.

## 12. Execution autonomy: precisely when to continue and when to block

### 12.1 Continue without requesting permission for normal engineering

- Inspect source, tests, existing local infrastructure and CI receipts; diagnose failures and implement fixes.
- Add necessary source modules, constraints, migrations, locally runnable identity/provider fixtures, tests, CI, documentation and operator scripts within the approved target.
- Run repeatable disposable Docker/PostgreSQL processes, automated browsers and local benchmark harnesses; clean up only fixtures positively identified as owned by this run.
- Create reviewed changes on a working branch and use the repo's ordinary review/CI process. Do not overwrite unrelated work or force-push.
- Refactor conflicting *target* scaffolding when a proven defect requires it; preserve conceptual architecture, source provenance and accepted domain ownership.
- Fix flaky tests by correcting their causes or isolating controlled nondeterminism; never weaken assertions, increase timeouts blindly, or mark false positives as passing.
- Progress to the next **accepted** phase automatically when the exact current gate is PASS and required authorization already exists.
- After any unavoidable session/tool interruption, resume from persisted status, not from scratch. Never claim that work continues in the background while no execution environment is running.

### 12.2 Only request owner intervention when truly necessary

- A change to an accepted architecture decision, irreversible handling of valuable business data, production/cloud credential access, live hosting configuration, an external purchase, legal/compliance interpretation, launch geography, or a genuine business-policy choice.
- A mandatory numerical/operational requirement reaches its **agreed hard gate** and cannot safely be established from accepted records. Produce measured technical options and trade-offs without inventing business approvals.
- A real destructive or external-facing deployment operation outside previously granted authorization.
- A material ambiguity that could cause incompatible financial, inventory or legal behavior and cannot be deferred behind disabled functionality.

**Never repeatedly ask:** "May I continue?", "Should I use the approved architecture?", "Should I make the tests pass?", "What should I build next?", "What hosting should I buy?", or "How much should the system cost now?" Such questions are not legitimate phase-implementation blockers.

**Do not confuse three different numbers:**
1. A **local engineering fixture limit** selected only to exercise repeatability/fail-closed behavior.
2. A **measured capacity** produced by a documented benchmark environment.
3. An **owner-approved production NFR/SLO**. Only the third satisfies an owner-dependent launch or certification threshold. Record all three distinctly, without promoting one to another.

### 12.3 Block semantics and partial progress

- `NOT STARTED`: no implementation or accepted test execution for this phase.
- `IN PROGRESS`: authorized implementation underway; gate incomplete.
- `PASS`: every mandatory criterion and due decision has current, source-SHA-bound evidence.
- `FAIL`: an executed mandatory check demonstrably failed; fix and rerun.
- `BLOCKED`: a necessary test, credential, environment or approval is genuinely unavailable; identify exact missing item and unaffected work that was completed.
- `PROPOSED`: design choice or ADR suggested but not approved; cannot become authority by coding it.

One blocked criterion never licenses skipping it, nor does it require abandoning other independent safe tasks. It may prevent the phase's PASS and the next protected phase's activation.

## 13. Every-change root-cause and impact procedure

For **each** schema, contract or behavior change:

1. State the requirement and the already-accepted business/architecture decision it implements.
2. Trace source owners, callers, routes, DTOs, role checks, domain aggregate, ports, adapters, database constraints, transactions, outbox, worker, frontend state, tests, docs and operational flows.
3. Identify the true source of incorrect behavior rather than correcting only a visible symptom.
4. Record security boundaries: principal, tenant, company, privilege, database role, object storage, service identity.
5. Identify read/write consistency, isolation, connection use, replay/idempotency, failure, rollback and migration impacts.
6. Add positive, negative, concurrency and failure-injection acceptance tests **before or alongside** implementation.
7. Implement a coherent narrow change; avoid speculative base repositories, "generic service" abstractions and copy-pasted logic.
8. Run focused tests plus applicable cross-boundary regression; fix every failure or explicitly block a dependent gate.
9. Update published contracts, OpenAPI, migration history, versioning, runbooks and architecture validation together.
10. Prove no duplicate source of truth or newly active legacy dependency remains.

For large replacements use: **introduce correct implementation -> verify -> switch all dependent callers -> verify parity -> retire obsolete implementation**. No deletion of a referenced component until its dependents are removed or switched safely.

## 14. Physical boundaries, ownership and repository enforcement

### 14.1 Five applications are not five business microservices

- `apps/erp-api`: one composition root for all implemented transactional ERP modules and the trusted tenancy/security infrastructure.
- `apps/erp-web`: tenant-facing ERP user journeys and company-scoped administration.
- `apps/platform-api`: operational SaaS control plane. Must never expose direct ERP data access merely because it has operator identity.
- `apps/platform-admin`: SaaS operator UI, separated from customer operations.
- `apps/worker`: process/container for approved background handlers; deployable worker processes may be scaled, but do not introduce separate business ownership databases.

One logical business core may have multiple runtime replicas/processes. Shared deployment code is not permission for one module to access another module's tables or internal repositories.

### 14.2 Allowed module dependencies

- `domain`: pure invariants, value objects, aggregates, domain events; no NestJS, Prisma, SQL, HTTP, filesystem, clocks/random generators tied to runtime globals or other module internals.
- `application`: orchestrates use cases and typed ports; domain dependencies; explicit authorization policy; transaction ports/UoW; published cross-module contracts only.
- `infrastructure`: reviewed persistence/provider adapters implementing ports, migrations, storage/retry infrastructure; no duplication of business policy.
- `presentation`: Nest controllers/transport adapters, request validation, safe errors and output DTOs; do not bypass application use cases.
- `packages/shared-kernel`: genuinely shared stable value types (e.g. IDs, Money if domain requirements permit); **not** generic business repositories or unrelated module entities.
- `packages/contracts`: typed public API/event contracts and versioning; never import the ERP API runtime or adapters.

Reject by automated AST/boundary tests: deep imports across modules, unauthorized table writes, cyclic module imports, dynamic-loader bypasses, transitive domain-to-framework dependencies, import-path aliases circumventing boundaries and legacy modules entering target production builds. Permit exceptions only via narrowly documented, tested, reviewed public ports.

### 14.3 Ownership register

Maintain one owner per logical business aggregate and one writer of each owned table, excluding reviewed system migration/maintenance paths:

| Bounded context | Owns | Must not own |
|---|---|---|
| Platform tenants | Tenant registry/lifecycle | Customer GL/stock documents |
| Platform provisioning/storage routing | DB assignments, schema fleet state, transfer state | ERP business transactions |
| Platform subscriptions/entitlements | SaaS plans, entitlement state, quotas | GL billing entries unless specifically integrated via published contract |
| Identity/access | Global identities, memberships, grants, revocation | Company fiscal books |
| Organization | Legal companies, branches, operating units, hierarchy | Stock-movement ledger, warehouse inventory detail |
| Business partners | Parties/addresses/party sharing | AR/AP journal entry internals |
| Catalog | Products, categories, SKU/variants, applicable specifications | Stock movement or inventory valuation |
| Pricing/tax | Price rules/tax setup and approved jurisdiction rules | Direct posting into GL |
| Inventory | Warehouses, locations, movement ledger, reservations, valuation | Company legal-entity hierarchy |
| Accounting | CoA, periods, journals, subledger foundations and posting rules | Warehouse location hierarchy |
| Purchasing | Purchase documents/approval states | Inventory movement tables directly |
| Sales | Sale documents/approval states | Accounting journal tables directly |
| Payments/banking | Payment intents/receipts, bank matching/settlement state | Secret control-plane tenant routing |
| Reporting | Authorized read models/exports | Unchecked writes to source aggregates |
| Integrations | External contracts/adapters and sync checkpoints | Business state changes without domain-owned use cases |

An orchestrating use case may coordinate multiple domain-owned ports in the same transaction. **That does not grant ownership of their repositories.** Respect identical ownership rules in pooled and dedicated storage.

## 15. Database topology and schema conventions

### 15.1 Physical topology

Keep at least these distinct responsibilities:

1. **Control DB** for SaaS registry, identities/membership authorization metadata as approved, routing and lifecycle/entitlement/provisioning/migration fleet state.
2. **Pooled ERP DB** containing tenant-owned business tables with tenant predicates, RLS and constraints.
3. **Dedicated ERP DBs** on demand, each using the same versioned ERP schema and tenant/domain logic as pooled mode.

Control DB migrations may be distinct from the **single canonical ERP migration stream**. Do not interpret "one canonical ERP schema" as requiring control-plane metadata inside every tenant database. No business-module-specific PostgreSQL database.

### 15.2 Logical-control schema contracts

Design and implement actual model names with the approved architecture rather than blindly copying these illustrative concepts:

- Tenant: stable ID, lifecycle state, version, timestamps, legal/reference metadata with minimal required fields.
- Storage assignment: tenant, pooled/dedicated mode, allowed physical DB identifier, connection profile reference (not embedded secret), route generation, readiness, schema version, active/inactive state.
- Provisioning operation: ID, tenant, idempotency key, requested mode, durable step/status, attempt, error category, timestamps and recovery checkpoints.
- Tenant transfer: operation ID, source/destination references, snapshot/catch-up/freeze/cutover checkpoints, source-retention metadata, route generation and validation evidence.
- Membership and grant: subject identity, tenant/company scope, role/permission grant, revocation/version, audit trail.
- Migration fleet: database identity/mode, applied checksums, compatibility range, in-flight lease/lock, drift/failure state and last verified version.
- Entitlement: tenant-feature rights, limits, status/validity and admission policy version.

Use unique constraints for active assignments, monotonic routing generations, valid states, idempotent operation IDs and referential integrity. Do not store passwords or access tokens in row payloads or logs. Where registries can race, state transitions must use transaction/compare-and-swap or a proven equivalent.

### 15.3 ERP schema safety rules

- `tenant_id NOT NULL` on every tenant-owned table, including association, audit/outbox and business records where applicable.
- Stable primary identifiers; foreign keys prevent relations between different tenants using composite `(tenant_id, id)` targets and referencing composites wherever needed.
- Company-owned records carry an explicit and constrained company identity; reject same-tenant/wrong-company links where business semantics require company ownership.
- Tenant-scoped uniqueness, soft-delete uniqueness semantics, check constraints, enum/state validity and amount precision are explicitly reviewed.
- Do not use plain global unique `sku`/`document_no` unless their approved business uniqueness scope actually is global.
- Avoid float/double for money; determine appropriate `NUMERIC(p,s)` / precision for prices, quantities, conversion ratios and exchange rates from domain needs.
- Store instants unambiguously (e.g. timestamptz) while distinguishing legal fiscal **local dates**; timezone conversion belongs at approved business boundaries.
- Apply indexes after examining actual authorized query shapes, FK needs, indexes affected by RLS predicates, selectivity and query plans.
- Do not rely solely on application authorization to maintain an invariant expressible by a database constraint.

## 16. PostgreSQL RLS and connection-context implementation checklist

### 16.1 RLS policy obligations

- For each pooled tenant-owned table, inventory SELECT/INSERT/UPDATE/DELETE/upsert/COPY/reporting behavior.
- Apply `ENABLE ROW LEVEL SECURITY`; use `FORCE ROW LEVEL SECURITY` as appropriate for owner-bypass prevention.
- Every read/write policy must have correct `USING` and write `WITH CHECK` semantics for trusted tenant context.
- Missing tenant context must deny access or error safely; it must never default to all tenants or a fixture tenant.
- Restrict runtime database users: no superuser, no `BYPASSRLS`, no table-owner bypass, no migration/admin grants.
- Inspect tables, views and `SECURITY DEFINER` functions for policy bypass and unsafe SQL search paths.
- Keep all direct/raw SQL entry points behind narrowly audited data-access boundaries.
- Do not trust session-level settings that survive pool reuse; establish tenant identity in **the active database transaction** and validate cleanup under commit, rollback, timeout and cancellation.
- Never build SQL statements by interpolating user-controlled IDs, column names, table names or SQL expressions.

**Important nuance:** A PostgreSQL custom session variable alone is not a tamper-proof identity primitive against arbitrary malicious SQL running as the app role. Security must include trustworthy admission, strict server-side query construction and SQL parameterization, least-privileged execution, no untrusted arbitrary SQL entrypoints, and tests of the complete trust boundary. Do not call an RLS policy secure merely because a tenant-ID setting is present.

### 16.2 Transaction-scoped context

The selected ORM/driver must prove all these on real PostgreSQL:

1. Begin a transaction with an authorized, immutable request/job execution context.
2. Select an approved physical pool based on the authoritative storage assignment and routing generation.
3. Set and validate the tenant context transaction-locally, using safe bound parameters/supported SQL functions.
4. Perform all tenant-owned data access on the **same transaction-scoped connection**.
5. Keep nested domain ports within that transaction without accidentally acquiring a fresh unsafely scoped client.
6. Commit or roll back; release the connection with no retained tenant/session state.
7. Reject attempting database access outside the authorized transaction context.
8. On automatic retries, re-establish context inside each new transaction attempt and preserve idempotency.
9. Prove context safety across concurrent tenant A/B jobs, connection exhaustion and physical connection reuse.
10. Handle cancel/timeout/driver errors, pool restarts and stale routing generation without stale or cross-tenant execution.

Test framework-managed ORM calls **and raw SQL**. If the chosen Prisma approach cannot satisfy the above without unsafe hacks, record actual driver/ORM proof and use a reviewed alternative after a formally accepted decision; never downgrade requirements for tooling convenience.

### 16.3 Dedicated DB obligations

Dedicated mode does not mean "no tenant checks needed". Enforce an authoritative tenant->database mapping, restrict credentials to that database, preserve `tenant_id` and scope constraints, validate company permissions and route generations, deny wrong/missing context, and run the same domain/API behavior suite as pooled mode. An accidental connection to another tenant's dedicated DB must be detected, not silently processed.

## 17. Pool budgets, connection routing and lifecycle

- Maintain an **explicit global connection budget** plus bounded control-plane, pooled and dedicated pool subbudgets based on supported database and process limits.
- A tenant is not allowed to create an unbounded `PrismaClient`/driver pool. Cache/evict/reclaim clients and close idle dedicated pools; prove leaks do not accumulate as tenants are accessed sequentially.
- Bound concurrency, queue depth, wait time and connection acquisition; reject overload with a safe retriable outcome rather than opening unlimited connections.
- Distinguish read/write/admin/migration connection roles. A privileged migration connection must never be reused as an ordinary request connection.
- Validate resource behavior after tenant suspension, credential rotation, service restart, partial network outage and a transfer reroute.
- Stale route caches require version/expiry/invalidation behavior and fenced writes; a long-running old worker must not continue writing to a retired source.
- Measured local test budgets may be used to verify enforcement; they are **not approved cloud production budgets**. Record the environment and the largest pool count/concurrent client count actually observed.
- Do not demand hosting purchase just to implement these mechanisms using disposable local databases.

## 18. Tenant lifecycle, transfer and restoration state machines

### 18.1 Tenant lifecycle states

Define explicit transitions for: requested/provisioning/ready/active/suspended/transfer-frozen/failed/retiring/deleted or equivalent **accepted** states. Distinguish a schema-ready DB from an active/authorized tenant. Every transition needs an owning application operation, authorization, durable state, retry key, audit evidence and rollback/recovery rule. Do not add speculative tenant billing states without approved domain needs.

### 18.2 Provisioning sequence

1. Validate operator/service authorization and tenant request/idempotency key.
2. Reserve tenant identity and provisioning operation in control DB.
3. Select allowed storage mode (default pooled, approved dedicated where appropriate).
4. Establish/verify physical resource and restricted credentials using disposable/provider abstraction, without placing secrets in registry rows.
5. Apply canonical schema/migrations; confirm checksums/constraints/roles.
6. Initialize tenant-scoped metadata with transaction protection; reject partial duplicates.
7. Verify DB readiness and authorized principal paths.
8. Publish a single authoritative active route **only after** readiness evidence.
9. On failure, preserve durable retryable state and clearly distinguish safely reclaimable empty fixtures from potentially valuable data.

### 18.3 Pooled to dedicated transfer

Implement and test an actual state machine, e.g. `REQUESTED -> PREPARED -> DESTINATION_READY -> COPYING -> VERIFYING -> FROZEN -> FINAL_DELTA -> READY_TO_CUTOVER -> ROUTE_SWITCHED -> ACCEPTED -> SOURCE_RETAINED -> CLOSED`, with explicit FAILED/RETRY/ROLLBACK branches. This example is not an override of accepted state names.

Mandatory invariants:

- A deterministic, authorized, idempotent transfer operation with an exclusive per-tenant operation lock.
- Consistent source snapshot and a documented data-capture method; prevent snapshot + concurrent writes from leaving gaps.
- Write freeze or implemented delta catch-up with bounded lag; never merely copy rows while accepting unrestricted new source writes.
- Copy tenant-owned relations in FK-safe order; preserve IDs and ownership, audit/event continuity, sequence/numbering semantics and approved file associations.
- Validate rows, constraints, key counts, canonical hashes/checksums and file bytes/metadata where included; log discrepancies without exposing sensitive content.
- Fence/reject stale API/worker/outbox executions using monotonically increasing authoritative routing generation.
- Route publication uses durable control-plane coordination; accept that control and ERP DBs have **no distributed ACID**.
- A cutover must have explicit pre-switch cancellation/rollback and post-switch forward-recovery/compensation rules. Never promise universal automatic rollback after new destination writes begin.
- Preserve source rows until the owner-approved retention/disposition gate is met; no early deletion.
- Test app restart, lost network, connection/pool reuse, operation repeat, partial file failures, stale cache and transfer crash at each checkpoint.

### 18.4 Restore and failure domains

- Separate physical backups from source Git snapshots.
- Test a whole dedicated tenant restore to a new disposable DB and verify integrity/access.
- Test recovery of **one tenant from a pooled DB** without overwriting or rolling back unrelated tenants' newer data.
- Document point-in-time recovery limitations, tenant-specific restoration strategy and effect on outbox/externals; replay must not duplicate business effects.
- Test at least one deliberately corrupt/incomplete backup or incompatible schema to prove fail-safe rejection.
- Verify operational keys and passwords are not leaked to evidence files.

## 19. OIDC, membership, scoped authorization and platform operator safety

### 19.1 Identity chain

- Browser and API clients authenticate via approved OIDC integration and correct authorization-code/PKCE flow as appropriate; validate issuer, audience, signature, state, nonce, expiry, token type and JWKS rotation.
- A valid global identity **does not** grant membership in any tenant or company.
- Resolve tenant using authorized membership, lifecycle and request context; then resolve the storage assignment. Never accept a forged tenant parameter as the sole proof of membership.
- Check permission for the actual use case and resource ownership at server-side application boundary, not solely at UI/navigation.
- Apply company scope and sharing policy to every read and mutation; mass-assignment of `company_id`, `owner_id`, or role is prohibited.
- Test default-deny: no membership, revoked membership, expired session, suspended tenant, disabled company, unavailable admission control.

### 19.2 Authorization matrix

Include distinct principal classes:

- Platform operator, platform service identity, tenant admin, company admin, finance officer, warehouse operator, purchasing user, sales user, read-only auditor and unauthenticated principal, as applicable to implemented workflows.
- Explicit tenant membership, company membership, scoped grants, read/write/approve/post/transfer/export capabilities.
- Separation of duties on financial approval and posting wherever required by approved business policy.
- Resource ownership checks for reference-by-ID and bulk/list/export operations.
- Permission/suspension changes tested against active sessions and queued jobs, not just next login.

### 19.3 Platform security

A SaaS operator may manage tenant lifecycle and infrastructure without automatically reading customer ledgers. Break-glass/support access requires explicit policy, permission/time limit, audit, any approved dual-control and revocation. Store no secret bypass user or universal tenant ID. Prove platform-admin and ERP-admin routes cannot be confused through cookies/role claims.

## 20. ERP money, stock, transactions and concurrency contracts

These invariants must be specified early and fully implemented in their assigned Phase 09-11 domains; no financial posting in earlier infrastructure phases.

### 20.1 Money, tax and fiscal periods

- Use exact decimal types and explicit scale/rounding by approved policy; never binary float for business money.
- Keep transaction currency, reporting/base currency and exchange-rate provenance distinct.
- Distinguish tax-inclusive/exclusive lines, approved tax jurisdiction and rounding scope; do not invent tax logic or claim legal compliance.
- Define period calendar, effective posting date, lock/close rules, backdating restrictions and controlled corrective operations before posting implementation.
- Every document number has a clearly defined tenant/company/type/period scope and race-safe unique generation.

### 20.2 Double-entry posting

- Each posted journal is balanced in its currency/approved accounting basis; reject empty, unbalanced, cross-company or cross-tenant lines.
- Posting is atomic with its journal lines, state transition, idempotency record and applicable dependent within-database effects.
- Posted entries are immutable except explicitly allowed metadata governed by policy; corrections are reversals/adjustments, not arbitrary edits/deletes.
- A closed period rejects posting/reversal as defined by approved period controls.
- Prevent duplicate events/HTTP retries from generating a second business posting.
- Build independent reconciliations: trial balance, subledger summaries and reversal relationships; verify against actual committed rows.

### 20.3 Stock and valuation

- Inventory is owned by a legal company. Location hierarchy and stock custody are explicit.
- All on-hand changes derive from authorized movements; balances may be projections but must reconcile to source movements.
- Reservation is distinct from stock ownership and must not count uncommitted or expired quantity as available.
- Cross-location transfer and cross-company trade are different operations.
- Prevent races on the same SKU/lot/location under concurrent receipt, issue, reservation and count operations.
- Validate supported lot/serial uniqueness and expiry/traceability **only where approved**, without inventing a required industry scope.
- Implement approved cost/valuation method (e.g. weighted average or FIFO only after selection) and reconcile valuation entries with GL under the approved posting rules.
- Negative-stock, backdating, returns and cost recalculation are **owner-policy decisions**, never silent defaults or assumptions from dummy data.

### 20.4 Order-to-cash and procure-to-pay

- Document states are explicit and transitions authorized/validated (draft, approved, issued, fulfilled/received, invoiced, paid, cancelled/reversed as applicable).
- Partial fulfillments, invoices, receipts, deposits, returns, credit notes, refunds and cancellations preserve traceability.
- Cross-module commands coordinate via published ports. If atomic consistency is required, execute within **one ERP DB transaction**; external calls use durable outbox and eventual compensation.
- Never claim exactly-once event delivery. Achieve exactly-once business effect with unique constraints, idempotency keys and transaction-safe state transitions.
- Test crash after commit/before HTTP response; duplicate webhook/event; concurrent "post"; reversed invoice; out-of-order partial payment; worker replay; conflicting company scopes.

## 21. Outbox, jobs, files, cache, audit and integration rules

### 21.1 Outbox and idempotency

- Persist domain operation plus outbox message atomically; carry event ID, logical type/version, tenant, company where needed, producer generation, causation/correlation and retry metadata.
- Worker claims messages using lease/visibility, bounded concurrency and per-tenant routing/admission; handles crashes before/after publishing and partial provider timeouts.
- Consumers enforce deduplication through durable inbox/idempotency constraints and business state checks; duplicates must not alter GL/stock twice.
- Retry transient errors with bounded backoff/jitter; classify poison/permanent errors into dead-letter with reviewed redrive mechanism.
- Event payloads do not include unnecessary credentials/PII or entire customer documents; version all contracts and support deployment compatibility.

### 21.2 Object storage and files

- S3-compatible adapter has controlled, tenant-scoped object/key ownership and server-side authorization, not client-controlled object path trust.
- Signed URL expiry, metadata integrity, content-type/size checks, upload/download validation, allowed public/private purpose and file association ownership are tested.
- Media deletion/retention follows approved policy, not legacy assumptions transplanted into ERP.
- Test unauthorized access through a known object key, wrong company attachment, stale link, restored object and transfer/migration.

### 21.3 Cache, reporting and logs

- Namespaced cache and search/report/export data includes tenant plus company/permission scope and meaningful version for revocation/invalidation.
- A cache hit can never bypass tenant/company authorization; an old privileged result must not become accessible after revocation.
- Telemetry may use safe tenant tags only under cardinality/privacy controls; redact secrets, tokens, password-like fields, SQL bind values where sensitive and document content.
- Audit privileged and financial events with actor, tenant/company, action, resource identifier, timestamp, correlation and approved retention; avoid logging sensitive body data by default.
- Support operator reports must not mix tenant data without approved authorization and explicit audit.

## 22. API, frontend and experience obligations

### 22.1 API contracts

- Version REST routes and generate OpenAPI from actual runtime controllers/DTOs; fail CI if checked-in snapshots drift.
- Validate input shapes, unknown fields, pagination/filter/sort limits, IDs, timestamps, decimals, state transitions and localization hints.
- Return consistent, minimally revealing error envelopes with correlation IDs and appropriate 400/401/403/404/409/422/429/5xx distinctions.
- Do not let an HTTP controller directly open an unscoped ORM client or mutate another module's business table.
- Use idempotency keys and explicit optimistic-concurrency/ETag/version controls where operation semantics require them.
- Verify role and company scopes for list, detail, create, update, upload, approve, post, archive, export and bulk operations.

### 22.2 Frontend implementation

- Build actual Next.js flows with login, tenant/company selection, role-limited navigation and routes, loading/empty/error/retry states, server-side enforcement and compatible API contracts.
- UI checks are defense in depth; hiding a button does not constitute authorization.
- Use reusable design tokens, consistent form components, validation errors, tables, dialogs, keyboard interaction, accessibility, responsive layout and documented UX conventions.
- Locale/timezone/RTL behavior must match approved scope and format values correctly; do not hard-code one company's settings.
- On tenant/company switch, invalidate old-scoped client caches, pending mutation results, download links and navigation state.
- Browser E2E must test actual authorized and forbidden workflows; generic health pages alone do not certify ERP functionality.

## 23. CI/CD, developer environment, security and supply chain

- Maintain a reproducible pinned dependency manifest/lockfile, build/test commands and stable Node/Postgres images/versions under engineering policy.
- CI on a clean Linux runner must run install, build, strict TS, lint/format, architecture negative probes, OpenAPI generation/diff, actual PostgreSQL/container tests, browser tests, security scan and fixture cleanup.
- For stages that introduce new features, extend CI with RLS/tenant/company/transfer/worker/financial suites. Never remove earlier test coverage merely to shorten builds.
- Treat Docker test containers as disposable and label them with unique run ownership. Cleanup only owned fixtures; verify no manual/valuable DB is stopped or dropped.
- Separate migration/admin credentials, DB app credentials and provider secrets. Local `.env.example` must contain **names only and harmless example values**; never commit working credentials or private tokens.
- Add static/security checks for injection, dependency vulnerabilities, unsafe redirects, auth misconfiguration, secret exposure and supply-chain changes.
- CI artifacts must identify commit, tool versions, test suite, environment and results. A public green badge is not sufficient if mandatory dependent tests are absent from workflow.
- Rollouts/migrations need explicit compatibility window, health probe, rollback or forward recovery, and alerting. No untested automatic destructive database rollback.
- Ensure source/evidence generated locally is actually checked into the reviewed commit when intended; uncommitted local PASS cannot certify a different SHA.

## 24. Permanent acceptance matrix: implement and run, do not merely list

Maintain stable scenario identifiers linked to test code and actual evidence. Minimum foundation set:

| ID | Scenario | Failure prohibited / actual assertion |
|---|---|---|
| TEN-001 | Pooled A selects/updates its own records | Authorized and constrained |
| TEN-002 | Pooled A selects B rows using guessed IDs | No B data; denied or invisible |
| TEN-003 | Pooled A inserts/updates ownership to B | RLS `WITH CHECK`/FK rejection |
| TEN-004 | Absent/malformed/forged tenant context | Safe failure, never default access |
| TEN-005 | Cross-tenant FK association | Rejected by DB |
| TEN-006 | Tenant-scoped duplicate key | Uniqueness correct within tenant |
| TEN-007 | Dedicated C normal authorized workflow | Same schema/contracts as A/B |
| TEN-008 | Dedicated C wrong database route/credential | Rejected; no other-tenant rows |
| TEN-009 | Same query with raw SQL/bulk/report/export | Identical isolation outcome |
| TEN-010 | Parallel A/B connections reused after rollback | No session context bleed |
| TEN-011 | RLS owner/BYPASSRLS/SECURITY DEFINER review | Restricted runtime cannot bypass |
| TEN-012 | Suspended tenant/stale generation | Admission and writes refused |
| ORG-001 | Two legal companies in same tenant | Ownership isolated where required |
| ORG-002 | Authorized shared master data | Visible only per explicit policy |
| ORG-003 | Forbidden cross-company FK/approval | Rejected by constraints/auth |
| IAM-001 | Authenticated identity without membership | Denied |
| IAM-002 | Revoked tenant/company grant | Old session/job access denied within defined policy |
| IAM-003 | Forged JWT/headers, wrong audience/issuer | Denied |
| IAM-004 | Platform operator reading GL without consent | Denied and audited |
| DB-001 | Reproducible pooled+dedicated provision | Clean, repeatable, schema parity |
| DB-002 | Migration checksum drift | Alert and block affected activation |
| DB-003 | Failed partially applied schema migration | Recoverable, no false healthy state |
| DB-004 | Connection budget under many dedicated tenants | Bounded; backpressure not exhaustion |
| DB-005 | Routing generation after rotation/transfer | Stale worker/request denied |
| XFER-001 | Consistent pooled tenant snapshot | Exact scoped data/keys copied |
| XFER-002 | Write freeze/delta catch-up correctness | No accepted business write lost |
| XFER-003 | Mid-copy/retry restart | Idempotent/resumable |
| XFER-004 | Cutover race with HTTP/worker/outbox | Single authoritative writer |
| XFER-005 | Post-cutover source retention | No premature deletion |
| XFER-006 | Destination mismatch/hash failure | Cutover prevented |
| XFER-007 | Injected failure before/after route switch | Correct rollback/forward-recovery |
| ASY-001 | Outbox crash before/after publish | Eventually processed without duplicate effect |
| ASY-002 | Poison job/retry/dead letter | No silent loss/leak |
| ASY-003 | Cross-tenant file key/signed URL | No unauthorized content |
| ASY-004 | Cache hit after revocation | Cannot bypass authorization |
| ASY-005 | Export/report/search permission filtering | No cross-tenant/company rows |
| DR-001 | Restore dedicated tenant | Data/identity/schema verified |
| DR-002 | Restore one pooled tenant | Other tenants unaffected |
| DR-003 | Corrupt or stale backup | Rejected or safely recovered |
| OBS-001 | Real failure produces trace/log/alert | Correlated without leaking secrets |
| PERF-001 | Benchmarked concurrency/p95/p99/pool caps | Meets **approved**, measured thresholds or BLOCKED |
| OPS-001 | Linux CI fresh checkout/build/e2e | All required jobs green for exact SHA |
| OPS-002 | Container cleanup/nonroot execution | No unrelated resource touched |

For Phase 09-12 extend with:

| ID | Scenario | Assertion |
|---|---|---|
| MST-001 | Shared vs company product/party visibility | Approved sharing honored |
| MST-002 | Unit conversions, money/FX decimal parsing | Exact results, invalid scale rejected |
| ACC-001 | Balanced journal posting | Commit only balanced permitted journal |
| ACC-002 | Unbalanced/cross-company/posting in closed period | Reject without side effects |
| ACC-003 | Duplicate submit, retry after timeout | Exactly one committed business effect |
| ACC-004 | Mutate posted journal | Rejected; reversal required |
| ACC-005 | Trial balance/subledger reconciliation | Reproduces actual rows |
| INV-001 | Concurrent stock reservation/issue | No over-allocation under approved policy |
| INV-002 | Receipt/transfer/count movement traceability | Exact movement->balance reconstruction |
| INV-003 | Inventory valuation -> GL | No unexplained difference per policy |
| INV-004 | Unauthorized cross-company movement | Rejected |
| SALE-001 | Partial fulfill/invoice/pay/return/refund | Document, stock, ledger reconcile |
| PUR-001 | Partial receive/invoice/pay/return | Document, stock, ledger reconcile |
| PAY-001 | Repeated provider callback | No second settlement/journal |
| REP-001 | Company-scoped accounting/export report | No unauthorized company or tenant values |
| UI-001 | Tenant/company switching during pending request | No stale cross-scope data |
| UI-002 | Role-restricted action forced by direct API URL | Denied server-side |

Add tests for all remaining plan requirements, including unusual and adverse flows. The matrix is a **minimum**, not authorization to omit applicable cases.

## 25. Phase-by-phase hard deliverable inventory

The earlier roadmap chapters specify functionality. Use this additional inventory to prevent documentation-only completion:

| Phase | Actual minimum code/data/runtime outputs | Evidence that must exist |
|---|---|---|
| 01 | Approved specifications/ADRs/requirements, no ERP implementation | Owner approval and accepted decisions; already recorded |
| 02 | Five target app entrypoints, CI, Docker, clean workspace, package/layer rules, API/web health, test harness | Successful current hosted CI SHA, Docker+Postgres+browser receipts, synchronized gate state |
| 03 | Control DB + canonical ERP schema/migrations + both storage provisioners + connection/driver transaction proof | Repeatable SQL/schema parity/privilege/drift/pool resource assertions |
| 04 | Tenant lifecycle/router/RLS/pooled->dedicated mover/fencing/rollback | TEN/DB/XFER live negative and crash scenarios |
| 05 | OIDC, actual membership, tenant and company authorization, revocation | Auth provider/API/browser negative tests in both modes |
| 06 | Organization schema/use cases/APIs/UI; company ownership and sharing | Real FK and scoped company HTTP/UI tests |
| 07 | Durable outbox/worker, secure files/caches, entitlements, telemetry and backup/recovery | Crash/retry/file/DR tests and runbooks |
| 08 | Certification harness, load/DR/deployment tests; defects fixed | Every mandatory foundation criterion PASS, approved target values and evidence |
| 09 | Master-data domain/API/DB/UI and import/export where required | Scoped CRUD, constraints, precision and UI E2E |
| 10 | Accounting/stock posting domain/API/DB/UI and atomic integration | Journal/stock/valuation invariants, concurrency and reconciliation |
| 11 | Sales/purchasing/payment lifecycle/API/DB/UI and cross-module posting | O2C/P2P payment/return/duplicate recovery E2E |
| 12 | Financial/stock reports, operator/UI readiness, integrations/release | Production readiness, exact approval and operational proof |

Do not create placeholder code merely to satisfy a file-name count. Deliver actual tested implementations of the responsibilities due in the phase; require complete relevant vertical slices across HTTP/API, domain, database, worker and UI where called for.

## 26. Evidence integrity: machine and human reports

For each mandatory criterion record at least:

- Requirement ID and phase criterion ID.
- Status: PASS, FAIL, BLOCKED or NOT STARTED.
- Exact source commit SHA/branch and working-tree state at time of test.
- Test command and exit code.
- Test runner and OS/DB/runtime versions where material.
- Fixture identification without credentials.
- Start/end timestamp and evidence/log/artifact link or checksum.
- Test category: unit, architecture, SQL/RLS, HTTP/API, worker, browser, Docker, hosted CI, DR/fault or load.
- Observable assertions (not just "test script ran").
- Defect/issue ID and rerun proof if previously failed.
- If blocked, exact dependency, why it is not bypassable, and independently completed tasks.

**Evidence rejection cases:** receipt from wrong commit; old result presented as current; empty/unexecuted test; mock-only result claimed as live database test; skipped test; test runner zero exit with no assertions; fabricated SHA/timestamp; CI workflow missing newly required tests; a snapshot without restore rehearsal; `PASS` despite missing owner numerical target; a test that masks its own failure by swallowing an exception.

Keep one canonical status record: derive `docs/implementation/STATUS.md` as a readable projection of verified phase evidence if helpful. Do not maintain competing contradictory approval documents, duplicate ADR sequences or incompatible status schemas. Preserve historical failed receipts and show how they were corrected instead of erasing evidence.

## 27. Mandatory threat-model questions before accepting security-sensitive work

For every new controller, background task, SQL operation, file route or report, answer in code/tests where applicable:

1. Who is authenticated and who is the acting service principal?
2. Which tenant is authorized and how was that established?
3. Which legal companies may the principal operate on?
4. Which lifecycle states and entitlements permit the operation?
5. Which physical DB route/generation is current and trusted?
6. Which runtime DB role and RLS context are active?
7. Can user input alter tenant/company ownership or route selection?
8. Can the operation be replayed, duplicated, timed out, cancelled or executed concurrently?
9. Are DB changes and outbox changes atomic when necessary?
10. What happens if control DB, tenant DB, queue, OIDC, files or network is unavailable?
11. Does a bulk operation, export, cache or UI preview reveal additional information?
12. Can a privileged/migration role accidentally reach the request execution path?
13. What logs/audit are produced, and do they redact sensitive data?
14. How is a rejected/partially failed operation safely recovered?
15. Is there one authoritative owner/implementation and corresponding negative acceptance test?

If these cannot be answered for a high-risk operation, implementation is not ready to be called complete.

## 28. Safe legacy retirement and final architecture audit

Inventory every legacy component: service process, database schema/model, queue/exchange, route, DTO, web app, package, NPM script, container, migration history, fixture, media tool, absolute path, secret variable and dependency. Mark each as:

- **A - Active target**: satisfies approved architecture, owned by canonical target module.
- **B - Adapted target**: reused only after security/ownership/transaction parity tests.
- **C - Historical/recovery only**: excluded from normal target build/deploy, kept for provenance/import.
- **D - Obsolete and safely removable**: no active caller/data dependency, removal tested and recorded.
- **E - Unknown/blocked**: investigate before deletion.

At a relevant cutover run a dependency graph, route/OpenAPI diff, DB table/constraint inventory, image/compose inspection, active package import graph, and client compile/browser regression. Confirm exactly one production path for each supported business operation. Do not leave an unused compatibility controller active in production or accidentally process both old/new job queues. Do not delete any valuable database/media without a separately authorized, tested backup/disposition plan.

## 29. How to handle mistakes and regressions

When any mandatory assertion fails:

1. Stop only the **affected unsafe operation** and its dependent gate; preserve failure output and evidence.
2. Reproduce deterministically on disposable fixtures where possible.
3. Identify root cause and implicated contract/tenant/company/transaction boundary.
4. Add a regression test that fails for the original defect and passes after the fix.
5. Fix across every affected layer, including migrations/contracts/worker/UI and documentation.
6. Check negative/edge cases and both storage modes; do not fix only pooled or only dedicated behavior.
7. Rerun targeted test, integration/regression matrix and mandatory phase gate.
8. Preserve the original failing receipt, corrected receipt, exact source SHA and residual risk.
9. Update phase status truthfully. Never use broad `try/catch`, ignored SQL errors, disabled security, permanent skipped tests or orphaned workaround code to make a build appear green.

Do not confuse "no mistakes acceptable" with an unsupported assertion of perfection. The enforceable goal is **no knowingly unresolved critical defect and no unverified acceptance claim**. Discovery and correction of defects is a required part of engineering.

## 30. Session-continuity and non-stop-work protocol

At the start of **every** agent session:

1. Read `plan.md`, latest accepted ADRs, target source instructions, owner-decision/deadline register and `docs/implementation/STATUS.md` if present.
2. Inspect branch/HEAD/working-tree and verify evidence belongs to current source.
3. Find the earliest mandatory unpassed phase gate and the next incomplete **authorized** acceptance item.
4. Do not regenerate already accepted documents or re-run a passing phase merely to appear busy. Rerun only checks affected by changed source/environment or necessary for a gate.
5. Make the next real source change, run it, and continue until the phase passes or a genuinely blocking dependency remains.

At the end of **every** agent session:

- Leave source compiling if practical, with no hidden or half-switched production ownership path.
- Record exact open changes, tests already executed, incomplete tests and their reasons.
- Write a deterministic resume instruction: branch/commit, active phase, last passing test and exact first next command/file.
- Leave all runnable test fixtures cleaned up, or document deliberately retained disposable fixtures.
- Continue immediately into the next approved phase **within the same available running session** if its gate passed and owner constraints permit.

Do **not** say "I'll finish later in the background" without an actually configured, supported automation/execution mechanism. Do not declare twelve phases completed after reading this document; completion means real source commits and tests over the time genuinely available.

## 31. Exact starting sequence on the currently verified repository

Perform in order:

1. `git status --short`, `git rev-parse HEAD`, inspect current branch and local user modifications, confirm repository policies.
2. Confirm `main`/working source content and the latest Phase 02 acceptance matrices. Compare `0973610e5fc3c75dda1540c08ed33eaa6998d3bf` to the actual current HEAD; do not assume source has not advanced.
3. Retrieve the hosted GitHub Actions run `38065009923` and verify `conclusion=success` for that exact commit and all mandated job steps. Verify link: https://github.com/MichelDeeb4/business-platform/actions/runs/38065009923 .
4. Update Phase 02 human/machine evidence truthfully to include hosted CI. Run the existing Phase 02 gate script against real receipts. Make the minimum consistent docs/status changes and verify source hash/checksum requirements.
5. Prepare a clean working branch/checkpoint as permitted; never force-push or overwrite another person's changes.
6. Start Phase 03: implement actual control-plane schema, canonical pooled/dedicated ERP migrations, dedicated provisioning, role privilege model, bounded connection manager and ORM/transaction/RLS proof code on disposable local PostgreSQL/Docker.
7. Keep OWNER-SCALE/OWNER-HOSTING deferred values as `null` until genuinely approved. **Do not pause to discuss cloud bills or buy services.** Implement and measure local behavior. Do not mark the Phase 03 gate PASS if an accepted, due owner requirement still lacks approval.
8. Continue to Phase 04-08 when and only when the prior mandatory phase gate is satisfied; perform all owner-independent preparation safely if one aspect is blocked.
9. After Phase 08 passes with real certification, continue to Phase 09-12 in sequence under the unchanged master plan and approved policies.

## 32. Final reporting template (fill with real data)

```text
BUSINESS PLATFORM IMPLEMENTATION CHECKPOINT
Architecture revision: ...
Branch / commit: ...
Active phase: NN - ...
Phase gate: PASS | FAIL | BLOCKED | IN PROGRESS
Completed implementation this session:
- Domain/application/API/database/UI/worker/infrastructure: ...
- Migrations and changed public contracts: ...
Security/consistency review:
- Tenant pooled: PASS/FAIL/BLOCKED with evidence ...
- Tenant dedicated: PASS/FAIL/BLOCKED with evidence ...
- Company auth: PASS/FAIL/BLOCKED with evidence ...
Tests actually executed:
- Command | runner/environment | result | assertion counts | evidence ...
Open critical defects: ...
Owner-controlled decisions required at CURRENT gate: ...
Blocked criteria and why: ...
Legacy retirement: ...
Exact next authorized task: ...
Exact next command/path: ...
```

**FINAL MANDATE:** Execute the approved twelve-phase plan, not another architecture proposal. Keep the control-plane/transactional-ERP separation, the mandatory hybrid pooled/dedicated data design, multi-company ownership, strict domain boundaries, and real security/transaction/recovery proofs. Work through every authorized task without unnecessary pauses. Never invent business parameters, buy cloud services, bypass a gate, delete valuable data, or claim tests pass without source-bound evidence. Reach a fully certified Phase 08 foundation before business posting, then complete the approved ERP core in phases 09-12, with truthful verifiable results.
