# 017 — Minimal category-based product drafts

Date: 2026-10-07. Status: implemented locally.

The Create Product overlay still depended on Product Type schema, required values and an image cover. The database/runtime retained type authority while the category workspace exposed the target classification model. A valid category and Arabic name could therefore never satisfy the old creation prerequisites.

Creation now accepts only `categoryId`, optional `modelCode` and translations with a nonblank Arabic name. Catalog creates an inactive draft with no type binding, values or cover. The controller rejects obsolete input fields rather than ignoring them. The use case owns authorization, current leaf validation, placement serialization and outbox emission; all persistence uses the service-owned Prisma transaction. The client supplies no category version or schema revision for initial creation. Catalog reads and touches the current category inside the serialized transaction so concurrent child creation cannot violate leaf placement.

Category configuration becomes the editing authority after creation. One transaction-bound resolver supplies editor reads, specification validation, configuration impact and publication. Category schema revisions protect later edits. A definition repeated through reusable groups still resolves to one product value. Inactive drafts may omit required values; supplied values must satisfy their constraints. Activation requires complete required values and the existing registered, ready image-cover policy, enforced by application validation and reviewed SQL guards.

The frontend derives eligibility directly from watched RHF category ID and trimmed Arabic name, selected leaf eligibility and mutation state. Selection writes both the selected category and registered form field. Parent nodes remain navigable and explain why they cannot be selected. Errors preserve input; category rejection invalidates the category branches for recovery. Success invalidates scoped product/editor caches, closes the modal, emits the existing shared toast and navigates with Expo Router. No navigation receipt store or browser reload is needed.

Reviewed SQL 23/24 separates expansion/backfill from cutover. SQL 25 composes the fresh category schema. The owning CLI verifies reviewed mapping and exact typed-value parity, applies cutover atomically and refreshes runtime grants after commit. The normal Catalog was backed up, restored with matching retained-row hashes, migrated on the restored copy, then migrated while writers were stopped. Its ten published demo products and existing accounts/assets are preserved. Legacy type IDs remain immutable historical migration evidence; new products cannot bind to them, and retired type workflows fail safely.

Tradeoffs: basics, Media and publication retain independent versioned saves. This fix does not implement the separate category/group relationship editor, replace production providers, or port every historical Type-specific regression suite. The demo seeder now requires an already prepared category schema and fails before writes when relationships are absent; it cannot invent a migration mapping.

See the [implementation and current evidence](../implementation/fix-product-create-disabled.md). Older phase reports retain their historical scope.
