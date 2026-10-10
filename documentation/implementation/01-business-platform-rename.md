# Business Platform identity rename

Date: 2026-10-10. Scope: project identity and shared application generalization only.

## Executive summary

The active monorepo is Business Platform, with @business-platform/* workspaces, business-platform application identity, BP shared UI symbols and neutral backend/session/messaging names. Four installed databases and eight owning roles were renamed without rebuilding schemas. All 71 table row counts and SHA-256 content fingerprints matched exactly before/after cutover. Existing Catalog, Identity, Media and Gateway functionality is retained; Inquiries remains pending. Multi-Tenant ERP and E-Commerce Platform describes the target architecture, not implemented multi-tenancy or ERP modules.

The normal development app/workers were paused for the database cutover and restored afterward. Current local checks are recorded below; 43 backend and ten frontend unit tests, 105 PostgreSQL/HTTP integration tests, 22 migration regressions, five demo-public, 46 Admin and three live-public browser scenarios passed. Hosted RabbitMQ/providers, physical folder and GitHub repository rename remain explicit limitations/manual actions. No tenancy, schema/domain expansion, dependency addition, package alias, commit or deployment was made. Pre-existing working-tree changes were preserved.

## Initial audit and plan

Before editing, the [classified inventory](01-business-platform-rename-audit.json) recorded 3,193 matching source lines across 337 files. Matches were classified as platform identity, coordinated technical identifiers, shared branding, retained business/data identifiers and historical evidence; unrelated global/glyph/glazing identifiers were excluded from identity replacement. Existing rules, architecture, consumers, contracts, persistence, scripts and tests were inspected.

The recorded plan was to switch active callers together, refresh lock/workspace links, back up and rename installed infrastructure by checked identity, gate legacy durable messaging, regenerate browser snapshots and verify builds/types/format/boundaries/DB/HTTP/browser/media behavior. Business schemas and stored object keys were to remain unchanged.

## Approved naming convention

| Concern                                     | Convention                                                            |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Project/documentation                       | Business Platform                                                     |
| Repository/application/Expo slug and scheme | business-platform                                                     |
| Internal workspace scope                    | @business-platform/*                                                  |
| Provisioned databases/roles                 | business_platform_<service>, _owner, _runtime                         |
| Shared UI exports and translations          | BP*, useBPTranslation                                                 |
| CSS/DOM namespaces                          | bp-*                                                                  |
| Development/production cookies              | bp_staff / __Host-bp_staff                                            |
| Browser locale/history                      | bp.locale / __businessPlatformStaffHistory                            |
| Former GL environment flags                 | BUSINESS_PLATFORM_*                                                   |
| Rabbit exchange/queues                      | business-platform.media.*.v1                                          |
| Disposable ORM databases                    | bp_test_orm_<service>_<uuid>, safely under PostgreSQL's 63-byte limit |

The [accepted decision](../decisions/024-neutral-platform-identity.md) records the tradeoffs.

## Files and components changed

| Layer                 | Changes                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspaces/tooling    | Root and fourteen workspace manifests, dependency references, imports/exports, TypeScript aliases, lockfile, build/dev/test/architecture scripts                                       |
| Backend/contracts     | Service-owned imports, JSON schema identifiers, runtime role validation, connection application labels, Identity sender/subjects, OpenAPI and Gateway embedded metadata                |
| Shared UI/application | BP primitives/hooks/styles and every caller, shared CSS/selectors, Expo identity, browser titles, staff/navigation/header/footer/loading branding                                      |
| Translation/content   | Neutral shared shell copy in ar/en/ckb; elevator catalog examples and optional technical workflows retained; generated preview PDF rendered and inspected                              |
| Auth/session          | Both cookie names and all clients/tests/OpenAPI callers changed together; secure flags, Origin/CSRF checks, live sessions and role policies preserved                                  |
| Infrastructure        | Neutral new provisioning and test identifiers; checked database rename script and npm db:rename command; producer/consumer Rabbit names plus legacy-drain guard                        |
| Verification/docs     | Naming assertions/selectors, real regenerated snapshots, current README/service/architecture/design/operating guides/AGENTS title, this report and audit/decision/validation artifacts |

No service ownership boundary, Prisma model, SQL constraint, retained-data blocker or Media storage-key format was changed. Current folder diagrams use the intended repository name; the physical directory remains the workspace path until the manual move.

## Package namespace migration

All fourteen workspaces use @business-platform/*; boundaries and versions remain unchanged. npm install --offline --ignore-scripts refreshed the lockfile and removed fourteen old links/added fourteen new links. There is no compatibility namespace. The installed backend and frontend builds resolve the new imports. All external dependency integrity values were compared with the prior lockfile and remained identical; no dependency version was changed by this task.

## Infrastructure/database migration and recovery

The existing installed rows were not assumed disposable. scripts/rename-platform-database.mjs verifies the private cluster, exact supported source/target names, OIDs and SCRAM runtime credentials; refuses active clients; creates four pg_dump custom archives and validates their pg_restore listings; pauses new connections, checks again, renames eight roles transactionally and four databases by OID, updates the ignored connection profile/env, reenables connections and tests all four owning runtime logins. It never kills database sessions, drops schemas, rebuilds tables or moves Media objects. The source databases and roles kept their original OIDs, credentials, grants and content.

Executed backups/journal/private profile are in .local/identity-rename (ignored, contain credentials; do not publish). Read-only before/after fingerprints are in .local/rename-checks/before.json and after.json. All 71 table counts/hashes matched. Installed Prisma parity also passed for 714 columns, 76 foreign keys and all reviewed constraints/indexes/triggers.

For another supported installation, stop APIs/workers/test clients, run npm.cmd run db:rename (plan), then npm.cmd run db:rename -- --apply. If interrupted, keep writers stopped, preserve the journal/backups and rerun the procedure; it resolves recorded OIDs at either old/new names and refuses collisions. Do not remove the journal or invoke setup/all against populated databases. If recovery requires restoration, restore all four archived databases plus their recorded owner/runtime identities and matching private connection profile as one reviewed maintenance action; no automated destructive rollback is supplied.

The existing privileged golden_lift_local_admin bootstrap role remains cluster provenance; new clusters provision business_platform_local_admin. It is not a service runtime/platform display identity. Renaming a current session user requires a separate privileged connection; no temporary superuser or broadened runtime grant was introduced. Existing SQL schema comments retain their historical identity.

Rabbit publishers and consumers use the same renamed adapter topology. The guard checks both old consumer queues and dead letters and refuses any queued messages, active consumers or failed broker check. Operators must pause old publishers, drain every legacy queue and then start renamed relays. No old queue is deleted automatically. The new durable quorum queues, publisher confirmations, mandatory routing, retries, dead-letter behavior and idempotency remain intact. The local selected transport is signed HTTP, so real broker cutover/delivery is unverified.

Originals/staging/outputs and ownership/deletion paths contain generic asset/session IDs; they were left intact. Native IMAGE/VIDEO/PDF processing and physical deletion were verified on disposable data.

## Deliberately preserved references

Historical SQL/fixtures, dated ADRs/implementation reports/validation files, hosting assessment, prior tenancy audit and historical screenshots remain records of the original inspected project. Active exceptions are limited to legacy queue drain detection/tests, exact old schema-marker acceptance, the OID-based source-name migration allowlist, immutable migration UUID namespace golden-lift/type-assignment, and established GL demo model/product codes. Those codes identify examples/data rather than the shared platform. Unrelated global/glyph/glazing text and dependency names/integrity bytes remain intact.

Cookie changes intentionally expire development sessions; sign in again. The new browser namespace resets old preferences/history without deleting stored browser data. No dual package namespace or auth-cookie compatibility path is retained.

## Executed verification

[Machine-readable results](../validation/business-platform-rename-2026-10-10.json) distinguish actual passes, unavailable dependencies and legacy failures. Logs and disposable runners are in ignored .local/rename-checks.

| Executed command/workflow                                                                                     | Actual result                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm install --offline --ignore-scripts --no-audit --no-fund                                                   | PASS; fourteen workspace links switched; lock integrity parity                                                                                    |
| node scripts/build.mjs                                                                                        | PASS; four Prisma clients generated and all backend packages/services built                                                                       |
| npm run typecheck                                                                                             | PASS after correcting the translation edit; root + storefront strict checks                                                                       |
| npm run lint (including final run)                                                                            | PASS; formatter, 245 source boundary checks, fourteen enforcement probes, four Prisma validations                                                 |
| node scripts/test.mjs unit                                                                                    | PASS 43 tests, including two legacy Rabbit cutover-gate regressions                                                                               |
| npm run test:frontend                                                                                         | PASS 10 tests outside restricted Windows execution                                                                                                |
| node scripts/test.mjs integration                                                                             | PASS 105 real PostgreSQL/HTTP regressions                                                                                                         |
| node scripts/verify-orm.mjs                                                                                   | PASS 71 models/714 columns/76 FKs and installed SQL parity                                                                                        |
| node scripts/rename-platform-database.mjs --apply; subsequent plan                                            | PASS installed cutover and neutral-target/SCRAM recheck; all four runtime logins                                                                  |
| Before/after row fingerprint runner                                                                           | PASS all 71 tables exactly unchanged                                                                                                              |
| Explicit disposable verifyFresh v1.2 runner                                                                   | PASS four fresh installs, seven SQL suites, fresh/upgrade parity, four concurrency scenarios, twelve cross-DB denials                             |
| BUSINESS_PLATFORM_DATABASE_CONFIG_FILE=<owned profile> node --test database/tests/category-catalog-*.test.mjs | PASS 22 planning/PostgreSQL/HTTP migration regressions; disposable cluster stopped/removed                                                        |
| node scripts/smoke.mjs                                                                                        | PASS all five independent service processes, Gateway/OpenAPI/readiness isolation                                                                  |
| npm run storefront:build                                                                                      | PASS default, explicit demo, and documented live API profiles                                                                                     |
| Playwright tests/frontend.playwright.config.ts with update, then comparison                                   | PASS five scenarios and seven regenerated public-demo visual baselines                                                                            |
| Playwright tests/frontend.admin-ui.config.ts --update-snapshots                                               | PASS all 46 current Admin scenarios, including auth/catalog/Media/deletion/persistence                                                            |
| Admin visual scenario without snapshot updates                                                                | PASS all 24 visual baselines after development rebuild finished; explicit Playwright exit 0                                                       |
| Playwright tests/frontend.public-catalog.config.ts                                                            | PASS three live API scenarios and seven visual baselines; regenerated then compared without updates                                               |
| Native Media runner with actual tools and disposable live Admin session                                       | PASS real IMAGE/VIDEO/PDF upload, scan/processing, signed local events, private preview bytes and permanent metadata/registration/object deletion |
| node scripts/doctor.mjs after restoring npm start                                                             | PASS five services, frontend, four DBs, scanner and signed local event listeners ready; Rabbit unreachable                                        |
| Preview PDF generation + Poppler render and visual inspection                                                 | PASS layout/text; local Poppler emitted font-substitution warnings, rendered output inspected                                                     |

Initial restricted execution failed on Windows userInfo for tsx and pg_ctl process control; normal approved execution passed. One translation editing error was caught by TypeScript and corrected before acceptance. Browser demo tests initially used the wrong API export; explicit demo export passed. Native deletion evidence required waiting for signed-event cleanup convergence, as established deletion tests do. No production code fallback, skipped test, weakened assertion or dependency workaround was introduced.

Two legacy commands remain failing and are not reported as passes: db.mjs verify defaults to Catalog v1.1 and cannot compare the populated category-schema installation to that old baseline; the explicit supported disposable v1.2 verifier and current installed ORM/current category fixtures passed. identity-smoke.mjs reaches the historical /deletion-preview route and receives 404; current authorization/session/invitation/mail/CSRF integration and Admin browser coverage passed. These older harness assumptions need a separately scoped alignment with the current deletion/category contracts; no business route was resurrected to satisfy them.

## Manual actions and limitations

The configured remote is https://github.com/MichelDeeb4/Golden_Lift.git. No GitHub repository rename was performed. In that repository's Settings → General, rename it to business-platform, then run git remote set-url origin https://github.com/MichelDeeb4/business-platform.git and verify fetch/push access.

The physical workspace remains C:\Projects\Golden_Lift because changing the active writable workspace would invalidate this IDE/tool session and private absolute Media paths. After stopping the dev app/workers and node database/scripts/db.mjs stop, close the IDE; from C:\Projects verify business-platform does not exist, then run Rename-Item -LiteralPath 'C:\Projects\Golden_Lift' -NewName 'business-platform'. Reopen the new folder. Rerun media:tools and media:setup -- --offline to regenerate absolute command/scanner/profile paths, and doctor after startup. Update any external IDE shortcuts. The directory/remote rename is not claimed completed.

No hosted CI/deployment, real Rabbit broker, S3/provider bucket move, SMTP provider, worker container deployment or native mobile target was validated. External storage is untouched. The current web-only Expo scope remains web-only. Multi-tenant isolation and ERP workflows remain future work.

## Final search and completion status

The [final classified repository inventory](01-business-platform-rename-final-audit.json) contains 146 retained matching lines: 122 historical/rename-evidence, six legacy broker guard/test, fifteen example model/product codes, and one each infrastructure source allowlist, schema marker and immutable UUID namespace. There are zero unexplained active platform references, zero old workspace scope occurrences and zero old UI symbols/selectors in active sources. Source/package identity, installed data-preserving cutover and current local functional acceptance are complete. Remaining folder/GitHub actions and provider/legacy-harness limitations are explicit above. The repository can proceed to the next architecture decision/baseline phase; this does not approve or implement multi-tenancy.

Root cause: a company name had become the shared software's technical identity. Solution/affected layers: all active workspace, backend, UI, auth, operating and infrastructure naming switched coherently. Migration/data safety: four backed-up databases/eight roles retained OIDs; all 71 stored-table fingerprints unchanged; Media keys and retained evidence preserved. Obsolete path removed: old workspace links/scope, UI/CSS namespaces, platform branding, cookie/browser names and new-provisioning identifiers. Tests/persistence: current local suites and native byte deletion passed as recorded above. Known limitations: historical verification harnesses, hosted broker/providers, physical folder and GitHub manual actions. Result: PASS for the scoped implementation and current local acceptance; the two documented legacy commands remain FAIL, and external hosting/directory actions are not complete.
