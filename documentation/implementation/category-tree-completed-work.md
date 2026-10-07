# Golden Lift — Category management tree

Date: 2026-10-07. Scope: Admin category hierarchy, existing CRUD operations and predictable initial sibling ordering. [Decision 016](../decisions/016-category-tree-workspace.md) records the design and tradeoffs. The separate Category classification migration remains in progress.

## Changes

The old immediate-child table and large ordering buttons are replaced by recursive tree nodes. Desktop uses a 350px tree (300px on narrower layouts) beside selected-category information. Rows are 40px tall with 20px logical indentation, separate disclosure/name targets, compact overflow menus, hover/focus states and a subtle gold selection edge. There is no hardcoded hierarchy depth.

Each branch loads independently through the current bounded Category APIs. Skeletons and retry feedback belong to the affected branch; existing data remains visible on refresh failure. Search retains matching ancestors rather than producing disconnected rows. Expand All loads branches recursively; Collapse All resets disclosure/search. Search is cancellable and bounded to 5,000 records with an explicit limit message; it is not an indexed large-catalog search API. More-page actions preserve server cursors.

Root creation and subcategory creation are distinct actions. The child modal captures its parent and version without asking users to choose the parent again. On success, the modal closes, queries refresh, the parent expands, the child is selected and the saved toast appears. Product-containing categories show an explanatory blocking modal; Catalog also rejects invalid child creation. Category contracts have no separate active/inactive toggle, so no unsupported control was added.

Edit preserves expanded branches and unsaved inputs on conflicts. Overflow ordering submits the complete bounded sibling set with its list revision and updates after the committed response. First/last and incomplete/over-500 sibling ordering actions are disabled. Explicit movement displays current/new location, navigates eligible destination branches, searches the displayed branch and retains selection/path. Self, descendant and invalid/content-containing destinations remain backend-rejected. Confirmed deletion uses captured branch impact/version and selects a surviving parent when needed. No document reload is used for mutations.

The persistent staff layout now owns the staff API/query provider and category expansion provider. This fixes route-instance remounts discarding cache and disclosure state. Expansion IDs stay in memory and reset at login. A manual document reload reconstructs selected ancestors. Staff CSS is loaded after shared CSS explicitly to preserve the existing shell and unrelated screens.

New category creation now appends after the last sibling using the existing exact-bigint ordering policy inside the service-owned serializable transaction. Previously every new sibling defaulted to order zero and UUID order controlled placement. Parent version checks, deferred constraints, translations and outbox atomicity remain. Whole-transaction retries handle concurrent root creation. Exhausted bigint order fails explicitly with a reorder instruction. No SQL migration or request-contract change was introduced.

## Keyboard, RTL and responsive behavior

ARIA tree/treeitem/group semantics expose level, expansion and selection. Roving row focus supports up/down, Home/End, enter/space and horizontal parent/child navigation; horizontal keys mirror for Arabic/Sorani. Native overflow controls retain their own keyboard behavior. Disclosure glyph direction is isolated before RTL transforms; indentation and selection use logical CSS. Reduced motion disables transitions. Below 900px, Browse Categories opens a full-height drawer; selection closes it and details occupy the page.

## Visual review

Reviewed captures: [desktop workspace](../assets/category-tree/workspace-desktop.png), [compact tree](../assets/category-tree/tree-desktop.png), [root creation](../assets/category-tree/create-root-desktop.png), [mobile details](../assets/category-tree/detail-mobile.png), [Arabic drawer](../assets/category-tree/tree-mobile-ar.png) and [Sorani drawer](../assets/category-tree/tree-mobile-ckb.png).

Review corrected oversized inherited overflow-button dimensions, heading/overline flow, glyph mirroring and staff CSS load order. Separate review captures preceded replacement of the intentional category editor regression baseline. Other staff baselines were retained for comparison.

## Verification and limits

The new real HTTP/PostgreSQL browser scenarios cover four levels, independent disclosure/selection, ancestor search, keyboard behavior, expansion across route instances/edit/create/move/reorder/delete, captured parent, persisted sibling order, path update, branch outage/retry, confirmed deletion, product-leaf rejection in UI and API with zero invalid children, mobile and both RTL locales. A real concurrent edit additionally proves failed saves preserve drafts and explicit Reload latest shows current server values before another save. Existing staff regressions exercise authorization, conflicts, Media, product/configuration and account workflows. The category integration suite adds append ordering and concurrent root creation.

Final commands, counts and execution status are recorded in [dated validation evidence](../validation/category-tree-2026-10-07.json). Historical milestone evidence is not presented as a new run.

Local verification passed **97 distinct tests**: 37 backend unit, nine frontend unit, 25 category PostgreSQL/HTTP integration and 26 staff browser. The full staff run passed **17 visual comparisons** without baseline updates; after the final conflict-recovery refinement, all four targeted category scenarios passed again. Build, type, format, 215-file architecture/14 enforcement probes, four Prisma schemas and diff checks passed. Initial failures exposed expansion ownership and order-zero creation ties; later test corrections covered the established HTTP 422 invariant status, fresh versus cached branch loading, modal Close disambiguation and asynchronous RTL child loading. Assertions were retained or strengthened.

The browser fixtures disposed their databases and the owned test cluster was stopped and removed. The normal project was restarted with `npm.cmd start`; doctor verified all five services, frontend, four databases and native scanner. A public API probe returned all 10 retained demo products. Staff accounts and normal database configuration were not reset.

Category-level attribute-group assignment is **not implemented by this task**. The running catalog still uses Product Types for specifications; decision 015's migration and mutation APIs remain pending. Leaf details state this limitation; non-leaf details explain the leaf-only rule. This work does not activate that migration or alter the installed demo catalog/staff accounts. It does not claim full acceptance of those group-assignment requirements, hosted deployment, production providers, backup restoration or external accessibility certification.
