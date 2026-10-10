# Phase 01 — Complete target architectural specification

Date: 2026-10-10. Architecture revision: target-specification-2026-10-10-v1. Engineer review: specification consistency and executable design checks recorded below. Owner sign-off: **APPROVED 2026-10-10**, revision target-specification-2026-10-10-v1 and ADRs 030–035 with bounded deferrals.

## Gate and scope

**Current Phase 01: PASS — explicit owner approval and bounded deferrals recorded below.** Initial verification was BLOCKED pending approval; those command results remain historical evidence. Specification checks PASS. Phase 02 is authorized and tracked in [its report](phase-02.md); Phases 03–12 remain NOT STARTED. This is the new plan.md specification phase, distinct from the preserved legacy normalization Phase 01.

Read complete root plan.md and implementation-prompt.md; the supplied Downloads copy was absent, so the repository master prompt and user-provided text govern execution. Read legacy instructions as evidence; the owner's revocation of earlier AGENTS rules and the master plan override legacy service constraints. Review covered canonical ADRs, baseline/architecture guides, composition/transaction/auth/fencing code, schema inventory, test runner/boundary checker, CI and containers. Target direction is accepted through the owner prompt; ADR detail mechanics are proposed for approval.

No ERP application, business module, tenant schema/RLS migration, database/provider configuration or dependency change was implemented. No legacy data/database/object/Git history was removed. Existing modified/untracked changes were preserved. The repository is at C:/Projects/business-platform; root node_modules workspace junctions still target the former Golden_Lift location.

## Actual changed artifacts

- Six required target architecture documents: system-architecture, tenancy-architecture, erp-domain-model, transaction-design, security-architecture, engineering-standards.
- Specifications: foundation-contracts.md; phase-01 acceptance JSON and runnable-design guide; capacity model; owner-decision register and machine state.
- Canonical ADRs 030–035 and documentation/decisions/README.md. Target notices/index added to docs/architecture/README.md and documentation/architecture.md, preserving existing bodies.
- Executable tests: tests/architecture/phase-01-contract.mjs, phase-01-specification.test.mjs, verify-phase-01.mjs; tests/tenant-isolation/hybrid-rls.acceptance.mjs.
- This report, machine verification evidence and phase-01-discovery.json. Private logs/helpers and a recoverable source snapshot remain ignored under .local/target-phase-01.

Discovery reconfirmed five services, fourteen workspaces, four Prisma schemas and 71 model declarations. Source scan of services/database SQL/contracts/platform found no tenant_id, tenantId, CREATE POLICY or ROW LEVEL SECURITY matches (rg exit 1 means no matches). This is source evidence, not a live installed-database audit. HEAD was 54778083efea968eeedf162cab0541f84b4dbb41; the discovery record captures the pre-existing dirty tree and 948 snapshot file hashes. The source snapshot is not a database/object backup.

## Executed verification

| Command / location                                                                    | Actual result                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run check / root (initial invocation)                                             | Shell BLOCKED: PowerShell npm.ps1 execution policy. Retried through npm.cmd without changing policy                                                                                                                                                               |
| npm.cmd run check / root                                                              | FAIL at legacy backend build: contracts cannot resolve; workspace junction inspected and still points to old folder. No root dependency repair performed                                                                                                          |
| npm.cmd ci --offline --ignore-scripts --no-audit --no-fund / isolated source snapshot | PASS: fresh install, 1019 packages                                                                                                                                                                                                                                |
| npm.cmd run check / isolated source snapshot                                          | Backend build PASS: four Prisma clients and backend packages/services. Backend/shared typecheck passed; storefront typecheck FAIL: TS2882 missing CSS side-effect-import declarations in _layout.tsx and category-workspace.tsx; later chained checks did not run |
| npm.cmd run lint / isolated source snapshot                                           | PASS: format, 245-source legacy boundaries, 14 negative probes, four Prisma schema validations                                                                                                                                                                    |
| node scripts/test.mjs unit / isolated source snapshot                                 | PASS: 43 backend unit tests                                                                                                                                                                                                                                       |
| npm.cmd run test:frontend / isolated source snapshot                                  | PASS: 10 frontend unit tests                                                                                                                                                                                                                                      |
| node scripts/check-boundaries.mjs / isolated source snapshot                          | PASS: 245 source files; certifies only legacy checker scope                                                                                                                                                                                                       |
| npm.cmd run doctor / root                                                             | FAIL: all five services/frontend/four databases/native tools/scanner/listeners unavailable; RabbitMQ unreachable                                                                                                                                                  |
| node --test tests/architecture/phase-01-specification.test.mjs / root                 | PASS: 9 executable design tests, zero skips; tests reject omitted dedicated scope, missing role requirements, invalid fixture multiplicity, fake incomplete approval and absent/mock/old runtime evidence                                                         |
| node tests/architecture/verify-phase-01.mjs specification                             | PASS: traceable requirements/scenarios; target runtime acceptance NOT STARTED                                                                                                                                                                                     |
| node tests/architecture/verify-phase-01.mjs gate                                      | BLOCKED by design (exit 2 with propagated PowerShell exit code): owner approval, decisions and numeric thresholds missing                                                                                                                                         |
| node tests/architecture/verify-phase-01.mjs runtime                                   | BLOCKED by design (exit 2): approval and actual release-bound runtime receipts missing                                                                                                                                                                            |
| node tests/tenant-isolation/hybrid-rls.acceptance.mjs                                 | BLOCKED (exit 2): target disposable PostgreSQL fixtures absent; no actual SQL isolation result claimed                                                                                                                                                            |

The isolated clean installation separates current source failures from stale root workspace links. The frontend CSS declaration failure is reproducible on fresh source; no source edits by this phase caused it. The older Identity smoke 404 is historical evidence, not rerun. Current unavailable dependencies supersede older local readiness claims.

Final new-artifact formatting, link/traceability checks and preservation checks are recorded in [phase-01-verification.json](phase-01-verification.json). Specification tests and receipt bookkeeping do not prove runtime isolation, provider behavior or ERP business correctness. SQL probes are real runnable test code but cannot run without the later target fixtures; only their missing-fixture guard has executed.

Not run: legacy PostgreSQL/HTTP integration, process/Identity smoke, installed ORM parity and browser E2E because current databases/services/native dependencies are unavailable. Target database/API/worker/security/load/transfer/DR tests are NOT STARTED because the Phase 01 foundation is not implemented. Hosted CI, container deployment and actual OIDC/S3/broker/provider recovery tests are BLOCKED until selected environments and owner requirements are available. Older passing reports are not substituted for current evidence.

## Acceptance review

| Phase 01 criterion                                      | Status / evidence                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Modular core + separate control-plane physical database | Specified; target fixed by plan, deployment/failure domains documented                                                      |
| Hybrid canonical pooled/dedicated storage               | Specified; same tenant columns/schema/migrations/authorization, A/B pooled and C dedicated scenarios                        |
| Roles/RLS/transaction context/pool proof                | Specified with nonowner roles, FORCE RLS/WITH CHECK, composite keys and conditional Prisma proof; runtime tests NOT STARTED |
| Provisioning/fleet/transfer/rollback/recovery           | Durable states/checkpoints/fences, no distributed ACID, safe pre/postwrite rollback and scoped restore specified            |
| Domain ownership/company sharing/transaction matrix     | Specified; Organization owns legal organization, Inventory owns warehouses; domain ports coordinate one ERP transaction     |
| Identity/security/threat model/contracts                | OIDC, live admission, company authorization, revocation limits, channel isolation and concrete failure contracts specified  |
| Capacity/SLO/product assumptions                        | Model and specific recommendations documented; values OPEN, not approved                                                    |
| Executable acceptance traceability                      | Design tests PASS; real runtime scenario evidence explicitly absent                                                         |
| Conflicting legacy authority                            | Explicit target supersession map in ADR 030; canonical numbering preserved                                                  |
| Owner architecture/product sign-off                     | BLOCKED — approval not supplied                                                                                             |

## Remaining risks and exact next action

Owner review must approve the specification/ADRs and supply or explicitly scope missing launch jurisdiction/workflows/integrations, scale/latency, availability/RPO/RTO/maintenance, hosting/OIDC/budget/on-call, residency/retention/support policy and finance policies. [Decision register](../../specifications/phase-01-owner-decisions.md) defines IDs and deadlines. No approval can be inferred from architecture documentation.

After recorded Phase 01 approval, begin **Phase 02 clean target repository and engineering foundation**: designate target apps/modules, implement NestJS/Next.js shells, manifests/boundary checker, environment/OpenAPI/container/CI/telemetry/test harness, with reproducible clean install/build/start gates. Before touching any valuable legacy data, secure separately authorized database/object backup and import/disposition plans. Phase 03 proves ORM/driver and hybrid databases; Phase 04/05 delivers isolation/auth; Phase 08 must certify both modes before ERP modules.

Do not fix legacy service topology solely for compatibility or silently promote incomplete design/runtime checks. Resume the earliest unpassed gate by rereading plan.md, the master prompt and this report.

## Superseding owner sign-off — 2026-10-10

The owner approved architecture revision target-specification-2026-10-10-v1, ADRs 030–035 and the proposed bounded deferrals, and explicitly authorized Phase 02. Phase 01 is now PASS for the approved architecture/deferral gate. Earlier BLOCKED entries above preserve the results when they were executed. Numeric/business values remain unknown; the approved deadlines are enforced before dependent phases. Source commit: 54778083efea968eeedf162cab0541f84b4dbb41. Phase 02 must pass every acceptance criterion before Phase 03 starts.
