# Phase 02 — Greenfield engineering foundation

Date: 2026-10-10. Architecture revision: target-specification-2026-10-10-v1. Source commit: 54778083efea968eeedf162cab0541f84b4dbb41. Owner authorization: explicit user message approving ADRs 030–035 and bounded deferrals, and directing Phase 02 implementation.

**Phase 02 gate: BLOCKED.** Implemented engineering work, fresh-install checks, real Docker/container execution and disposable PostgreSQL lifecycle tests pass. Hosted GitHub Actions evidence for this uncommitted source remains unavailable. These criteria are mandatory and have not been waived. **Phase 03: NOT STARTED.** No target tenant database, RLS/routing, OIDC, organization or ERP business implementation was begun.

## Scope, contracts and ownership

Five target applications now compose twelve active workspaces: NestJS ERP API, separately deployable platform API and worker runtime; Next.js ERP web and platform administration shells; shared contracts/kernel/UI/tooling and security/observability/deployment infrastructure. Root workspace scripts, lockfile and CI target this graph. Legacy services/storefront are excluded from target compilation and dependency resolution.

The operational REST baseline exposes only /api/v1/health/live, /health/ready and /status, with generated OpenAPI under /api/v1/openapi.json. Ready means engineering process readiness, not tenant, database or business readiness. There are no tenant/business admission endpoints. Worker health is a running process foundation; durable processing belongs to Phase 07. Web shells have real navigation, safe error/not-found routes, responsive layout and a local display-direction form. No approved launch language or business workflow is inferred.

Contracts/kernel remain framework independent. Application entrypoints compose infrastructure through public package exports. The TypeScript AST checker enforces owner/layer boundaries, package exports, aliases, reexports, import types, cycles and legacy exclusion; it rejects unchecked dynamic imports/require and explicit any. Negative fixture modules exercise future domain/application conventions without creating empty business modules.

Configuration validates environment, binding and optional trusted telemetry URL. Malformed/credential-bearing telemetry configuration yields a safe error. HTTP validation rejects unknown/malformed query input, safe errors carry a UUID correlation ID, and logs omit request bodies/query strings. Real HTTP spans export through OpenTelemetry. Database harnesses use only randomly named, labeled test containers; cleanup checks test ownership. SQL manifest scaffolding detects sequence gaps, changed applied checksums and ahead-of-stream history. Canonical control/ERP migrations and ORM selection remain Phase 03 work.

The phase design/acceptance scope was written before code. Failure gates cover invalid configuration, validation/404 errors, import violations, altered migration history, fake receipts and process cleanup. Containers use a nonroot user and loopback port bindings. Next.js uses standalone output with copied static assets. The engineering image includes build dependencies; production image optimization and provider/deployment certification remain release work.

## Recovery and preserved work

Before restructuring, .local/phase-02-baseline/source captured **974 nonignored tracked/untracked source files**, with SHA256 verification, dirty-tree manifest and a complete Git history bundle. Snapshot hashes were reverified; git bundle verify passed. This includes pre-existing uncommitted architecture documents and user edits. Ignored databases/media/credentials/backups were left untouched. This is a source recovery snapshot, not a database/object backup.

No valuable legacy data or production resource was changed or removed. Legacy source remains recoverable and outside the active target graph; its business replacement has not yet passed acceptance, so it has not been deleted. The pre-existing deletion of GOLDEN_LIFT_HOSTING_ASSESSMENT.md and the existing replacement assessment were already present in the initial dirty tree and were preserved. No commit or push was performed.

## Changed artifacts

- Root package/lock/build configuration, .env.example, ignore rules, README and AGENTS target-authority notice; .github/workflows/backend.yml now validates the greenfield graph.
- apps/erp-api, apps/platform-api, apps/worker: executable NestJS process entrypoints.
- apps/erp-web, apps/platform-admin: built Next.js applications, health routes and browser-tested UI shells.
- packages/shared-kernel and packages/tooling; target public entries/manifests for packages/contracts and packages/ui. Inactive legacy source files remain preserved.
- infrastructure/security, observability, deployment and database: validation, safe runtime composition, tracing/logs, Docker/Compose, disposable fixture and migration-lineage harness.
- tests/architecture, tests/engineering, tests/end-to-end and tests/database-migrations: real process/HTTP/tracing/browser tests and negative dependency/configuration/history/evidence checks.
- OpenAPI snapshots; Phase 02 acceptance matrix, verification evidence and local operation guide; Phase 01 approval/ADR/status records and architecture-index approval notices.

[Machine verification](phase-02-verification.json) contains the exact changed-file inventory relative to the pre-implementation source snapshot, command receipts and artifact hashes. Private complete command logs and isolated clean-source installation remain under .local/phase-02-baseline and .local/phase-02-clean.

## Initial-session verification (historical results)

| Command / location                                                             | Result                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm.cmd install --ignore-scripts --no-audit --no-fund / root                   | PASS; replaced active dependency graph and regenerated lockfile; 86 added, 861 removed, 2 changed                                                                          |
| npm.cmd ci --offline --ignore-scripts --no-audit --no-fund / clean source copy | PASS; 239 packages; no legacy workspaces needed                                                                                                                            |
| npm.cmd run check / clean source copy                                          | PASS; production builds, strict typecheck, formatting and AST boundaries, 29 unit/architecture checks, 6 HTTP/process/collector/launcher checks, 2 real Edge browser flows |
| npm.cmd run api:generate / clean source copy                                   | PASS; actual NestJS-generated contracts; root and clean-copy snapshots byte-identical                                                                                      |
| npm.cmd run security:scan / clean source copy                                  | PASS on retry; zero vulnerabilities. One intervening attempt failed because the registry audit endpoint was unavailable; preserved in evidence                             |
| npm.cmd run test:docker / root                                                 | BLOCKED, exit 2; Docker CLI absent. No container runtime result                                                                                                            |
| npm.cmd run test:database / root                                               | BLOCKED, exit 1 at explicit prerequisite assertion; zero database cases passed. No PostgreSQL lifecycle/SQL result                                                         |
| GitHub Actions foundation job                                                  | BLOCKED / not executed; workflow implemented, no hosted run for these uncommitted changes                                                                                  |
| node tests/architecture/verify-phase-01.mjs gate 2                             | PASS; actual owner approval and phase-bounded deferrals                                                                                                                    |
| node tests/architecture/verify-phase-01.mjs gate 3                             | BLOCKED, exit 2; OWNER-SCALE, OWNER-HOSTING and maximum database connection target due                                                                                     |
| node tests/architecture/verify-phase-01.mjs gate invalid                       | Expected rejection, exit 1; invalid phase cannot bypass deadlines                                                                                                          |
| node packages/tooling/phase-02-gate.mjs                                        | BLOCKED, exit 2; missing Docker, database and CI proof                                                                                                                     |
| git bundle verify .local/phase-02-baseline/history.bundle                      | PASS; complete source history recovery bundle                                                                                                                              |

Initial local build attempts exposed UTF8 BOMs introduced by file creation; those files were normalized and final builds pass. Initial browser commands exposed a test-server working-directory error and absent pinned Chromium binary. The working directory was corrected, standalone launches verified, and actual installed Edge was used. A slow Chromium download was cancelled; bundled Chromium and Linux/browser/container/provider behavior are not claimed as tested locally. Hosted CI installs Chromium explicitly. The final fresh-copy check includes the safe malformed-telemetry error correction.

The clean copy was synchronized with final target source after initial installation and rebuilt/rechecked; dependency manifests/lockfile did not change during that verification. Source manifests and full logs distinguish the initial and final runs. Both Next.js shells and all three NestJS processes were started; the launcher test verifies all five readiness endpoints and that shutdown closes them. There are no skipped Node tests substituted as successful runtime evidence.

## Accepted decisions, limits and next action

Approved architecture revision and ADRs are unchanged. Hybrid pooled plus dedicated tenant databases, one canonical ERP schema, one modular transactional ERP implementation, a separate control database, and distinct legal-company ownership remain mandatory. No alternative architecture or compatibility adapter was introduced. Unknown product, financial, capacity, hosting and compliance values remain null; approved deadline guards block dependent work.

Resume **Phase 02 hosted acceptance** with an authorized GitHub connection: publish this verified source on a review branch and obtain a passing foundation CI run for that exact commit. Record the workflow run URL, commit SHA and job/test artifacts before closing Phase 02. Docker and disposable PostgreSQL acceptance now have real passing results recorded below.

Only after every Phase 02 criterion passes may Phase 03 begin, and it additionally requires approved connection/capacity budgets and hosting/region/budget/failure-domain decisions. Other bounded deferrals retain their documented deadlines. No new architecture approval is requested. Legacy data import/disposition, production resources and destructive operations still require separate authorization.

## Continuation verification — 2026-10-10

**Current gate: BLOCKED solely on hosted CI evidence. Phase 03: NOT STARTED.** Twelve of thirteen engineering criteria have passing command receipts. Architecture and approved deferral deadlines are unchanged. No commit, push, legacy service startup, valuable data deletion or production resource modification occurred.

Docker Desktop 4.94.0 / Docker Engine 29.8.2 became available with the desktop-linux context. Tests used actual Linux containers and PostgreSQL 18.6; no unavailable test was counted as PASS.

The initial PostgreSQL harness failed with a missing named database. Inspection of the actual official image entrypoint confirmed that its temporary bootstrap server accepts Unix-socket connections before the requested database is created. Socket-only pg_isready was therefore premature. infrastructure/database/fixtures.mjs now reports captured stderr with the generated fixture credential redacted. tests/database-migrations/fixture-lifecycle.test.mjs waits for the final TCP listener and a successful query in the named database, asserts readiness rather than falling through, and repeats the complete fresh-container lifecycle twice. Real assertions cover database identity, repeatable SQL, rollback, committed writes and credential-redacted failure diagnostics. Original failure logs remain preserved.

| Final command / location                                                              | Actual result                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm.cmd ci --offline --ignore-scripts --no-audit --no-fund / new isolated source copy | PASS; 239 packages                                                                                                                                                                 |
| npm.cmd run check / new isolated source copy                                          | PASS; production builds, strict typecheck, formatting, AST boundaries, 29 unit/architecture tests, 6 HTTP/process/tracing/launcher tests, 2 Edge browser flows; zero skipped tests |
| npm.cmd run api:generate / new isolated source copy                                   | PASS; generated OpenAPI matches root snapshots byte for byte                                                                                                                       |
| npm.cmd run test:database / root                                                      | PASS; two independently provisioned disposable PostgreSQL containers; real SQL assertions and guarded cleanup                                                                      |
| npm.cmd run test:docker / root                                                        | PASS; rebuilt final source; all five application containers healthy and actual readiness endpoints verified                                                                        |
| npm.cmd run security:scan / new isolated source copy                                  | PASS; zero vulnerabilities reported                                                                                                                                                |
| docker compose -f infrastructure/deployment/compose.yml down / root                   | PASS; removed only the foundation test containers and their network                                                                                                                |
| Node architecture/unit/HTTP/launcher tests inside the Linux engineering image         | PASS; 35 tests, zero skips, under the image's nonroot runtime user                                                                                                                 |
| GitHub Actions foundation job                                                         | BLOCKED; no authorized GitHub connection or hosted run for these uncommitted changes                                                                                               |

The Linux 35-test run preceded the two database-harness source fixes; it does not exercise that harness. The final rebuilt Docker image contains the fixes. Browser verification used installed Windows Edge; Linux Chromium and hosted CI behavior remain unverified. The PostgreSQL test is an engineering fixture/lifecycle proof, not target schema, RLS, routing or ERP acceptance. Those implementations remain in later phases. No Docker test containers remained after cleanup.

This continuation changed only the two fixture/test source files above, this report, phase-02-verification.json and phase-02-acceptance.json. Final command receipts, SHA256 hashes and source hashes are recorded in the machine verification file; full original/final logs and the fresh-install source copy remain under ignored .local/phase-02-continuation. Earlier source recovery snapshots and history bundle were preserved.

**Exact next action:** connect an authorized GitHub integration, publish the reviewed source to a verification branch, execute the existing foundation workflow, and inspect the exact commit's hosted job results/artifacts. Fix any hosted-only failures and rerun affected/full acceptance before recording Phase 02 PASS. Local results do not substitute for hosted CI.

Automatic approval review rejected a proposed Git credential-store token read before execution because that secret use was not explicitly authorized. No credential was extracted or used. A GitHub connection was suggested as the safer alternative; no connection or owner authorization is inferred.
