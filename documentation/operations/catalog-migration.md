# Category classification migration

Status: **category authority applied to the normal local Catalog**, 2026-10-07, during the [Product Create fix](../implementation/fix-product-create-disabled.md). Writers were stopped; an owning-database backup restored with matching retained rows, and migration passed on the restored copy before normal application. The ten published demo products, existing staff accounts and Media were preserved. This is local migration evidence, not a hosted release. Use only Catalog owning credentials. `.local/database.json` is the normal profile; `BUSINESS_PLATFORM_DATABASE_CONFIG_FILE` selects an isolated profile. Credentials, raw inventory and reviewed mappings stay ignored locally.

Physical product bindings were archived and removed on 2026-10-08 after backup/restore rehearsal and exact parity. See [binding retirement](product-type-migration.md). The staged backfill/cutover commands below apply only before retirement; inventory remains available afterward.

Read-only inventory:

```powershell
npm.cmd run db:category -- inventory --output .local/category-catalog-inventory.json
npm.cmd run db:category -- propose --resolutions .local/category-catalog-resolutions.json --output .local/category-catalog-mapping.json
```

The proposal defaults to `reviewed: false`. Review its exact database, inventory hash, policy flags, orders, relationships, source categories, unused type evidence and typed-value fingerprints. A reviewed flag is not permission to invent a mapping. Changed source versions, unknown resolutions, ungrouped attributes, conflicting reusable-group policies or conflicting category schemas stop backfill. Names are never used to infer classification.

The earlier user-approved `length` → `Dimensions` mapping belongs to the historical pre-demo inventory and is not a template for unrelated records. The current normal demo inventory was reviewed separately: seven leaves, nine shared demo definitions, 21 category/group placements, nine group members and zero unresolved issues. No names were used to infer new relationships. Exact versions/fingerprints were checked before execution.

For a selected disposable target, the additive migration and reviewed backfill commands are:

```powershell
npm.cmd run db:category -- expand --confirm-database <exact-catalog-database>
npm.cmd run db:category -- backfill --mapping .local/<reviewed-mapping>.json --confirm-database <exact-catalog-database>
npm.cmd run db:category -- validate --mapping .local/<reviewed-mapping>.json
npm.cmd run db:category -- cutover --mapping .local/<reviewed-mapping>.json --confirm-database <exact-catalog-database>
```

Expansion adds joins without changing existing schema authority or source versions. Backfill uses the existing serialization gate, a serializable transaction, deterministic relationship IDs and exact final row comparison. Repeating an unchanged backfill is idempotent. Conflicting existing relationships are rejected, never overwritten. Validation checks typed parent/text/choice totals, live counts and complete retained-row fingerprints, including soft-deleted rows. Any failure rolls back.

The cutover command checks the exact database, reviewed proposal, prepared relationships and typed-value parity, then applies reviewed SQL 24 on the same serializable transaction/client under the Catalog write gate. It refreshes runtime grants only after commit. SQL 25 composes the fresh category schema. Coordinate writer shutdown, owning backup/restore verification, fresh inventory/review, expansion/backfill/validation, cutover and new-binary startup for each target. This is not an automatic migration on startup. Rechecking after cutover must use the new runtime; retired type reads/mutations fail safely. No runtime role gains migration privileges.

Run the dedicated real-database regression suite on a task-owned disposable cluster:

```powershell
node scripts/b5-environment.mjs start
$fixture = Get-Content .local/b5-validation-pointer.json -Raw | ConvertFrom-Json
$env:BUSINESS_PLATFORM_DATABASE_CONFIG_FILE = $fixture.configFile
npm.cmd run test:catalog-migration
node scripts/b5-environment.mjs stop
Remove-Item Env:BUSINESS_PLATFORM_DATABASE_CONFIG_FILE
```

The suite creates and drops its own Catalog database. It refuses a normal profile. It verifies the actual CLI backfill/validation, ambiguity and stale review rejection, typed-value preservation, deduplication, leaf constraints, global privacy, physical deletion protection, immutable ownership, versioning, concurrent serialization, runtime privileges, draft/publication rules, schema revisions and a real Gateway/Catalog HTTP read. The HTTP fixture supplies explicit test authentication; it does not claim new live Identity or production-provider acceptance.
