# Deletion implementation baseline

Audit date: 2026-10-08. The current request explicitly replaces the previous blanket soft-delete policy for Product, Media, Attribute, Attribute Group, Unit and Category.

## Current behavior and root causes

| Entry point | Current behavior | Current caller / verification |
| --- | --- | --- |
| `DELETE /api/v1/admin/products/:id` | Versions and confirmation, Product tombstone; owned rows/files retained | Product list/editor; dynamic-catalog integration tests |
| `POST /api/v1/admin/products/:id/media` | Replaces gallery; omissions detach with tombstones; assets shared | Product media editor; dynamic-catalog integration tests |
| `GET /api/v1/admin/categories/:id/deletion-preview`, `DELETE .../:id` | Branch preview and fingerprint; reviewed SQL soft-deletes subtree including Products | Category workspace; category-tree integration tests |
| `POST /api/v1/admin/attributes/:id/changes/{preview,commit}` (commit path is `/changes`) | `definition.delete` tombstones; schema/technical references block | Configuration reviewed-change dialog; dynamic-catalog tests |
| `POST /api/v1/admin/attribute-groups/:id/changes` | `group.delete` tombstones; assigned categories block | Same reviewed-change flow |
| `POST /api/v1/admin/units/:code/changes` | `unit.delete` tombstones; referenced units block | Same reviewed-change flow |
| `POST /api/v1/admin/attribute-options/:id/changes` | Option deprecate/delete uses reviewed schema workflow | Option editor; retained semantics remain outside the six-entity policy |
| `POST /api/v1/admin/media/assets/:id/retire` | Reference guard and durable retirement; metadata and bytes retained | Media library/inspector; Media integration tests |
| `POST /api/v1/admin/media/assets/:id/block` | Security block; retains references/files | Media library; valid security operation, not deletion |
| `POST /api/v1/admin/media/uploads/:id/cancel` | Stops upload; staging retained | Upload drawer; operational cancellation, not business deletion |

The Catalog and Media runtime roles cannot physically delete. Statement triggers also prohibit physical deletion. Deferred integrity checks, circular Product cover/code FKs and technical-sheet references must be handled deliberately. Existing category tests affirm behavior that the new policy supersedes; these need replacement assertions, not suppressed checks.

## Existing-data evidence

Read-only PostgreSQL audit found 11 Products (10 live), 15 Categories (13 live), 13 Attributes, 4 Groups and no technical measurements. Media contains 10 assets, 42 variant rows, 11 processing jobs and 10 upload sessions. Six assets have multiple live Product/Category holders; four also have multiple Product holders. There are 11 retained product-binding evidence rows. No business rows/files were changed by the audit.

The user selected **independent asset and file copies per owner, preserving current visuals**. Migration must retain originals until every independent copy is hash/size verified and all holders are switched. It must not invent a single owner or detach surviving holders. Historical rows and retired evidence are retained until an explicitly reviewed compatibility step can account for them.

## Implementation sequence

1. Expand reviewed SQL with deletion operations, pending-state guards, exclusive ownership and scoped physical-delete permissions; preserve unrelated retention rules and RESTRICT safety rails.
2. Implement a resumable owner-copy migration using Media-owned metadata/storage adapters and Catalog-owned reference switching. Verify every generation, original, staging part and attempt inventory. Do not run destructive migration against the normal profile before disposable verification.
3. Add dependency-free impact/command/operation contracts, explicit use cases and owning-service Prisma interactive transactions. Preview fingerprints include dependency identity/version, not counts alone.
4. Reuse the B5 signed outbox/inbox relay for requested cleanup and completed results. Freeze public/edit visibility on durable acceptance; clear references before file deletion; finalize owner rows only after Media completion. Filesystem/S3 side effects stay outside transaction retries.
5. Implement Attribute destructive value cleanup, Group selective reachability cleanup, Unit all-reference blocking and recursive Category Product blocking, including pending/historical Products.
6. Switch HTTP/OpenAPI/client and shared impact dialog callers. Remove detach-only and obsolete six-entity deletion commands; retain valid option deprecation, security blocking and upload cancellation.
7. Execute real PostgreSQL, HTTP/process, browser, storage, duplicate-delivery and failure-injection checks. Record current evidence separately from historical reports.
8. Contract obsolete paths only after parity and storage convergence are proved; retain compatibility columns where unrelated workflows or historical evidence need them.

## Risks and verification

Critical risks are shared bytes, worker writes racing cleanup, version/impact races, retained FK holders, deferred required-schema checks, provider versions and lost acknowledgements. Each requires a regression test. Provider-native signatures already issued cannot be recalled; authorization must cease at acceptance and capability expiry must be documented. RabbitMQ and private S3 acceptance require real providers; development signed HTTP/filesystem results must not be labeled provider acceptance.
