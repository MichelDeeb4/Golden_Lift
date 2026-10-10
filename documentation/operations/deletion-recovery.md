# Deletion rollout and recovery

Current state: reviewed SQL and new application paths are implemented and tested on disposable PostgreSQL/filesystem fixtures. The normal development profile completed SQL 27/28/29 and all 28 owner copies on 2026-10-08, with no active Catalog/Media application clients. Coordinated backups are under `.local/deletion-backups/2026-10-08T19-29-22-541Z` (not repository artifacts). Original source objects and upload evidence remain. Installed Prisma/SQL parity passes. Tests used isolated ports 3400/3403/3502/3503. Project application processes were stopped before rollout and were not automatically started.

## Reviewed rollout order

1. Stop Catalog/Media API, worker and event writers. Take coordinated backups of both databases and private storage. Retain the pre-migration artifact and file inventory. Runtime roles must never run migrations.
   The local-only `node scripts/deletion-rollout.mjs --reviewed` automates backups, client checks, expansion, reference copies and exclusive-owner enforcement with the existing owning-role tooling. A failed copy resumes using the same manifest. It refuses a non-default/production profile and does not restart writers.
2. Apply `27_catalog_deletion_expand.sql` to the already category-cut-over Catalog and `28_media_deletion_expand.sql` to Media, each atomically as its owner. Reapply `07_permissions_template.sql` through the existing owning-role tooling. Catalog migration prerequisites include the reviewed product-binding retirement.
3. Build the services. Run `node scripts/deletion-owner-copies.mjs plan`. The current normal-profile manifest contains 28 Product/Category holders across six shared assets. This stage writes only the local manifest.
4. With writers stopped, run `node scripts/deletion-owner-copies.mjs apply --reviewed`. Copy verification precedes reference switching. The same manifest and target IDs are mandatory for resume; do not regenerate IDs after a partial run. Existing verified objects/rows are checked again. Source bytes and upload evidence remain intact.
5. Review remaining holders and resolve retained-reference compatibility, then apply `29_catalog_media_ownership.sql` atomically as Catalog owner. It refuses a shared-owner inventory. Do not skip its assertion.
6. Restart the API/worker/event processes from the new build. Verify impact/DELETE contracts, signed coordination, pending visibility, complete storage removal and retained shared definitions. Reproduce the reviewed dictionary with `node scripts/deletion-schema.mjs` after compiling tests; that command creates and disposes its own databases. Verify the installed profile separately with `npm run orm:verify`.
7. Contract obsolete soft-delete application/SQL paths only after migration and acceptance evidence. Compatibility helpers and columns still used for historical rows must be accounted for explicitly. Current legacy branch/retirement helpers remain outside the switched HTTP routes pending this step.

## Accepted operation recovery

Use the authenticated operation endpoints in [Media workflow](media-deletion-workflow.md). Inspect the owning service's outbox/inbox and `ops.deletion_operations` with operational credentials. Never directly mark an operation completed or delete its evidence.

- Restore storage/DB/transport availability for `MEDIA_DELETE_FAILED`. The original outbox request retains its message and operation IDs; normal relay redelivery resumes cleanup. Missing objects are idempotent, and a partially cleaned asset retains pending metadata until its remaining namespaces can be removed.
- If file cleanup succeeds but metadata commit fails, replay the same event. Namespace removal tolerates missing files, and metadata finalization is transactional.
- If Media commits completion but Catalog acknowledgement is lost, replay the completed outbox event. Catalog verifies operation identity and asset IDs, then finalizes once and records its inbox receipt.
- For `DELETE_IMPACT_CHANGED`, retrieve fresh impact and submit a newly confirmed request. The rejected request is terminal and has released its asset reservation.
- If an immutable retained cover or technical/type assignment blocks impact, follow its explicit compatibility plan. Do not disable retention triggers or relax FKs to force deletion.

S3/RabbitMQ deployment acceptance and immutable-retention compatibility are not established by the local signed HTTP/filesystem tests. The normal rollout copied files and switched owner references; no original Product, Category, Media asset or source file was deleted.
