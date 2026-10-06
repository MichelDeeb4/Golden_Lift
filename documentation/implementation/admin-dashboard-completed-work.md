# Admin Dashboard completion report

Admin Dashboard Status: **Implemented; local acceptance PASS — 2026-10-06.**

The user authorized the missing Catalog APIs and the full dashboard. This report covers the implemented web dashboard and its service contracts. Production B5 provider acceptance remains open.

## Repository baseline

- Baseline commit: `2b1384cc7805adc109e906584c839af05d441a6b`.
- Existing Identity, B4 category administration, Dynamic Catalog Core, B5 Media and S1 shared design system were retained.
- Changes remain in the working tree; this phase did not commit or push them.
- [Baseline inspection](admin-dashboard-baseline.md), [design decision](../decisions/009-admin-dashboard.md), [dashboard guide](../admin-dashboard.md) and [local operations](../operations/admin-local.md) explain scope and operation.

## Implemented

Staff routes use real typed HTTP APIs, live Identity authorization, memory-only CSRF/action capabilities and a separate query cache. Catalog owns new product management use cases and transaction-scoped Prisma persistence; Gateway forwards allowed contracts. Media retains ownership of files, uploads, processing and private grants. Bigint/decimal values remain strings, mutations use optimistic versions, and soft deletion preserves records/files.

SQL 21 provides the reviewed additive Catalog upgrade; SQL 22 supplies fresh Admin fixtures. Current schema parity is 66 models, 664 columns and 73 foreign keys. Existing project databases were not upgraded automatically. See the operating guide before applying migrations to an installed database.

## Routes

| Routes | Purpose |
| --- | --- |
| `/admin/login`, `/admin`, `/admin/account` | Login, operational navigation, profile/session/password and logout |
| `/admin/categories`, `/:id` | Recursive category management |
| `/admin/products`, `/new`, `/:id` | Filtered collections and complete product editing |
| `/admin/product-types`, `/admin/attributes`, `/admin/attribute-groups`, `/admin/units`, detail routes | Dynamic schema management |
| `/admin/media`, `/:id` | Upload, library, usage, preview and supported lifecycle actions |
| `/super-admin/admins`, `/:id`, `/super-admin/account` | Admin account lifecycle and own account |
| `/admin/invitation`, `/admin/password-reset`, `/admin/reset-request` | Single-use invitation and password recovery |

## Category workflows

Recursive browsing and breadcrumb trails, independent translations, ready image covers, create/edit, sibling ordering, moves with source/destination revisions, deletion impact preview and confirmed branch soft deletion are available. Whole-sibling ordering loads bounded pages before submitting the reviewed order.

## Product workflows

Server-filtered, bounded collections support ID/manual keysets and exact bigint ordering. Staff can create, edit, assign category/type, publish/unpublish, feature/order, maintain translations and dynamic values, change type through impact review, attach/order/detach media and confirm soft deletion. New products start inactive in the dashboard. Public access rejects inactive/deleted products and their inactive public asset usages. Section saves preserve other drafts; stale versions/schema revisions preserve input and require explicit review.

## Dynamic catalog workflows

Types, definitions, groups, units, assignments, choice options, translated metadata and constraints use existing owning-service APIs. Required/public/filterable/group/order settings are represented through reviewed changes. Forms render backend metadata for NUMBER, BOOLEAN, TEXT and CHOICE; no elevator-specific fields are hardcoded. False, zero, unset values and decimal precision remain distinct. Deprecation and impact previews follow backend policy.

## Media workflows

Capabilities, initiation, immutable part upload, resume after a lost acknowledgement, completion and processing feedback use B5 contracts. Staff can choose ready assets, set an image cover, order the gallery and detach associations without retiring shared bytes. Private image/video/PDF previews acquire expiring capabilities near the viewport; offscreen refresh pauses. Video playback and authorized PDF original download work. Library filters, bounded usage pages and supported retry/reprocess/block/retire actions use owning-service authorization and reference policy.

Browser fixtures exercise real HTTP applications and databases, with a test-only security/processing adapter that publishes image/video/PDF derivatives. MP4 playback uses actual browser-recorded bytes; raster fixtures are synthetic. These tests do not establish production scanner, codec, broker or storage acceptance.

## Super Admin workflows

Account directory, invitation, resend, disable/enable and retained deletion are available. Disable/delete revoke live authorization. Invitation/reset tokens are removed from the URL and held only in memory; replay is rejected. Own password change revokes the session. Super Admin cannot manage Catalog/Media; Admin cannot access Super Admin account management. Mail delivery failures are surfaced; browser mail is captured locally rather than sent through production SMTP.

## Localization / RTL and design-system reuse

Arabic, English and Kurdish Sorani use shared localization/fonts/tokens and UI controls. Arabic/Sorani RTL, desktop sidebar, mobile drawer, keyboard focus restoration, page scrolling and horizontal overflow checks passed. Screenshots were inspected for Arabic desktop, Sorani desktop and Sorani mobile. Controls, dialogs, tables, breadcrumbs, alerts and feedback reuse S1 components.

## Tests executed and actual results

| Executed command | Result |
| --- | --- |
| `npm.cmd run check` | PASS: build, both typechecks, formatting, architecture for 199 source files, 14 boundary probes, four Prisma schemas and 36 backend unit tests |
| `npm.cmd run test:integration` | PASS: 91 real PostgreSQL/HTTP integration tests |
| `npm.cmd run test:frontend` | PASS: 7 frontend unit tests |
| `npm.cmd run storefront:build` | PASS: final web export |
| `node scripts/verify-orm.mjs` | PASS: 66 models, 664 columns, 73 foreign keys and installed constraints/indexes/triggers |
| `npm.cmd run test:admin` | PASS: 10 browser journeys; no failures, skips or flaky results |
| `npm.cmd run test:storefront` | PASS: 5 public browser regressions and responsive screenshots |
| Cleanup helper syntax/format checks | PASS after adding a retained process-marker guard for Windows cleanup |

Total: **149 passing tests**, plus architecture and schema checks. [Dated validation evidence](../validation/admin-dashboard-2026-10-06T12-39-33-944Z.json) records execution times, commands, coverage, source hashes and harness limits. Earlier milestone reports remain historical. Windows runner-owned preview shutdown required stopping only its verified preview process after assertions passed; the runner then finalized with exit code 0. Owned disposable databases/files/cluster were removed and their isolated port closed. Unrelated database processes were left running.

## Known limitations

The dashboard is web-only. Technical-sheet editors, Inquiries business workflows, native applications, restoration, unsupported session directories and full public collection/search integration remain deferred. Upload resume capabilities survive the current view only; reload/navigation requires a new upload. Hosted CI, deployment, production SMTP/providers and live database upgrades were not validated.

## B5 acceptance items still external

Real ClamAV fail-closed scanning, FFmpeg/Poppler processing, RabbitMQ recovery/redelivery, the chosen private S3 provider and Linux worker isolation still need their own acceptance evidence.

## Acceptance criteria

**PASS for the local implemented Admin dashboard.** Mandatory browser journeys executed successfully against actual service HTTP endpoints and disposable PostgreSQL databases. This does not claim production B5 provider acceptance or deployment readiness.
