# Golden Lift Admin CRUD Modal Fix Status

Date: 2026-10-07. Scope: focused staff CRUD, permanent creation actions, SPA navigation and scoped query refresh. See [baseline](admin-crud-modal-fix-baseline.md) and [decision 014](../decisions/014-admin-crud-modals.md).

Implementation and final local regression acceptance are complete. Historical milestone evidence remains dated and separate.

## Create Attribute button

ADMIN always has a primary **Create Attribute** action, including when a row is selected. The attribute collection keeps its full table width and actual type, canonical unit, visibility and row actions after selection; other configuration resources retain their compact master/detail layout. SUPER_ADMIN remains denied Catalog views and mutations. Resource-specific Create Product Type, Create Group, Create Unit and Create Category actions are explicit.

## Attribute create modal

An independent RHF draft submits the existing Catalog API. Shared fields display only the selected kind's supported metadata; canonical units come from bounded owning-service lookups. Numeric precision retains the existing exact numeric(20,6) contract. Successful creation seeds the returned detail in TanStack Query, refreshes affected lists and selects the created record when no existing draft would be displaced. Errors retain the modal and draft; concurrent submissions are prevented by the pending button state.

## Attribute edit modal

Metadata editing uses a focused overlay and captures record/schema versions when opened. Save retains the existing signed impact-preview and confirmation workflow. A stale version leaves the draft open; Reload Latest explicitly replaces it with current metadata and version. If the record changes after the signed impact preview, reloading also closes and clears that stale review so the next save obtains a fresh signed preview. Confirmed saves close both review and edit dialogs and update selected detail/list data.

## Attribute delete modal

Deletion/deprecation retain actual usage-impact previews, captured versions and explicit confirmation. Backend soft deletion and schema policies remain authoritative. The view refreshes in place; deletion clears invalid selection and deprecation retains a valid selected record even if current filters exclude its row.

## Product Type modal CRUD

Create and simple metadata edit use overlays. Schema/group/attribute assignments, required flags, ordering and impact reviews remain a dedicated detail workspace. Deletion/deprecation retain reviewed confirmation.

## Attribute Group modal CRUD

Create and metadata edit use independent focused forms; deletion uses the existing impact-confirmation API. No unsupported ordering/state payload is invented.

## Unit modal CRUD

Creation uses code, symbol, dimension and translated labels. Editing changes the supported translated labels; immutable identity/symbol/dimension remain read-only. Labels omit unsupported descriptions. Delete uses the existing reviewed workflow; there is no invented unit-deprecation API.

## Category modal CRUD

The tree/master-detail collection remains. Creation has an actual bounded parent picker, translations and optional cover. Metadata editing uses a modal and captured version. Moves, branch-state changes and deletion retain their existing validation/impact confirmations. Selecting a category no longer automatically opens its editor. Deletion navigates through the client router to the surviving parent or root. Dirty forms warn on closing; confirmed edits retain selection and update tree/detail data.

## Product create flow

Products and dashboard expose a creation overlay. It collects type, leaf category, translations, optional model code, required dynamic values and verified image cover. Cover and required values are mandatory existing backend constraints, including inactive drafts. Confirmed creation closes the overlay and navigates to the returned product ID through the client router. The complex editor remains a workspace. The legacy `/admin/products/new` route remains available for direct links.

## Product delete modal

Existing explicit confirmation submits the loaded version and confirmed deletion flag. Successful deletion returns through the client router to the validated product-list context, retaining its filters/cursor. Unknown origins/pathnames or malformed return links fall back to the product list. Retained Media bytes remain unchanged.

## Media upload overlay

The resumable upload drawer remains. Actual B5 initiation, parts, completion and status polling update the grid automatically. Processing status is announced through a live status region. Closing/reopening retains the in-memory transfer; it does not discard it. Existing private capability/delivery and retention policies remain.

## No-reload behavior

Internal staff anchors use the client router while retaining modifier-click/download behavior and existing dirty-navigation warnings. Configuration selection stays local; normal mutation refresh uses TanStack Query. Category deletion and session-expiry handling no longer use document redirects. A source guard rejects hard reload/assignment calls in staff code; browser document markers prove continuity across critical CRUD operations. Intentional reloads in tests verify persistence after those assertions.

## TanStack Query invalidation

The established `staff` keys remain the only staff server-state model. Mutation scopes refresh affected configuration/schema/form/product, category/tree/placement, product/count, Media/usage/eligibility, or Identity/session families. They do not invalidate unrelated staff providers. Returned configuration entities seed detail cache directly. Public catalog invalidation retains existing confirmed-mutation behavior. Provider-held success feedback contains UI-only message/sequence data and survives overlay closure/navigation. Preview requests do not announce success.

## Filter/selection preservation

Configuration search/type/visibility/state filters use URL parameters and explicitly apply to the loaded cursor page. The owning APIs currently lack global configuration filtering. Mutation does not reset these filters or the cursor. Selected records remain after editing; creation selects a confirmed returned record when safe, without displacing a dirty existing draft. Product list context travels to its editor for deletion return. Category deletion selects its surviving parent/root.

## Hover/focus/pressed states

Existing gold button, select, field, tab, table/menu and Media interactions remain. Selected configuration rows have a stable background/outline. Modals use existing restrained animation and reduced-motion support. Headers and action bars remain accessible while scrolling long forms; pending save/review cannot be dismissed or duplicated.

## RTL

English LTR, Arabic RTL and Sorani RTL retain logical placement, locale typography and independently directed translation inputs. Browser checks cover dirty-close warnings, draft reopening and focus restoration in all three locales.

## Responsive

Modal width is viewport-bounded. Forms use two columns where appropriate on desktop and stack below 768px. Mobile checks use 390px and verify that dialog content does not overflow horizontally. Product/type/category/Media large workflows retain their responsive workspaces.

## Tests executed

**73 passing tests**: 37 backend unit, 9 frontend unit, 22 staff browser and 5 visitor browser. Final browser reports contain zero failed, skipped or flaky tests. **24 visual comparisons** passed without baseline updates: 17 staff and 7 visitor. Build/types/format, 208-file architecture lint with 14 enforcement probes, four Prisma schemas and diff checks passed. Verification covers project build/types/format/architecture/Prisma/backend unit, frontend unit, all staff browser regressions and changed visual baselines. Browser fixtures use real owning-service HTTP and isolated PostgreSQL; their scanner/processing/mail adapters do not establish production-provider acceptance. Initial test adjustments targeted native-dialog nesting, translated-label initialization, category-picker row selection, background toasts behind native overlays and precise safe errors; existing business assertions were retained.

Final commands: `npm.cmd run check`, `npm.cmd run test:frontend`, `npm.cmd run storefront:build`, `npm.cmd run test:admin` with the disposable PostgreSQL profile, `npm.cmd run test:storefront` with a separate explicitly labeled demo export, and `git diff --check`. The API export was restored afterward. Staff screenshots were reviewed before intentional baseline replacement, then checked in a separate run without capture/update flags. A mobile screenshot initially differed because a locale change retained a small scroll offset; the capture helper now consistently starts at the top, without removing the scrolling assertions. New list checks assert metadata and row-action visibility after actual creation and selection. A restricted Windows frontend-unit launch could not read account information; the supported authorized launch passed all nine checks.

## Screens reviewed

| Workflow | Evidence |
| --- | --- |
| Attribute creation and editing | [Create](../assets/admin-crud-modals/admin-attribute-editor.png), [edit](../assets/admin-crud-modals/attribute-edit-desktop.png) |
| Type and category creation | [Product type](../assets/admin-crud-modals/admin-type-editor.png), [category](../assets/admin-crud-modals/admin-category-editor.png) |
| Product creation and Media upload | [Create Product](../assets/admin-crud-modals/product-create-desktop.png), [upload drawer](../assets/admin-crud-modals/admin-upload-drawer.png) |
| Mobile modal | [English](../assets/admin-crud-modals/attribute-create-en-mobile.png), [Arabic](../assets/admin-crud-modals/attribute-create-ar-mobile.png), [Sorani](../assets/admin-crud-modals/attribute-create-ckb-mobile.png) |

All 22 documentation captures are separate from historical redesign evidence. Long forms scroll within the bounded dialog with sticky heading/actions; captures start at the top. Full accessibility/cross-browser certification is not claimed.

## Persistence after browser reload

Mandatory browser flows assert UI mutation without document replacement, then reload and verify persisted configuration/category records or deletion. Product creation/deletion additionally checks actual PostgreSQL rows. Media reaches READY through actual HTTP workflows, appears without reload, then remains after reload. A concurrent real Catalog change exercises preserved stale drafts and explicit recovery.

## Known limitations

- Configuration filters are clearly scoped to the loaded cursor page; global filter APIs, global usage totals and configuration updated timestamps are absent from current contracts. No totals/timestamps are fabricated.
- Product creation requires a verified cover and complete required specifications under the existing backend contract.
- Metadata saves retain a separate signed impact-confirmation step rather than bypassing optimistic concurrency/schema review.
- Unit symbol/dimension and stable configuration codes remain immutable. No unsupported precision/state/unit-deprecation field is added.
- Direct legacy product-creation links remain supported. Normal dashboard/list creation uses the overlay.
- No backend/SQL/schema changes, fresh full backend integration-suite run, hosted CI, production SMTP/scanner/broker/storage/Linux acceptance or external accessibility certification is claimed.

## Acceptance

**PASS — final local acceptance for the implemented scope, subject to the contract/provider limitations above.** No user/external design sign-off is claimed. [Dated validation evidence](../validation/admin-crud-modal-fix-2026-10-07T11-57-51-306Z.json).

The fixture disposed its isolated databases. The task-owned PostgreSQL cluster was stopped and removed. The normal project was restarted with `npm.cmd start`; the website on port 8081 and all five service readiness endpoints on ports 3000–3004 returned HTTP 200. Existing local accounts and database configuration were retained.

A read-only browser probe confirmed normal API-mode homepage, categories, products and staff login, with no demo notice, client errors or failed public API requests.
