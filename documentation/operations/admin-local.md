# Admin local operations

Use Node 24 and the root npm workspace. Install/build using the existing backend and frontend guides. Staff views require actual Identity, Catalog, Media and Gateway services; public demo mode does not supply staff fixtures.

## Daily startup

After preparing the local databases, run `npm.cmd start` from the repository root. It starts the default project database, prepares local service secrets, builds the backend and launches all five services plus the website. Open `http://localhost:8081/admin/login`; Ctrl+C stops the application processes. The PostgreSQL server remains available. This local-only launcher supplies matching localhost browser origins by default, respects explicit environment overrides, and never applies database migrations. Backend credentials are removed from the frontend child environment.

After changing backend code or public API contracts, stop and restart `npm.cmd start`. Metro refreshes frontend code, but the service processes load compiled backend modules only at startup. Rebuilding files alone does not update an already running service. For example, the updated public Products client requires the collection `total`; an older running Catalog can still return HTTP 200 without that field, which the client correctly rejects. Restart the application and verify the real `/api/v1/products` response before diagnosing this as a network outage. Never substitute demo data or relax response validation to hide an outdated runtime.

## Category tree operations

Open `/admin/categories`. Create Root Category always uses a null parent. Expand a chevron to browse children; select a name to inspect it. Add Subcategory captures the selected parent and version. Product-containing categories show a blocking explanation; the owning service also rejects child creation. Root/category names require Arabic, with optional English/Sorani translations and cover. There is no separate category publication checkbox in the current contract.

Use row overflow actions to move a sibling earlier/later, edit, add a child, move or delete. Reordering applies immediately after the confirmed server transaction; both directions require the complete loaded sibling collection of at most 500 records. Load more pages first if necessary. Move Category excludes self/descendants and product-containing destinations; destination search is scoped to the displayed branch. Deletion confirms the captured subtree/product impact and retains history.

Search categories loads matching ancestor context through cancellable branch traversal (up to 5,000 records). Expand All recursively loads branches; Collapse All clears disclosure/search. Arrow keys navigate visible nodes, enter/space selects, and horizontal arrows expand/collapse or navigate parent/child, mirrored for RTL. Expansion persists through staff route changes and CRUD; full reload reconstructs the selected path. Mobile Browse Categories opens a drawer and selection closes it. The normal category migration is applied. Existing assignments resolve through the category schema; relationship editing is not implemented in this workspace.

## Live local catalog demo

The 2026-10-07 demo uses the normal service APIs and database. Browse `http://localhost:8081/products` or edit the same products in `/admin/products`. It contains 10 published sample models, four featured models, seven leaf categories under the six existing collection roots, bilingual content, typed specifications and six processed images. Models, technical values and illustrations are explicitly demonstration content, not manufacturer specifications or certifications.

The seed tool now requires the existing prepared demo category relationships and fails before uploads/writes when they are missing. It creates minimal drafts and then enriches them through versioned edits. It was not rerun during the Product Create fix. With that prepared local project running, repeat the seed with:

```powershell
npm.cmd run demo:seed -- --apply --replace-known-test-records
```

Enter the existing `Admin@left.test` password at the hidden prompt. No password is stored. The tool refuses production and disposable-database configuration, backs up the owning Catalog and Media databases with `pg_dump`, and performs all business changes through authenticated APIs. It reuses demo records and resumable image uploads using the ignored `.local/demo-catalog-manifest.json`; rerunning can update existing records but does not duplicate this catalog. Keep that manifest with the local database.

Cleanup is limited to captured IDs and matching identities: the original `test` category and `p1` product, placeholder cabin child, `metal` type and `tf`/`choice1`/`choice2` attributes. Category previews must still match the captured branch/product counts. Four captured old Media assets are retired only after their usage query confirms no live owner. Soft-deleted history, code reservations and retained files remain. The useful `length` attribute, `Dimensions` group, main categories and staff accounts are preserved. The historical demo operation did not apply the category migration; the later Product Create fix applied it with separate backup/restore evidence.

Backups are ignored local artifacts under `.local/demo-backup-*`; the initial pre-change backup is `.local/demo-backup-2026-10-07T14-18-25-519Z`. Backup creation was verified; restoration was not tested. Current verification and screenshots are recorded in [live-demo evidence](../validation/live-demo-2026-10-07.json).

## Database preparation

For an existing database, follow reviewed Dynamic Catalog and B5 migration procedures first, with coordinated backups and a reviewed target. Then inspect the additive Admin upgrade:

```powershell
npm.cmd run db:admin
npm.cmd run db:admin -- apply --reviewed
```

The second command explicitly applies SQL 21 as the Catalog owning migration role and refreshes runtime grants. Do not execute against an unreviewed live database. Current category fixtures use SQL 25; historical Dynamic Catalog fixtures retain SQL 22. Runtime roles retain no migration privileges. The original Admin implementation did not upgrade the normal database. The later Product Create fix applied the reviewed category cutover; see [migration operations](catalog-migration.md).

## Web and service configuration

Start the existing five-service development composition after database preparation. Initialize private local service credentials with `npm.cmd run auth:setup` if absent. Bootstrap Super Admin using the existing Identity operator flow; there is no default password. Invitations and resets require the configured mail transport.

Set `STAFF_APP_URL=http://localhost:8081/admin/` for Metro, or `http://localhost:8082/admin/` for an exported preview, before starting Identity. Set `ALLOWED_ORIGINS` to the matching origin for Gateway and owning HTTP services. Cookies are SameSite=Strict, so use the same hostname consistently across web, Gateway and Media; do not mix localhost with 127.0.0.1.

Frontend public variables:

| Variable | Default |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` (shared with visitors) |
| `EXPO_PUBLIC_MEDIA_ORIGIN` | `http://localhost:3003` |
| `EXPO_PUBLIC_APP_DATA_MODE` | `api` (public only; staff always uses real APIs) |

Configure `MEDIA_PUBLIC_ORIGIN` consistently for returned binary/delivery URLs. Only public origins belong in bundled variables; service credentials belong exclusively in backend configuration. Rebuild/restart Metro after changing frontend configuration.

For an exported preview, inject the browser-facing origins explicitly before starting the backend (the root `.env.example` documents values; `dev` does not load it automatically):

```powershell
$env:STAFF_APP_URL='http://localhost:8082/admin/'
$env:ALLOWED_ORIGINS='http://localhost:8082'
$env:MEDIA_PUBLIC_ORIGIN='http://localhost:3003'
npm.cmd run dev
```

Run `npm.cmd run storefront:dev`, then open `/admin/login`. Admin lands at `/admin`; Super Admin lands at `/super-admin/admins`. For export, run `npm.cmd run storefront:build` and `npm.cmd run storefront:preview`, then open `http://localhost:8082/admin/login`.

## Verification

```powershell
npm.cmd run check
npm.cmd run test:frontend
npm.cmd run storefront:build
npm.cmd run test:integration
npm.cmd run test:storefront
npm.cmd run test:admin
```

Integration/browser tests must point `BUSINESS_PLATFORM_DATABASE_CONFIG_FILE` to an isolated validation cluster. Browser fixtures create disposable service-owned databases, random credentials and private test files, start actual HTTP applications on Gateway 3000/Media 3003 and remove their own fixtures. Those ports must be free; do not stop unrelated services to make tests run. The browser harness imports the compiled database fixture produced by backend tests and service builds.

On Windows, start the exported preview in a separate terminal before browser tests. The existing preview can be reused, avoiding runner-owned preview shutdown issues. Admin browser tests use localhost; public tests use 127.0.0.1. Test-only security/processing adapters publish image/video/PDF derivatives; video bytes are actual browser-recorded MP4 and raster fixtures are synthetic. These adapters are confined to the harness and do not close production B5 scanner, codec, broker or storage acceptance gates. Stop disposable clusters with process visibility; the cleanup helper rejects a retained PostgreSQL process marker before removing files.

## Current Product Create regression

Use `npm.cmd run test:admin -- frontend.product-create.test.ts frontend.category-tree.test.ts` with the disposable profile. The older combined Admin milestone has pre-policy assumptions and is outside the current phase runner. Current Catalog integration tests use Category contracts; retained migration compatibility tests are intentional. Run browser suites sequentially or give them separate output directories; visitor composition snapshots require an explicit demo export, while staff/live verification uses API mode. Never present historical counts as current verification.


## Current Admin interface verification — 2026-10-10

Use the current phase runner: `npx.cmd playwright test --config tests/frontend.admin-ui.config.ts`. It covers 46 current Category-based Admin scenarios and the reviewed visual suite. Build services/backend test support first. Export web in API mode with child-process EXPO_PUBLIC_API_URL=http://localhost:3400 and EXPO_PUBLIC_MEDIA_ORIGIN=http://localhost:3403. Fixtures own disposable databases and ports 3400/3403/3502/3503; the normal app on 3000–3004/8081 stays running. The runner owns preview 8082, so leave that port free. Run browser suites sequentially.

Set BUSINESS_PLATFORM_ADMIN_CAPTURE_ROOT=.local/admin-ui-retained and BUSINESS_PLATFORM_CATEGORY_TREE_CAPTURE_DIR=.local/admin-ui-retained/category-tree to keep current functional captures separate from dated milestone evidence. Snapshot updates require visual review followed by an ordinary comparison run. Re-export without fixture API/Media overrides when finished; normal local read contracts require restarting services after a read model build. No schema migration is required for Unit usage counts or staff update dates.

The older combined frontend.admin.test.ts milestone is outside this phase runner and has unported pre-policy assumptions; do not claim its counts as current acceptance. Current Catalog PostgreSQL regressions use the Category model and retain migration compatibility tests deliberately. See [the current report](../implementation/admin-ui-redesign-completed-work.md).
