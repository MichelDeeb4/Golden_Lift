# Golden Lift Final Catalog/Admin/Visitor Status:

Date: 2026-10-08. Implementation and current verification of the final category-driven Catalog model. See the [baseline](final-catalog-admin-visitor-baseline.md), [decision 020](../decisions/020-final-category-relationships.md) and [migration procedure](../operations/product-type-migration.md). Final local acceptance is PASS, subject to the documented limits and provider scope.

## Product Type removal:

- Removed runtime navigation, editor branches, filters, DTOs, validators, use cases, repositories, Prisma models, Gateway routes and OpenAPI classification workflows. Product storage no longer has a Product Type binding.
- Historical conversion fixtures, reviewed SQL and immutable owner-only migration evidence remain deliberately available for audit. The dependent SQL view retains an always-NULL compatibility slot; neither Prisma nor application/API code reads it.

## Migration:

- The earlier reviewed category cutover and approved `length` → existing `Dimensions` resolution were retained. No new ambiguous mapping was inferred.
- Created a 416,483-byte Catalog backup, restored an isolated rehearsal, verified retirement parity there, then applied SQL 26 to the normal local Catalog. All 11 products and 90 specification values, translations, choice rows, Media and relationship hashes remained unchanged. Bindings for live and deleted products were archived before physical column removal.
- The serializable owning-service migration validates integrity and exact parity before commit. Private backup and raw evidence remain in ignored `.local/final-retirement`; staff accounts and other service databases were retained.
- Migration regression tests cover exact numeric bytes, false values, retained/deleted translations and choices, ambiguity, stale plans, rollback, view identity, immutable archives and runtime privileges.

## Category recursive tree:

- Existing recursive expansion, selection, indentation, ancestor-context search, keyboard navigation, move/reorder and retained expansion state are reused. Four-level browser coverage exercises the actual tree and persistence.

## Leaf Category creation with Group assignment:

- Root and subcategory creation offer searchable Group selection and category-specific ordering immediately. Category, translations and initial memberships commit in one Catalog transaction. Invalid relationships roll back the entire creation.
- Creating a child auto-expands its parent and selects the saved record without a document reload. An empty new category is a leaf; adding children later requires absence of products and Groups.

## Leaf Category edit Group assignment:

- A leaf exposes a focused Group editor with add/remove/order, dirty feedback and captured impact review. Commit rechecks owner versions, schemas and affected product values. Branches show the leaf-only explanation instead of this control.

## Category invariant:

- Owning-service application checks and deferred PostgreSQL integrity enforce children OR products/Groups. Configured leaves cannot receive children. The blocked action explains the conflict in an app dialog.

## Attribute table:

- The existing server-paginated table now includes actual localized Group memberships, with kind, unit, visibility and lifecycle state. Rows retain one overflow action menu.

## Attribute Create multi-Group:

- Creation accepts multiple existing Groups atomically. Group membership is an unordered set; adding an Attribute appends it inside each selected Group without changing other Attribute order. Attribute editing opens the same reviewed membership command.

## Attribute Group table:

- The table displays actual Attribute and leaf-category counts from the bounded result page. Counts are not synthesized global totals. Selection opens an inspector or edit modal and never adds an orphan panel below pagination.

## Group Create multi-Attribute:

- Creation selects existing Attributes, including Attributes already used elsewhere, and persists the initial Group-specific order atomically. Editing supports reviewed add/remove/reorder and translations.

## Category ↔ Group many-to-many:

- `category_attribute_groups` is the single owning relationship. Group order belongs to the Category. Removal soft-deletes the membership and retains shared Group/Attribute/value records.

## Group ↔ Attribute many-to-many:

- `attribute_group_attributes` is the single relationship edited from either direction. Existing membership policy flags are preserved. Deleted references and new memberships for deprecated Attributes are rejected. Inverse owner versions advance when membership sets change.

## Product Create:

- Category and Arabic name are sufficient. The picker only accepts a live leaf; creation produces an inactive draft without requiring specifications, model, Media or cover. Cancel returns to the product collection or its preserved filtered URL.

## Product Category schema:

- Catalog resolves Group order, member order and unique Attribute definitions through the authoritative category schema endpoint. Product forms use that schema and its revision. Category change requires source/target impact preview and explicit commit confirmation.

## Product specification values:

- NUMBER, BOOLEAN, translated TEXT and CHOICE retain normalized typed persistence. Bigint/decimal values remain strings. False, zero, unset and precise numeric values remain distinct.
- Category moves preserve every value. Non-applicable retained fields appear separately with an explicit Delete action and Save. Unrelated saves omit these fields. Publication rejects unresolved non-applicable values; no move or membership operation silently erases them.

## Duplicate Attribute handling:

- An Attribute reachable through multiple assigned Groups creates one editable field and one live product/definition value. The first category-ordered placement supplies presentation; all placements remain metadata. Requiredness uses OR and disclosure uses AND, preserving conservative migrated policies.

## Admin row actions:

- Category, configuration, product, Media and staff actions use the existing shared icon overflow menu. Destructive actions capture the actual owning-service record/version before review and confirmation.

## Button icons/colors:

- Existing shared tokens and icon exports provide gold create/save, neutral edit/view, warning lifecycle actions and red deletion. New membership ordering uses directional arrow icons and Save uses the shared icon.

## Modern dialogs:

- Shared branded modals/drawers handle creation, editing, impacts, deletion and unsaved changes. No `alert`, `confirm`, `prompt` or document reload was added to application workflows.
- CHOICE options can be added from the attribute edit modal while its definition draft stays mounted. Definition changes retain their captured version and explicit impact review; concurrent edits still preserve local input and require review of the latest version.

## Red close buttons:

- Modals and drawers retain the shared red Close X and focus restoration. Pending mutations guard dismissal.

## Filter toolbars:

- Existing shared compact desktop toolbars and mobile adaptation remain on Attributes, Groups, Units, Products and Media. Filters use real server contracts; unsupported account search/status contracts are not invented.

## Pagination:

- Existing bounded server pagination, compact rows-per-page controls, supported URL state and query-cache updates remain. Relationship pickers paginate searchable options and resolve selected labels outside the current page in bounded batches.

## Scroll/sticky fixes:

- Lists retain one primary page scroll context with bounded horizontal table overflow. Shared Select Escape handling now closes an open list without also closing its parent dialog. Browser regressions exercise scroll, zoom, overlays and responsive overflow.

## Orphan UI blocks removed:

- Removed unreachable legacy configuration state and retired route notices. Normal collection state ends after pagination. Focused editors and inspectors own selected record content.

## No-reload behavior:

- TanStack Query invalidation/cache updates and client navigation update saved records. Browser document markers verify in-place mutations; separate manual reload assertions verify persistence rather than implementing reload as the save behavior.

## Visitor media gallery:

- Images and videos share one selected viewer and thumbnail strip. Videos have poster, play icon and localized VIDEO badge; actual encoded playback is verified. Existing fullscreen, keyboard, touch and direction-aware navigation remain. PDFs retain independent Catalog/Media permission checks.

## Visitor navigation:

- Catalog supplies the full category ancestor trail and deterministic same-category eligible Previous/Next products. Product pages expose Back to Category, More from Category and View all. Inactive, deleted or blocked-cover products cannot become neighbors.

## RTL:

- English, Arabic and Sorani preserve logical layout, per-translation input direction and isolated technical values. Real visitor gallery captures cover English desktop, Arabic mobile and Sorani tablet; staff regressions cover mobile RTL editing, menus and pagination.

## Accessibility:

- Shared semantic controls, labels, visible focus, modal containment/restoration, menu Escape, tree keyboard navigation and non-drag ordering alternatives remain. Select Escape now respects the current overlay level. Contrast/font unit checks remain; full assistive-technology certification is not claimed.

## Tests executed:

- **217 distinct passing tests**: 39 backend unit, 89 backend integration, 22 migration, 9 frontend unit, 53 staff/real-visitor browser and 5 explicitly labeled demo-visitor browser. Zero failed, skipped or flaky browser tests. **23 visual comparisons** passed without baseline updates: 16 staff and 7 visitor.
- `npm.cmd run check` passed build, types, format, architecture (227 source files and 14 enforcement probes), four Prisma schemas and backend units. API/demo exports, independent service-process smoke and final diff checks passed. Commands and exact current results are in the dated evidence linked below.
- Visual review preceded intentional baseline updates. Initial iterations corrected old selectors, mobile Leave/Stay expectations, stale sidebar grouping and specification help. Final comparison runs used the completed export without updating baselines.
- Earlier Product Type-specific behavioral tests were ported to category authority. Coverage continues to check privacy, deduplication, ordering, precision, concurrency, retention, publication and deletion. Historical migration fixtures retain Product Type data only to prove conversion. No architecture check or business assertion was suppressed to force a pass.

## Real E2E workflows:

- The mandatory workflow creates an Attribute in multiple Groups, creates a Group with existing Attributes, selects a parent, creates its leaf with initial ordered Groups, creates a category-only Product, edits unique fields, saves and reloads. It checks one Material input/value and exact numeric persistence.
- Additional real HTTP/PostgreSQL/browser coverage checks both relationship editing directions, reviewed category moves, retained-field cleanup, rollback, role separation, Media playback/delivery, four-level tree, CRUD, accounts, filters, pagination and branded dialogs.
- Fixture mail, scanning and processing adapters are explicitly test-only. APIs, owning services, isolated PostgreSQL and private storage are real; production provider acceptance remains separate.

## Persistence verified:

- The test suite reads actual owning-service responses and database values after browser reload. Normal migration parity compares retained rows and identities. The owned disposable PostgreSQL cluster was stopped and removed. The normal project was restarted with `npm.cmd start`; the website on port 8081 and all five service readiness endpoints on ports 3000–3004 returned HTTP 200. Normal local data, staff accounts and configuration were retained.

## Known limitations:

- Interactive relationships are bounded at 500 selected IDs, 100 affected categories and 1,000 affected products; larger reviews fail explicitly. Product mutation requests accept 500 typed changes, matching the form bound. Visitor ancestor resolution rejects paths exceeding its 500-node read bound.
- Categories use the existing live/soft-deleted lifecycle, without a separate Active flag. Creation makes a live category; deletion remains a reviewed retained branch operation. No fake toggle or second lifecycle model was introduced.
- Product basics/specifications, Media and publication keep independent save boundaries. CHOICE options also save independently, preserving explicit version review for concurrent changes.
- Immutable legacy SQL evidence and the inert compatibility-view slot remain outside runtime classification. Historical reports remain dated, and previous tests are not reported as new execution.
- No hosted CI/deployment, production SMTP/scanner/codec/broker/S3 acceptance, external accessibility audit or device performance benchmark is claimed.

## Acceptance:

**PASS — final local implementation acceptance.** The mandatory leaf creation with initial ordered Groups → category-only Product → deduplicated typed values → Save → reload workflow passes with real APIs and PostgreSQL persistence. [Dated validation evidence](../validation/final-catalog-admin-visitor-2026-10-08T13-16-47-178Z.json).

## Reviewed current screenshots

- [Leaf creation with ordered Groups](../assets/final-catalog-admin-visitor/leaf-create-groups.png) and [persisted product values](../assets/final-catalog-admin-visitor/product-values.png).
- Real visitor gallery: [English desktop](../assets/final-catalog-admin-visitor/gallery-en.png), [Arabic mobile](../assets/final-catalog-admin-visitor/gallery-ar.png), [Sorani tablet](../assets/final-catalog-admin-visitor/gallery-ckb.png).
- Staff baselines are versioned in `tests/frontend.admin.test.ts-snapshots`; public demo baselines are in `tests/frontend.browser.test.ts-snapshots`. Current menu, dialog, tree and pagination captures are in this phase’s screenshot directory.
