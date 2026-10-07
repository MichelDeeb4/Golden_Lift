# Catalog model and UX fix — work completed so far

Date: 2026-10-07. **Overall status: IN PROGRESS.** This is an interim implementation record, not final acceptance of the full requested phase. The normal project retains its existing database and Product Type workflows.

## Golden Lift Catalog & UX Fix Status

Implemented and verified the migration foundation and authoritative category-schema read path. The approved `length` → existing `Dimensions` mapping produces a proposal without unresolved issues. No normal database migration has been applied.

## Completed backend and migration work

- Added ordered Category↔Group and Group↔Attribute SQL relationships with live uniqueness, ownership immutability, soft retention, serialization and deferred leaf integrity.
- Added a deterministic effective-schema view: one field per attribute, requiredness OR, conservative disclosure AND, global privacy/filter restrictions and exact ordering.
- Added read-only inventory, explicit proposal, guarded backfill and parity validation commands. Actual CLI tests verify repeated backfill, stale review rejection and no overwrite of conflicting rows.
- Added staged cutover SQL for category authority, inactive drafts, complete publication, retained nonapplicable values, schema revision propagation and retirement of Product Type as immutable owner evidence.
- Added `ReadCategorySchema`, its narrow application reader port, Prisma snapshot adapter, authenticated controller, Gateway allowlist entry and aligned OpenAPI/contract response. Existing form generation shares field composition without constructing a replacement Product Type.
- Added [decision 015](../decisions/015-category-driven-catalog.md), the [classification model](../architecture/catalog-classification-model.md), [baseline](catalog-model-and-ux-fix-baseline.md) and [migration operations](../operations/catalog-migration.md).

## Verification executed

`npm.cmd run check` passed build, types, formatting, architecture (212 source files; 14 enforcement probes), four Prisma validations and **37 backend unit tests**. `npm.cmd run test:frontend` passed **9 frontend unit tests**. `npm.cmd run test:catalog-migration` passed **21 tests**: 9 offline planner tests and 12 real PostgreSQL/CLI/HTTP tests. The initial restricted frontend launch failed at Windows account-information access; the authorized unrestricted run passed.

Disposable fixtures retain exact `99999999999999.123456`, false booleans, Arabic text, choices and soft-deleted text/choice rows through backfill and cutover. Tests verify shared-attribute deduplication, privacy, inactive creation, required-field publication, orphan-value resolution, role rejection, locale fallback, versions, concurrent gate locking and runtime migration denial. Gateway transport tests use explicit fixture authentication. No new browser visual acceptance or production-provider validation is claimed.

[Dated interim validation evidence](../validation/catalog-model-and-ux-fix-2026-10-07T14-00-48-319Z.json) records **67 passing tests** in this increment and explicitly retains `IN_PROGRESS` for overall acceptance. The owned disposable database and cluster were removed. The normal website on port 8081 and all five service readiness endpoints on ports 3000–3004 returned HTTP 200; its database still has neither expansion 23 nor category cutover installed. Existing accounts and configuration were retained.

## Remaining implementation and acceptance scope

- Remove Product Type from runtime repositories, use cases, DTOs, routes, selectors and Prisma classification bindings; the running project still depends on it.
- Implement atomic reviewed Category/Group/Attribute membership CRUD, searchable multi-select controls and Category-only Create & Continue/product editing.
- Complete recursive lazy category tree, selected Add Subcategory flow and group/product blocking explanations.
- Complete Media grid/list switching, unified image/video cues and contextual visitor breadcrumbs, related products and authoritative neighbors.
- Run relevant live Identity/CSRF/version/transaction/process/browser regressions, reload persistence, responsive/RTL/accessibility checks and reviewed visual comparisons.
- Complete coordinated normal backup/migration/new-binary startup, final current validation evidence and acceptance reporting.

## Acceptance

**PENDING — full implementation is not complete.** Passing foundation tests do not establish full phase acceptance. Earlier milestone and browser reports remain historical evidence.
