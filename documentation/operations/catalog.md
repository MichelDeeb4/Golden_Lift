# Catalog category administration (B4)

Implemented locally on the existing four-database backend. Catalog uses its own Prisma client and runtime role. No database migration, dependency upgrade, frontend, product API or Media upload workflow is introduced. See [decision 005](../decisions/005-category-administration.md), [OpenAPI](../api/openapi.json), [local setup](backend-local.md) and [Identity setup](identity.md).

## Authorization and transport

All `/api/v1/admin/categories` operations require a currently valid **ADMIN** session. SUPER_ADMIN manages accounts only and receives 403 on category administration. Catalog verifies sessions through private Identity credentials on each request and checks the capability before parsing editor input; use cases also enforce it. Gateway does not expose introspection or trust caller role/service headers. Missing, expired, revoked, disabled and deleted credentials receive 401. Identity failure makes protected operations fail with 503; public category reads remain anonymous and independent.

Use the HttpOnly staff cookie returned by Identity. Mutations also require the approved `Origin`, session-bound `X-CSRF-Token` and a JSON body. The existing 64 KiB input limit, Identity rate limits, request IDs, safe errors, origin restrictions and no-store responses apply. Tokens, credentials and SQL details do not appear in responses/logs. Production cookie/TLS requirements remain in the Identity guide.

## Implemented endpoints

| Method | Route under `/api/v1/admin/categories` | Purpose                                                          |
| ------ | -------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/`                                    | Paginated root categories or direct children of `parentId`       |
| GET    | `/{id}`                                | Editor detail and actual stored translations                     |
| GET    | `/{id}/breadcrumbs`                    | Paginated root-to-selected path, including the selected category |
| GET    | `/{id}/move-destinations`              | Advisory eligible destinations and an explicit root destination  |
| POST   | `/`                                    | Existing create workflow, with optional registered image cover   |
| PATCH  | `/{id}`                                | Existing expected-version translation/cover edits                |
| POST   | `/{id}/move`                           | Atomic complete-branch move with a position anchor               |
| POST   | `/reorder`                             | Atomic complete sibling-set reorder                              |
| GET    | `/{id}/deletion-preview`               | Read-only, consistent impact and preview precondition            |
| DELETE | `/{id}`                                | Explicitly confirmed branch soft deletion                        |

Public `GET /api/v1/categories` and `GET /api/v1/categories/{id}` retain their existing DTOs/query conventions. They exclude deleted categories and categories under deleted ancestors. Admin-only translations, counts and cover references are not added to public DTOs. There is no restore, physical business-row deletion, asset-registration shortcut or private PDF delivery route.

## Loading an editor and a deep tree

List roots with `GET /api/v1/admin/categories?locale=ar&limit=20`; add `parentId={uuid}` to load direct children. Supported locales remain `ar`, `en`, `ckb`. Limit is 1-100; omitted limit is 20. Unknown parameters, unsupported locales and malformed UUIDs/cursors produce 400.

Each list returns `parentId`, `listRevision`, `items` and `nextCursor`. Categories include parent/cover IDs, exact decimal-string `version` and `sortOrder`, localized display fields, saved translations with their own versions, explicit `missingTranslationLocales`, active child/product counts as strings, and `canAddChildren`/`canAddProducts`. An empty category permits either kind of content; a category cannot contain both active children and directly attached active products. Cover and technical attachments are independent of that choice.

Localized display fields use Arabic fallback independently. `translations` contains the actual saved values: an English description of null remains null there even if the display description falls back to Arabic. Create/edit upserts supplied translations; omission of an existing locale preserves it. Arabic content is mandatory.

Follow `nextCursor` with the same parent, locale and query purpose. A malformed/cross-scope cursor is 400; a changed list revision is 409. The revision covers the parent version and all active siblings, their saved translations and direct products. Root lists have the same protection without exposing the private write gate. Conservative invalidation after an edit is intentional. Reload the first page on 409; discard previous cursors after moves, reorders, child creation or deletion. Public legacy cursors keep their original parent/locale binding and live-page behavior.

Load breadcrumbs separately with `GET /{id}/breadcrumbs?locale=ar&limit=20`. They run from root to the selected category and carry `pathRevision` and `nextCursor`. A page is complete only when `nextCursor` is null. Cursors bind selected ID, locale, exact depth key and complete ancestor-path revision; a changed path is 409. No fixed category depth or recursive subtree payload is imposed. Saved translations and path rows load in batches, without one service/database query per ancestor.

Move-destination discovery uses the same bounded child loading and cursor rules. `GET /{id}/move-destinations` excludes the source, descendants, deleted categories/ancestors and active product-bearing categories. Optional `parentId` navigates within another branch. Navigating inside the moving branch produces 422. `rootDestination` always describes root level and its revision; it is separate from category items. A destination read is advisory; the move transaction checks everything again. Its `listRevision` is for the full sibling scope, including ineligible entries, so it can be used as the destination precondition.

## Creating and editing

Existing create requests require translations; optional `parentId`/`expectedParentVersion` must both be present for a child. Omit both or supply null for a root. The six seeded roots are initial data; administrators can create, reorder, move and delete roots. There is no fixed root enum or business maximum.

PATCH requires `expectedVersion` and translations. Generic PATCH rejects parent/order fields; those belong to the dedicated workflows. Both create and PATCH accept optional `coverAssetId`. It must reference an already verified active IMAGE registration in Catalog. Null clears the cover; omission preserves it on edit. No upload/registration API is added. Final database integrity checks protect cover eligibility in the same transaction, including concurrent retirement.

## Moving a branch

Read the source detail, its parent's child list (or roots), and the destination child list (or roots). Send:

```json
{
  "parentId": null,
  "beforeId": null,
  "expectedVersion": "3",
  "expectedSourceRevision": "l1-<64 lowercase hex characters from the source list>",
  "expectedDestinationRevision": "l1-<64 lowercase hex characters from the destination list>"
}
```

Every field is required. `parentId: null` moves to root level; `beforeId: null` appends. Otherwise `beforeId` identifies an active sibling at the destination, and the category is placed immediately before it. The source cannot anchor itself. Same-parent positioning uses the same contract; already-positioned requests are checked no-ops with `changed: false`, no version increment and no event.

The response contains the updated Admin category, `changed`, and updated source/destination list revisions. Non-root source/destination parent versions advance. Descendant IDs, translations, product ownership/codes, specification assignments, covers, media and technical links remain intact; moving does not add inherited specifications or rewrite the branch.

Ordinary moves allocate an exact bigint gap and update the source row. If ties or bigint boundaries leave no gap, the transaction can normalize the affected destination sibling set, including the incoming source, up to 500 rows. Larger recovery sets return 422 without updates/events. This is an explicit transaction limit, not a tree-depth or root-count limit. Larger lists remain paginated and support ordinary moves when a gap exists.

## Reordering siblings

`POST /reorder` requires explicit `parentId` (null means roots), `expectedListRevision`, and `orderedIds`, the **complete** desired active sibling set. Collect all pages with the same revision before submitting. The request and transaction support at most 500 siblings. Duplicate IDs are 400; wrong-parent, deleted or incomplete membership is 422; stale membership/state is 409. An empty array is valid for an empty set. Larger lists use anchored moves.

The mutation assigns exact bigint keys in increments of 1024 within that sibling set. It advances changed category versions and the non-root parent version, and commits one bounded event. Failure preserves the whole previous order/version state and emits no committed event. The response includes `parentId`, `changed`, updated `listRevision`, and sibling IDs/versions/order keys. A request for the existing deterministic order is a no-op, including existing ties.

The reorder event uses an advanced real category version: the parent for nested lists, or a changed category for roots. The payload carries the resulting list revision; there is no fabricated monotonic root-list counter.

## Previewing and deleting a branch

`GET /{id}/deletion-preview` returns the selected category, `impact`, `previewPrecondition` and explicit retention flags. It has no side effects or private PDF links. Counts describe active records only: `totalCategoryCount` includes the selected root, `descendantCategoryCount` excludes it, and `productCount` includes all affected products. Other counts cover owned category/product translations, specifications, product media and captions, code reservations, technical links/configuration selections, and category covers whose public references become inactive.

The scope-bound precondition fingerprints all active categories/products and owned records in the branch plus referenced media and shared-sheet versions. An independent descendant edit, product insertion/change, association change, or branch membership change invalidates the preview even if the selected category's version is unchanged. A token is a concurrency safeguard; the request still requires live ADMIN authorization and mutation CSRF/Origin.

Send `DELETE /{id}` with:

```json
{
  "confirm": true,
  "expectedVersion": "3",
  "previewPrecondition": "b1-<64 lowercase hex characters from the preview>"
}
```

Missing/non-true confirmation is 400. Stale preview/version is 409: reload the preview and obtain a new explicit confirmation. The response returns category ID, deleted root version, impact and updated source list revision. Repeated deletion is 404.

The deleting Serializable transaction rechecks full impact, then calls the reviewed `soft_delete_branch` function. Its v1.1 owner hooks delete owned technical links/selections. The existing single transaction-local outbox record is normalized into `catalog.category.branch.deleted.v1`, retaining its ID; no duplicate event is appended. The branch and owned records are soft-deleted atomically.

Shared technical sheets, their contents/source evidence, Media registrations, stored files and unrelated branches remain. Model codes stay permanently reserved, including deleted reservations. There is no restoration or file purge. Fresh public/Admin lists, detail, breadcrumbs and destination reads stop returning the branch after commit. Database soft deletion **does not implement Media delivery revocation**: signed URLs/downloaded files are not revoked by B4. That service workflow remains a later milestone.

## Errors and transactions

| Status | Meaning/action                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Malformed input, missing explicit null/confirmation, unsupported field, invalid/cross-scope cursor or duplicate IDs               |
| 401    | Authenticate again; session/account is unavailable, revoked or expired                                                            |
| 403    | Requires ADMIN or valid browser Origin/CSRF                                                                                       |
| 404    | Selected category/parent is missing or excluded by deletion                                                                       |
| 409    | Row/list/path/preview changed; reload instead of overwriting                                                                      |
| 422    | Cycle, self/descendant destination, product-bearing parent, invalid cover/anchor/membership or documented ordering recovery limit |
| 413    | Request body exceeds 64 KiB                                                                                                       |
| 503    | Dependency unavailable/busy or finite transaction retry exhausted                                                                 |

Errors follow the shared `{error: {code, message, requestId}}` contract. Catalog operations use Prisma Serializable transactions and the same transaction client for repositories and outbox. Existing SQL triggers acquire the private gate. Bounded retries restart the complete database computation and recheck the original user preconditions; stale conflicts are not blindly retried. No HTTP/mail/storage/broker side effect occurs inside a retry callback.

## Exercise with disposable data

Use Node 24 and the configured local PostgreSQL 18 endpoint on port 55432. Keep existing `.local` configuration/secrets intact. Start the configured server with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 start` if it is stopped; do not substitute another server or reset installed databases.

From the repository root:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
npm.cmd run check
npm.cmd run test:integration
npm.cmd run smoke
npm.cmd run smoke:identity
npm.cmd run orm:check
npm.cmd run orm:verify
```

`smoke:identity` exercises the full B4 workflow through Gateway and five actual entrypoints, using temporary Identity/Catalog databases, temporary process credentials and its own disposable mailbox. It bootstraps/invites/activates test staff, loads a deep path, reorders root/nested lists, moves a branch in all three directions, rejects stale preview, deletes the branch, checks immediate public exclusion, denies Super Admin/forged headers/CSRF, revokes staff and stops Identity to prove outage behavior. It removes only its own test databases/mailbox when finished; it does not create real project staff or alter private mailboxes/secrets. No separate Catalog smoke command is needed.

The integration runner discovers `category-tree.integration.test.ts` automatically alongside previous Catalog/Identity/Prisma suites. B4 uses disposable Catalog runtime fixtures for products, verified asset registrations, exact numeric values, specifications and shared technical attachments; these are test records, not product/upload APIs or brochure data. Independent connections and explicit barriers test competing moves, moves versus products, reorder versus creation/move, deletion versus descendants/products, complete retry/event behavior and rollback. The existing SQL verifier covers fresh installs, upgrades, private permissions, deferred integrity and real lock contention.

Hosted CI, Docker deployment, production providers, load capacity, Media delivery and frontend use remain unverified later work. Current executed results are recorded separately in the timestamped B4 validation report linked from [project progress](../project-progress.md); earlier validation files remain historical evidence.

## Dynamic Catalog Core

B4 category behavior remains as documented above. Ordinary product attributes now belong to explicit product types after reviewed v1.2 cutover. Category/product placement does not change type/values. Shared schema changes participate in relevant branch-deletion tokens. See the [dynamic configuration/product guide](dynamic-catalog.md) for guarded API examples, privacy, lifecycle, staged evolution and operator migration instructions.
