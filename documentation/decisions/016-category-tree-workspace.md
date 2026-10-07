# 016 — Persistent category tree workspace

Date: 2026-10-07. Scope: Admin category navigation and its existing CRUD operations.

## Problem and decision

The previous category workspace displayed immediate children as a table with oversized sibling-order controls. Selection changed the displayed collection rather than preserving catalog context. Expo route instances also recreated staff providers, losing query cache and local expansion state.

Use recursive `CategoryTreeNode`/`CategoryTreeBranch` components with independently paginated owning-service queries. The tree sits beside selected-category details on desktop; mobile uses a full-height drawer. Selection and disclosure are separate targets. Overflow menus carry contextual CRUD and sibling-order actions. Existing version, list revision and deletion-preview preconditions remain authoritative.

The persistent staff layout owns the authenticated API/query provider and a narrow in-memory expansion provider. This preserves branch state and cache across route instances without storing credentials or category drafts in browser storage. Expansion resets at staff login; a document reload starts with selected-category ancestors expanded. Creation expands the captured parent and selects the saved child. Movement expands the destination and preserves selection. Deletion selects a surviving parent when needed.

Search traverses branch APIs breadth-first and retains matching ancestors. It is cancellable and bounded to 5,000 records; an explicit limit error replaces silent partial results. There is no fixed nesting depth. Initial navigation loads roots and expanded branches only. Pages remain capped at 100 records; incomplete or over-500 sibling collections cannot be reordered. This avoids an unbounded tree endpoint for the expected small catalog. An indexed large-catalog search endpoint can follow measured demand.

Category creation previously left every new sibling at SQL's default order zero, producing UUID-dependent initial order. CreateCategory now calculates an append position with the existing exact-bigint `orderBetween` policy and inserts it within the existing service-owned serializable Unit of Work. Whole-transaction retries handle concurrent root insertion. Parent version checks, deferred invariants, translations and outbox atomicity remain. Exhausted bigint ordering rejects creation with an explicit reorder instruction rather than wrapping or silently changing an unbounded sibling set. No SQL migration or public request shape changes are needed.

## Alternatives and limits

Cross-parent drag/drop was not added: explicit movement remains safer and keyboard accessible. Sibling ordering waits for the confirmed transaction and relevant query invalidation rather than presenting an optimistic structural change that could be rejected.

The running Catalog still uses Product Types for specifications. Category-level group mutation APIs and the reviewed cutover remain unfinished in decision 015. This tree change does not apply that migration or invent assignments. Non-leaf details explain the leaf-only rule; leaf details explain the capability limitation and link to their products. Category contracts have retained deletion, not a separate active-state toggle; the editor does not invent one.

## Verification

Real HTTP/PostgreSQL browser scenarios cover four levels, disclosure/selection, ancestor search, keyboard navigation, expansion across route instances and CRUD, automatic parent expansion, persisted sibling order, move/path updates, branch error/retry, deletion, product-leaf rejection, mobile and Arabic/Sorani. The category integration suite adds a creation-order/concurrent-root regression. Final results belong to the dated category-tree validation report.
