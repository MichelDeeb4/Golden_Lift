# Golden Lift — Fix disabled Create Product

Date: 2026-10-07. Scope: minimal inactive Product creation, category-derived editing and publication separation.

## Root cause

The create overlay required Product Type selection, type schema, specification completion and image cover. Backend create and persistence used the same obsolete prerequisites. Category classification had been staged but not activated in the normal database. Selecting a valid leaf and entering an Arabic name could not enable a usable minimal creation flow. Drafts with no cover also produced a false Media dirty state because the editor compared `''` with `null`.

## Implemented behavior

Products → Create Product opens the focused modal. Only a valid leaf category and nonblank Arabic name are required. Model code, English name and Sorani name are optional. There is no Product Type, hidden type/schema/version prerequisite, specification field or Media control in this modal.

RHF registers the actual category ID; selection writes it with validation/dirty updates and sets the selected category. The button derives eligibility from watched category ID, selected leaf, trimmed Arabic name and pending state, with explanatory feedback when disabled. Parent rows remain visible, expand on attempted selection and explain the leaf rule. The shared modal/drawer and controls retain focus, keyboard, loading and RTL behavior.

POST `/api/v1/admin/products` accepts only `categoryId`, optional `modelCode` and translation rows. Arabic is validated by Catalog. It rejects obsolete fields and validates current live leaf placement inside the owning transaction. New products are inactive, have no type binding/cover/values, and return their ID/version. Model uniqueness, authorization, serialization, exact numeric values, soft deletion and transactional outbox behavior remain enforced.

The mutation uses the existing credentialed client and CSRF/Origin transport. Success closes the modal, shows **Product created**, invalidates scoped products/editor caches and navigates client-side to the saved product. No document reload occurs. Errors preserve input, release pending state and show safe feedback for missing/changed categories, model conflicts, authorization and service failures. A rejected category refreshes the picker branches so a newly added child is selectable.

The editor loads the saved product and its category schema. Specifications resolve reusable groups and unique definitions; duplicate memberships do not duplicate storage. Inactive draft saves can omit required fields and cover. Publication separately requires complete required values and a verified ready image cover. Media association and publication remain independent explicit saves. The editor normalizes an absent cover before dirty comparison.

## Migration and normal data

SQL 23 expands relationships; reviewed mapping/backfill/validation precede SQL 24 category cutover. SQL 25 is the fresh composition. The owning CLI now supports an exact-database-confirmed atomic cutover. Runtime roles receive no migration privilege. Product Type navigation/create/change workflows are retired safely; historical IDs are retained, immutable and unavailable for new creation.

The normal Catalog contained ten published demo products, seven leaves, nine reusable demo attributes and 21 prepared category/group placements. Exact inventory review found no unresolved mapping issues. A full owning-database backup was restored to a disposable copy with matching retained-row hashes; expansion, backfill, validation and cutover passed there before application to the stopped normal project. Credentials, backup bytes and raw mappings remain ignored local artifacts. Existing staff accounts, Media and retained history were preserved. No demo reseed was executed in this task.

## Verification

Current commands, exact counts, screenshots, normal-project readiness and acceptance are recorded in the dated validation JSON linked at the end of this report. Backend tests exercise PostgreSQL and real Catalog/Gateway HTTP. Browser tests use disposable service-owned databases and live Identity sessions, including CSRF/Origin checks. Test-only scanner/processor adapters are explicitly confined to the fixture.

Covered behavior: initial disabled state; valid leaf plus Arabic enables; whitespace rejected; parent navigation/feedback; exact minimal POST with no type; inactive persistence and outbox; optional names/model and duplicate rollback; missing/deleted/parent rejection; obsolete fields rejected; category schema deduplication; incomplete draft save versus activation; stale versions; authorization; SPA document-marker retention; toast/modal close; browser refresh persistence; category-change recovery; actual Catalog outage retry; English, Arabic and Sorani mobile keyboard creation. Existing category-tree assertions remain and their fixture now creates a minimal draft.

## Known limitations

- Category/group relationship editing is a separate unfinished workspace feature. Existing reviewed relationships drive the editor; categories with no groups can still create drafts.
- Historical full Admin and Dynamic Catalog suites contain retired Product Type workflows and require a deliberate port. Their historical pass counts are not current acceptance for this change. Focused current tests preserve and exercise the affected creation/category/migration policies.
- The demo seeder supports an already prepared category schema and fails before writes if its expected relationships are missing. Fresh demo relationship provisioning is not implemented or claimed.
- No hosted CI/deployment, production mail/broker/storage/scanner acceptance, external accessibility certification or device benchmark is claimed.

## Evidence and acceptance

**PASS — focused Product Create definition of done.** Current verification: **88 passing tests** (37 backend unit, 9 frontend unit, 6 draft PostgreSQL/HTTP, 21 migration, 10 staff browser and 5 visitor browser), plus seven unchanged visitor visual comparisons. Build/types/format/architecture/four Prisma schemas and diff checks passed. [Dated evidence](../validation/product-create-fix-2026-10-07T16-49-54-772Z.json).

The normal project runs at http://localhost:8081; all five readiness endpoints returned 200. All ten preserved published demo products returned detail responses with nine category-derived attributes each; controlled images loaded, and Arabic mobile browsing passed without overflow or browser/API errors. The task-owned disposable cluster was removed. Acceptance does not cover all remaining classification CRUD or historical Type-specific suites.

Reviewed captures: [English modal](../assets/product-create/create-en.png), [Arabic mobile](../assets/product-create/create-ar-mobile.png), [Sorani mobile](../assets/product-create/create-ckb-mobile.png), [saved draft editor](../assets/product-create/draft-editor.png), [normal live catalog](../assets/product-create/live-products.png). These are review evidence, not new staff screenshot equality baselines.
