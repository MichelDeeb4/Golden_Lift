# Golden Lift Admin Scroll & Pagination Fix Status

Date: 2026-10-08. Scope: Admin configuration collections, Products, Media and Super Admin accounts. See the [before audit](admin-scroll-pagination-baseline.md), [decision 018](../decisions/018-admin-scroll-and-pagination.md) and [dashboard guide](../admin-dashboard.md). This report describes this task; earlier milestone evidence remains historical.

## Root cause of floating line/label

The entire Attributes/Groups master table retained `position: sticky; top:100px` after its parent became a single-column collection grid. It painted across the following empty detail canvas. The apparent floating line was that canvas's 2px top border; “Choose — Attributes/Attribute groups” was its ordinary paragraph. Actual DOM/computed-style measurements and before screenshots confirmed the cause independently on both routes.

## Attributes view fix

The table is a static collection block. Optional selected-record details appear below it in normal flow; no empty “Choose” canvas is rendered. Direct Edit and overflow actions remain accessible. Confirmed deletion cancels/evicts the deleted detail query before invalidating collection queries, avoiding a stale 404.

## Attribute Groups view fix

Groups use the same corrected static collection composition. Their layout was separately exercised at top/middle/bottom, with 26 fixture groups before deletion and 25 afterward. This is not inferred solely from Attributes.

## Scroll context changes

Ordinary collection pages use the document for vertical scrolling and an unconstrained shared table wrapper for horizontal overflow. There is no mobile configuration master-list max-height/secondary vertical scrollbar. Category trees, editor rails and modal/drawer scrolling retain their intentionally scoped behavior.

## Sticky header changes

The erroneous whole-table stickiness is removed from configuration collections. Table headings remain in normal flow. The existing 68px command bar/sidebar behavior is retained; shell sizing now names the command-bar height. No arbitrary top offset or fixed table height is added.

## Z-index changes

None. Existing command-bar, sidebar and overlay stacking remain. No global border/shadow removal, focus suppression or `z-index:9999` workaround is used.

## Shared pagination component

`GLDataPagination` supplies localized range/count, Previous/Next, current-page indication, bounded numbered navigation, row sizes, loading/disabled behavior and compact RTL/mobile controls. The existing public `GLPagination` is unchanged. `AdminPagination` and `useAdminPagination` adapt URL/local state to owning-service requests; UI primitives do not import routing or service implementations. Shared collection error feedback offers Retry without a document reload.

## Attributes pagination

New bounded numbered Catalog queries apply code/translated label search, kind, visibility and deprecation before count/page selection. Stable order: code then ID. Tests cover 63 records as 25/25/13, combined filters, page-two edits, invalid bounds, legacy cursor compatibility and out-of-range normalization.

## Attribute Groups pagination

Numbered server pages, filtered totals and stable code/ID ordering. Deleting the only page-two item returns to page one while retaining search and the document. Groups have no deprecation lifecycle; a deprecated-only filter produces an empty collection rather than inventing state.

## Units pagination

Numbered server pages, code/translated label search, filtered totals and unique-code ordering. Tests exercise 25/1 rows and the shared controls. Units likewise have no deprecation lifecycle.

## Products pagination

Existing ID or filter-bound manual bigint/ID keysets remain. Filtered totals are counted before the cursor in the owning Catalog transaction. Search/category/state/featured/order and page-size state are preserved; changing filters starts at page one. Mixed fixture products verify filtered paging without counting or returning unrelated products.

## Media pagination

Existing ID cursor remains, with server-side original filename/kind/status filters and owning-service totals. One-row lookahead determines the final page instead of returning the last ID as an unconditional next cursor. Tests use 26 uploads processed through the disposable Media pipeline, page 25/1, refresh, empty search and loaded private previews. The picker uses local shared pagination. Asset usage also uses shared controls while retaining its bounded offset API and unknown total.

## Admin Accounts pagination

Existing exact created-at microsecond/ID keysets remain. Identity counts nondeleted ADMIN accounts and selects the page in an opt-in repeatable-read snapshot; mutation isolation/role policies remain unchanged. The shared footer provides Previous/Next and row sizes. Detail/Edit links retain collection query state. Tests invite 25 additional accounts, exercise 25/1, refresh/Previous, then delete the only last-page account and verify 25 retained accounts on page one.

## Category tree pagination/lazy loading

Categories retain recursive branch cursors and lazy Load more actions. They do not acquire a flat table footer. Existing tree/draft/move/order/deletion/mobile regressions are verified separately.

## URL state preservation

The staff shell uses Expo's public unstyled full-history router. Query navigation retains the mounted screen, prior rows and local selection while recording browser history; normalization replaces its parameters in place. The public router is unchanged.

Page, row size, filters, sorting and short visited cursor histories are URL state. Navigation pushes history; normalized invalid pages replace it. Larger cursor histories use tab-scoped session storage behind an opaque URL key to keep refresh URLs bounded. The cache contains no credentials. Same-tab Back/refresh restores it; copied large-history links in another tab normalize to page one.

## Filter preservation

Request state participates in query keys. Filters run on the server and reset page/cursor boundaries when changed. Edits and deletes invalidate/refetch the current query. Slow requests keep prior rows while controls are disabled; retrying a service error retains URL/filter state. There is no `location.reload()` flow.

## Rows-per-page

10, 25, 50 and 100, default 25, consistently exposed by the shared control. Owning APIs validate sizes up to 100. Numbered configuration queries clamp pages beyond the filtered collection; empty cursor pages step back to the previous valid page.

## RTL

Arabic/Sorani labels, logical layout and isolated page numbers are supported. Browser checks exercise keyboard pagination, page-two rows and no document horizontal overflow on 390px mobile. Wide table columns remain reachable through their horizontal container.

## Responsive

Attributes/Groups scroll checks run at 1440px and 1024px, with 100% and 125% CSS zoom. Mobile pagination uses compact current-page/Previous/Next controls and a full-width row-size selector. The ordinary table wrapper has no actual vertical overflow. CSS zoom is explicitly a simulation; native browser zoom/cross-browser certification is not claimed.

## Tests executed / E2E results

Final code checks pass: build/types/format, architecture (221 source files and 14 enforcement probes), four Prisma schemas and diff checks. **71 distinct tests pass**: 37 backend unit, 9 frontend unit, 9 pagination/API browser, 11 existing workflow browser (4 Category tree, 6 Product Create, 1 Identity lifecycle), and 5 public browser. The three final browser reports contain zero failed, skipped or flaky tests. Seven existing public visual comparisons pass without baseline updates.

Commands: `npm.cmd run check`, `npm.cmd run test:frontend`, API/demo-mode `npm.cmd run storefront:build`, focused Playwright pagination and existing-workflow runs with `tests/frontend.admin.config.ts`, public comparisons with `tests/frontend.playwright.config.ts`, and `git diff --check`. A separate focused scroll run retakes the evidence with instant test-only scrolling and asserts `scrollY === 0` before each top capture; repeated tests are not added to the distinct total.

Initial test failures revealed query-history replacement, stack navigation remounting the table, and stale deleted-detail refetches. These were fixed in the implementation. Other failures came from native-select/review-button selectors, a hidden mobile Category drawer, and deleting the fixture Admin before later login tests; assertions were corrected or fixture sequencing repaired without removing behavior checks. The final latency/outage test keeps real owning-service data and asserts expected 503 responses separately; clean authenticated screens have no unanticipated console errors or JavaScript exceptions. Historical screenshots regenerated by existing regression tests are restored rather than silently redated.

## Visual regression reviewed

Before captures preserve the actual Attributes/Groups artifact. After captures cover both collections at top/middle/bottom, tablet/zoom variants, Units, Products, Media with a loaded preview, account pagination, and Arabic/Sorani mobile controls. These are reviewed screenshots and structural assertions, not newly established pixel-equality baselines. Existing public screenshot comparisons are run separately without baseline updates.

| View | Evidence |
| --- | --- |
| Attributes | [Before overlap](../assets/admin-scroll-pagination/before/attributes-bottom.png), [after middle](../assets/admin-scroll-pagination/after/attributes-mid.png), [after footer](../assets/admin-scroll-pagination/after/attributes-bottom.png) |
| Groups | [Before overlap](../assets/admin-scroll-pagination/before/attribute-groups-bottom.png), [after middle](../assets/admin-scroll-pagination/after/attribute-groups-mid.png), [after footer](../assets/admin-scroll-pagination/after/attribute-groups-bottom.png) |
| Units / Products | [Units](../assets/admin-scroll-pagination/after/units-pagination.png), [Products](../assets/admin-scroll-pagination/after/products-pagination.png) |
| Media / Accounts | [Media](../assets/admin-scroll-pagination/after/media-pagination.png), [Accounts](../assets/admin-scroll-pagination/after/accounts-pagination.png) |
| RTL mobile | [Arabic Attributes](../assets/admin-scroll-pagination/after/ar-attributes-mobile.png), [Sorani Groups](../assets/admin-scroll-pagination/after/ckb-attribute-groups-mobile.png) |

## Backend changes and compatibility

Catalog adds a focused collection-reader application port and Prisma adapter on its existing serializable unit of work. Products/Media/Identity add filtered counts through their own repositories and transaction clients. OpenAPI and the Gateway's synchronized specification describe the additive query/metadata changes. Existing cursor selectors, authorization, optimistic/schema versions, precision and soft deletion are retained. No database migration, automatic schema synchronization or new dependency is introduced; count/page queries remain bounded, with page-batched relationship includes rather than per-row HTTP calls.

## Known limitations

- Cursor lists intentionally allow Previous/Next instead of direct jumps to unvisited boundaries. Counts/ranges can shift under concurrent writes; pages are not a long-lived database snapshot.
- Large-history copied links cannot reconstruct another tab's session cache. Storage-restricted browsers fall back to URL history and remain subject to browser/server URL limits.
- Media usage does not expose a total; a full page probes the next offset and an empty page steps back. Picker/usage navigation is local to the mounted view.
- Configuration offset/count queries are suitable for bounded dictionaries; very large datasets may warrant measured indexing/query-plan work. No production load benchmark is claimed.
- Browser fixtures use test-only scanning/processing/mail adapters and disposable databases. They do not certify production SMTP, scanner/codec isolation, broker/cloud storage, deployment or hosted CI.
- The historical full Admin suites still include retired Product Type workflows. This task records the affected current regressions it actually runs and does not claim the entire historical suite was ported or rerun.

## Acceptance

**PASS — local implementation acceptance.** [Dated validation evidence](../validation/admin-scroll-pagination-2026-10-08T08-41-41-864Z.json) records actual final results. The focused screenshot-retake test also passes; all 18 after screenshots are reviewed. The owned disposable clusters are stopped and removed. The normal project is running with `npm.cmd start`: website 8081 and all five readiness endpoints 3000–3004 return HTTP 200. Existing local accounts and catalog data are retained. Production provider/deployment acceptance remains outside this task.
