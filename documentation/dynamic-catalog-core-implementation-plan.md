# Dynamic Catalog Core implementation

This milestone follows completed B4 category administration and precedes full product management. B5 remains Media core. It preserves the existing four service databases, pinned Node/Prisma stack, Clean Architecture, immediate publication and retained soft-deleted data.

Status: implemented and locally verified. Installed project data remains v1.1; real cutover is an operator task requiring separate authorization.

## Completed implementation sequence

1. Verify the current build and inspect existing Catalog state without modifying installed business data.
2. Add reviewed expansion SQL for product types, reusable groups, placements and type assignments; extend existing attributes with disclosure/deprecation and supported validation metadata. Add explicit inventory, reviewed mapping, resumable backfill, validation and coordinated cutover tools.
3. Replace category applicability at cutover while retaining all unrelated validators and legacy rows. Extend lifecycle guards, deferred integrity, effective schema revisions and privacy projections. Verify fresh/upgrade parity on disposable databases.
4. Implement focused domain validators, effective-schema reader and configuration/product use cases behind transaction-scoped Prisma ports. Add safe change/copy/type-change previews and confirmed commits with scoped preconditions.
5. Add strict HTTP contracts, live Admin authorization, Gateway routes and public product projections. Preserve B3/B4 behavior and private technical evidence.
6. Add real PostgreSQL/API/process, migration, privacy and deterministic concurrency tests. Run all established checks, measure representative fixtures, update the model dictionary/operating guide/OpenAPI/progress and save timestamped evidence.

## Scope boundaries

No production business-data migration, credential changes, commits or pushes are authorized. Tests use disposable databases and trusted synthetic image registrations. Media delivery, commerce, technical-sheet administration, frontend/mobile applications and Inquiry workflows remain separate work.

## Completion evidence

All six steps above are implemented. The seven established npm commands passed; 29 unit and 82 PostgreSQL/API integration tests passed. Explicit legacy and dynamic SQL verifiers each passed seven suites/four concurrency checks/all 12 cross-service denials. Final ORM parity covers 66 physical tables, 646 columns and 73 foreign keys. Disposable fixtures were removed and installed Catalog/Identity counts were rechecked. See [timestamped validation](validation/dynamic-catalog-2026-10-04T11-27-52-880Z.json), [operator guide](operations/dynamic-catalog.md), [model dictionary](../database/docs/model-dictionary-v1.2.md) and [decision 006](decisions/006-dynamic-catalog-core.md).
