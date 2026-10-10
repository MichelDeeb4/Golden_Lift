# Migration strategy

Date: 2026-10-10. Future plan only. No SQL, Prisma model or stored business data is changed during Phase 01.

## Reusable and replacement capabilities

Reuse owning-service ports/UoWs, Prisma clients, SQL constraints, bounded retries, optimistic review, transactional outbox/inbox, Identity sessions, Catalog typed values and Media fencing/independent copies. Refactor global actors/roles, root readers, global write gate, definer scans/views, event envelopes, jobs/quotas, UI keys/drafts and domain resolution for scope. Missing foundations are registry, tenant/company associations, organization authority, scoped capabilities/lifecycle and storage assignment.

Customer-specific technical sheets, Arabic fallback and example codes are not automatically obsolete data. Make technical capability optional and language policy configurable only after preservation/preflight. Keep retired classification/FK/provenance blockers until a separately approved exact compatibility plan.

## Existing installation authority

Reviewed SQL and migration scripts are authoritative; there is no Prisma migration history to rename or Prisma migrate deploy step. Installed schema-manifest 1.5/ORM parity is the current structural evidence, not proof of a universal fresh installer. Legacy db.mjs setup selects the earlier Catalog baseline, while category and permanent-deletion upgrades are staged separately. CI still invokes that old installation/test chain and stale Identity smoke. Do not run setup/all against populated databases to repair that drift.

For current category authority follow the reviewed [classification migration](../../documentation/operations/product-type-migration.md): SQL 23/24, binding archive/retirement 26, or SQL 25 for a fresh category fixture. Permanent-deletion expansion uses SQL 27/28 followed by reviewed independent owner-copy/backfill and SQL 29. Media's fresh baseline is SQL 18; subsequent expansion must match the selected supported stage. These names are evidence of dependencies, not permission to blindly replay the sequence. Review selected schema, retained references and existing manifests first. Earlier verifyFresh v1.1/v1.2 profiles do not prove current 1.5 fresh/upgrade parity.

## Tenant/company staged transition

| Stage             | Work                                                                                                                                                        | Validation / rollback gate                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Approve/preflight | Freeze inspected baseline; approve company model, roles, public/staff origins, languages, lifecycle, module policy and legacy ownership manifest            | Rehearsal restore; report ambiguous records; all-service/bytes backups and recovery rehearsal before writes                          |
| Expand            | Add registry/membership foundation and compatible scoped contracts/ownership columns/keys/indexes only under a new authorized task                          | Current single-company behavior passes; no unscoped bypass or new tenant activation                                                  |
| Migrate           | Assign proven tenant+company scope to business/retained/ops/job/file records; build scoped relationships and reviewed Media manifests                       | Counts/hash/value/byte parity, blockers preserved; unknown scope stops migration                                                     |
| Switch            | Coordinate owning use cases, transaction-local context/RLS, root/raw readers, Gateway/domain ingress, web caches/drafts, workers/events/storage             | Mixed contract versions explicitly denied or checked-translated; old workers/writers paused; Phase 3 negative isolation suite passes |
| Verify            | Compare current fresh/upgrade schema, grants/functions/views/triggers, one-connection pool and concurrent scopes, real HTTP/browser and provider byte paths | No second tenant/company until every applicable gate passes; actual restricted runtime credentials                                   |
| Contract          | Retire compatibility only when searches, telemetry/replay checkpoints and retained evidence prove it unused                                                 | Separate reviewed approval for destructive DDL/archival; schema/clients/docs remain aligned                                          |

Do not invent a tenant/company mapping from branding, category or user role. A user may need multiple memberships; global SUPER_ADMIN does not become content owner. Shared definitions need same-tenant relationships and impact review across applicable companies. Tenant-wide locks must preserve shared-definition invariants without serializing unrelated tenants.

## Cutover and recovery

Recommended initial cutover is coordinated pre-production maintenance, not speculative zero-downtime dual writing. Pause writers/workers/relays, capture all-DB plus storage/ownership/outbox/inbox checkpoints, restore a rehearsal, validate, then switch one authoritative version. Never keep two writable authorities. Existing sessions/preferences may have a bounded documented reset if contracts require it; credentials/data must not be discarded.

Before the first post-cutover write, reverting code/config/assignment can be safe if schemas remain compatible. After writes, do not blindly reverse names or remove scope: pause activity and restore/reconcile all service data and bytes against the checkpoint. Preserve failed operation state and audit evidence. Dedicated routing migration adds assignment-version fencing as described in [target architecture](target-architecture.md). No destructive rollback is executed or proposed as an automatic fallback.
