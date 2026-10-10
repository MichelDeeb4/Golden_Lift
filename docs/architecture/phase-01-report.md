# Phase 01 delivery report

Date: 2026-10-10. Baseline: 5477808, clean tracked tree. Scope: repository normalization and architecture baseline only. No automatic Phase 2 implementation is authorized.

## Executive result

The repository was already neutrally named by the preceding committed rename. This task verifies that state, inventories all five services/four databases and one application, adds the ERP architecture baseline and corrects obsolete current-summary prose. Tenant and legal company are now separate proposed concepts. All new business models, RLS, modules and routing remain documentation only.

Phase 01 deliverables are provided with command-specific health and limitations below. The repository is not universally green: the pre-existing Identity smoke still fails at a retired route, installer/CI drift needs a separate task, and hosted/container/provider gates remain unvalidated. These are not caused by documentation changes and do not justify unrelated fixes.

## Findings and implementation plan

The root cause was fragmented current/historical architecture prose and a company-equals-tenant assumption in the earlier audit. The neutral identity itself was already implemented. Discovery read the sole root AGENTS, manifests/lock/aliases, service composition/ports/use cases/controllers, contracts/OpenAPI, schemas/SQL/fixtures, auth/Media adapters, startup/tests/CI/containers and current/dated guides. Filesystem inventory confirms no nested rules, fourteen workspaces and five services.

Before document edits, baseline commands and read-only runtime/DB inspection established current behavior. The plan was: preserve service/data authority -> classify naming -> create linked factual/proposed documents -> reuse ADR authority -> correct current summaries -> verify formatting/links/source hashes/naming and repeat applicable checks. No migration/data impact or old runtime path retirement is needed. Historical reports, SQL and retained business entities stay intact.

## Changes by file family

| Paths                                                      | Result                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| docs/architecture/*.md                                     | Fourteen requested baseline/direction/report documents, including complete 71-model register and proposed module map                                 |
| docs/architecture/adr/README.md                            | Maps six task topics to canonical ADRs; no competing numbering/tree                                                                                  |
| documentation/decisions/025–029                            | Five new canonical decisions; neutral identity remains accepted record 024                                                                           |
| README.md, documentation/architecture.md                   | Link current baseline; correct installed counts, current OpenAPI, pending-feature/deletion/outbox/probe prose while preserving historical references |
| documentation/validation/phase-01-baseline-2026-10-10.json | New command-specific evidence, classified naming inventory and preservation checks                                                                   |

No application source, package/dependency, contract, cookie, environment implementation, Prisma schema, SQL migration, storage key, generated demo PDF or browser snapshot is edited. Private logs/planning/source hashes live under ignored .local/phase-01-baseline. This task does not repeat the earlier database rename or rewrite its dated verification.

## Naming impact matrix

The pre-edit tracked-source scan found 146 remaining matching lines after excluding the two existing audit inventories from recursive scanning. Each was inspected against the earlier classification and current source. One shifted validation line was investigated: a dated old remote instruction, now historical evidence.

| Class                                           | References / outcome                                                                                                                                                                                 | Rationale and action                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: safe active technical identity               | Root business-platform, fourteen @business-platform workspaces, imports/aliases/lock, BP UI, Expo metadata, new platform env prefix, service DB/runtime names and broker topology already normalized | Verify consistency; no second namespace or unused aggregate business-platform-api alias. Individual service/app package names retain their established responsibilities |
| B: historical/immutable identity                | 124 matching lines in historical reports/SQL/fixtures, installed-marker compatibility and immutable migration UUID namespace                                                                         | Preserve provenance and stable IDs; never rewrite migrations or dated results                                                                                           |
| C: business content                             | 15 demo/model/product-code lines                                                                                                                                                                     | Preserve approved example identifiers; generic products/categories/users/Media are not renamed                                                                          |
| D: staged external/infrastructure compatibility | 7 broker legacy-drain/source-allowlist lines                                                                                                                                                         | Keep checked cutover/drain behavior; no automatic queue/object/resource deletion. Actual broker unavailable locally                                                     |
| E: ambiguous                                    | 0 unresolved after investigation                                                                                                                                                                     | No blanket replacement                                                                                                                                                  |

All fourteen workspace/root/lock names agree, active old package namespace is absent, and external dependency/lock versions are unchanged in this task. Existing role/database cutover and 71-table fingerprints belong to the preceding dated rename report, not a new migration here.

The configured remote already points to https://github.com/MichelDeeb4/business-platform.git; it remains operational in configuration and was not changed. If a different remote still has the old name, use GitHub repository Settings -> General -> Repository name -> business-platform, then from that clone run git remote set-url origin https://github.com/MichelDeeb4/business-platform.git and verify git remote -v / git ls-remote origin with authorized network access. Neither network validation nor another remote operation is performed here.

The physical folder retains the supplied workspace name. For a later manual move: stop application/workers and the selected private PostgreSQL cluster, close the IDE, confirm C:/Projects/business-platform is absent, rename only C:/Projects/Golden_Lift to that destination, reopen it, regenerate absolute native paths with npm.cmd run media:tools and npm.cmd run media:setup -- --offline, then start and doctor. Keep private DB/media directories/backups; do not initialize/rebuild them. This is a planned path move, not remaining active project branding.

## Architecture decisions

Accepted: existing neutral identity, service boundaries/database ownership, public contract integration and current security constraints. Proposed: per-service shared tenant tables/RLS, global identity plus memberships, separate legal companies, optional versioned storage routing and module responsibilities. Current-boundary ADRs do not imply new foundations are implemented. Monolith consolidation/service-per-module were compared and not selected for Phase 01; no evidence justifies their migration cost now.

## Baseline verification

| Executed command/check                                      | Before document changes                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| npm install --offline --ignore-scripts --no-audit --no-fund | PASS; installed workspace/lock state unchanged. Not a fresh npm ci or network audit                       |
| node scripts/build.mjs                                      | PASS; four Prisma clients and backend workspaces                                                          |
| npm run typecheck                                           | PASS; backend/shared and storefront                                                                       |
| npm run lint                                                | PASS; formatting, 245-source architecture check, fourteen probes and four Prisma validations              |
| node scripts/test.mjs unit                                  | PASS; 43 tests                                                                                            |
| npm run test:frontend                                       | PASS; 10 tests                                                                                            |
| node scripts/test.mjs integration                           | PASS; 105 real PostgreSQL/HTTP tests on disposable fixtures                                               |
| node scripts/verify-orm.mjs                                 | PASS; 71 models, 714 columns, 76 FKs and installed constraints/indexes/triggers                           |
| node database/scripts/db.mjs status                         | PASS; PostgreSQL 18.6, four DBs/71 tables                                                                 |
| Read-only pg_class/pg_policies/pg_roles inspection          | PASS inspection; zero RLS policies, restricted runtime roles. Does not mean tenancy PASS                  |
| node scripts/smoke.mjs                                      | PASS; five independently started services, routing/OpenAPI/readiness isolation                            |
| node --test database/tests/category-catalog-plan.test.mjs   | PASS; 9 mapping/ambiguity/tamper/preservation tests                                                       |
| npm run storefront:build                                    | PASS; web export                                                                                          |
| node scripts/doctor.mjs                                     | PASS selected existing local stack, databases/native tools/scanner/signed HTTP events; Rabbit unavailable |
| node scripts/identity-smoke.mjs                             | FAIL existing issue: line 353, retired deletion-preview, 404 versus 200                                   |

Two execution-helper attempts failed before repository checks: an incorrect local npm CLI path (corrected to the installed CLI), and restricted Node userInfo for tsx (the actual npm frontend command passed in the Windows shell). A quoted ad-hoc read-only SQL invocation also failed before SQL execution and was rerun as a safely quoted private script. These are tool invocation issues, not hidden application failures or repository workarounds.

## Post-change comparison

Repeated npm run check (build/types/lint/Prisma/43 units), ten frontend units, 105 PostgreSQL/HTTP integrations, installed ORM parity, doctor and five-service process smoke all passed after documentation changes. All 158 local links resolve; the complete 71-model register was checked. SHA-256 comparison found only README.md and documentation/architecture.md changed among the 925 baseline files. The initial document-format check caught the corrected Inquiries link row; it was reformatted and the final check was rerun.

Final repeated checks, formatting/local links, naming and source/SQL preservation are recorded in the linked [machine evidence](../../documentation/validation/phase-01-baseline-2026-10-10.json). Application/schema/config/package files are compared by SHA-256 with the pre-edit baseline. Document-only changes cannot establish new tenant security. All local tests exercise current single-company behavior; Phase 3 negative isolation gates remain unstarted.

No new migrations were applied to the normal DB; test fixtures use task-owned disposable databases. Structural parity/readiness and real HTTP/process tests verify current persistence paths. Browser suites, hosted CI, container builds, live S3/SMTP/RabbitMQ, production worker isolation, full current 1.5 fresh/upgrade installer rehearsal, native/mobile and load were not rerun/executed in this task. Prior rename browser/byte/migration checks remain dated evidence; they are not presented as new results.

Result: documentation and safe normalization verified; overall baseline PARTIAL because of the existing Identity smoke failure. Hosted acceptance and Phase 2 implementation are not started.

## Acceptance and handoff

| Criterion                                       | Evidence / status                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Actual architecture/services inventoried        | Verified five APIs, four DB owners, one app and worker/relay roles                                          |
| Baseline health recorded                        | Executed checks above, existing failure explicit                                                            |
| Neutral identity/packages/imports resolve       | Verified root/lock/workspaces/aliases/build/types; remote already neutral; physical move separately planned |
| Behavior/data/migration preservation            | Tests/installed parity; unchanged runtime/schema/SQL hashes; no live business migration                     |
| Architecture/tenancy/organization/module design | Delivered, proposed future controls clearly marked                                                          |
| Migration/ADRs/statuses                         | Delivered; canonical ADRs reused; no duplicate authority                                                    |
| Current evidence and risks                      | Delivered; command failures/provider limits/installer drift explicit                                        |
| No premature ERP work                           | No business schema/module/auth rewrite/service topology/frontend rebuild                                    |

Recommended Phase 2: approve the tenant/legal-company and scope decisions, obtain a reviewed legacy ownership manifest, define provider/lifecycle/domain/language/entitlement requirements, and authorize installer/CI compatibility work with a disposable current-schema rehearsal. Phase 3 then requires real restricted-role two-tenant/two-company API/SQL/job/byte/browser/pool/recovery acceptance before activation. Do not proceed automatically.
