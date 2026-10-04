# Dynamic Catalog Core operating guide

This milestone exposes configuration and a narrow headless product workflow. It follows completed B4 category administration; B5 Media core and full product/technical-sheet interfaces remain planned. See [decision 006](../decisions/006-dynamic-catalog-core.md), [OpenAPI 0.4.0](../api/openapi.json), [model dictionary](../../database/docs/model-dictionary-v1.2.md) and [project status](../project-progress.md).

All Admin reads and writes require a live ADMIN session verified by Identity. SUPER_ADMIN manages accounts and cannot manage content. Mutations, including POST previews, require the approved Origin and session-bound `X-CSRF-Token`. Anonymous product reads do not consult Identity. Gateway allows only the documented method/path combinations; there is no public asset-registration, migration, validator or internal introspection endpoint.

## Resources and safe changes

| Capability | Routes |
| --- | --- |
| Types, definitions, groups, units | GET/POST `/api/v1/admin/{product-types,attributes,attribute-groups,units}`; GET `/{id}` |
| Options | POST `/api/v1/admin/attributes/{id}/options`; GET `/api/v1/admin/attribute-options/{id}`; options are listed in the definition |
| Effective type schema/form | GET `/api/v1/admin/product-types/{id}/schema?locale=ckb` |
| Guarded changes/copy/deletion | POST `/api/v1/admin/{resource}/{id}/changes/preview`, then POST `/changes` |
| Headless products | POST `/api/v1/admin/products`; GET/PATCH `/api/v1/admin/products/{id}` |
| Editing schema | GET `/api/v1/admin/products/{id}/edit-schema?locale=en` |
| Browsing placement | POST `/api/v1/admin/products/{id}/placement` |
| Explicit type mapping | POST `/api/v1/admin/products/{id}/type-change/preview`, then POST `/type-change` |
| Anonymous projection | GET `/api/v1/products/{id}?locale=ckb` |

Configuration lists use immutable UUID/code keysets with up to 100 rows and a resource-bound opaque cursor. They are current-state lists, not historical snapshots. B4 category/path limits and scope tokens remain unchanged.

Change bodies contain `change`, `expectedVersion` and `expectedSchemaRevision`. The schema revision is required for a type target; other resources use explicit `null`. Commits add the returned `precondition` and `confirm: true`. Every policy-affecting operation follows this one path; there are no alternate PATCH/DELETE routes for configuration.

| Target | Supported change kinds |
| --- | --- |
| Product type | `type.metadata`, `type.deprecate`, `type.delete`, `assignment.put`, `assignment.remove`, `group.place`, `group.remove`, `type.order`, `type.copy` |
| Definition | `definition.update`, `definition.deprecate`, `definition.delete` |
| Option | `option.update`, `option.deprecate`, `option.delete` |
| Group | `group.metadata`, `group.delete` |
| Unit | `unit.metadata`, `unit.delete` |

Metadata updates replace active translations. A definition update includes all definition input fields and its unchanged stable code. Option updates include its unchanged code, order and translations. `assignment.put` supplies an existing assignment ID to edit or `null` to add; `group.place` similarly uses an existing placement ID or `null`. Group removal explicitly moves assignments to another placement of the same type or to `null` for ungrouped. Ordering supplies the complete current collection of IDs atomically. Attribute ranking applies within groups; group order precedes ungrouped fields. Copy requires the source type ID and current source schema revision and retains destination-only fields. Conflicting policies must be resolved explicitly.

Preview reports include blockers, affected/invalid product counts, a scope token and downloadable-document count. Blocked changes cannot commit. A 409 means re-read both product/configuration state, rebuild the proposal and obtain a new preview. Interactive impact is capped at 100 affected types and 1000 active products; schemas/group collections/ordering/options at 500; a request at 100 value mutations or selected options. Larger changes need a separately reviewed operational workflow. No partial validation is represented as safe.

## Synthetic end-to-end example

Use a disposable database, an authenticated test Admin and verified synthetic IMAGE reference when reproducing these examples. `scripts/dynamic-catalog-smoke.mjs` executes this sequence through the real Gateway and processes; it registers its trusted fixture only inside the disposable Catalog. There is no asset registration API in this milestone. Real product creation requires an already verified local asset; upload/delivery is B5.

Create a type with POST `/api/v1/admin/product-types`:

```json
{"code":"synthetic-cabin","translations":[{"locale":"ar","name":"كابينة تجريبية","description":null}]}
```

Create a reusable group the same way at `/attribute-groups`. Create a NUMBER definition at `/attributes`:

```json
{"code":"synthetic-width","translations":[{"locale":"ar","name":"العرض","description":null}],"kind":"NUMBER","unitCode":null,"minimum":"0","maximum":null,"allowMultiple":false,"public":true,"filterable":true,"textMultiline":false,"textMaxLength":4000}
```

Every definition policy field is explicit. BOOLEAN, TEXT and CHOICE use the same definition shape with null numeric bounds/units; only CHOICE supports `allowMultiple`, only TEXT supports multiline. A canonical unit can be created with `{code,symbol,dimension,translations}` and selected by a NUMBER definition. Its physical identity cannot be edited. Unit and option translations support labels only; descriptions must be omitted or null. Options are created under a CHOICE definition with `{code,sortOrder,translations}`.

Read the type detail and submit this change to `/product-types/{typeId}/changes/preview`, using real returned IDs/revisions:

```json
{"expectedVersion":"2","expectedSchemaRevision":"2","change":{"kind":"assignment.put","assignmentId":null,"assignment":{"definitionId":"10000000-0000-4000-8000-000000000001","groupPlacementId":null,"sortOrder":"1024","required":false,"public":true,"searchable":false,"filterable":true,"comparable":false}}}
```

The numbers above illustrate the shape; always read actual revisions. Commit the identical body plus the returned token and `confirm: true`. Group placement is an explicit separate change, then assignments select the returned placement ID. The schema endpoint returns both actual saved `configuration` and localized `form` with controls, requiredness, bounds, units, group/order, options, deprecation and missing translation locales.

Create a product with its actual leaf-category version, type schema revision and trusted IMAGE asset:

```json
{"categoryId":"20000000-0000-4000-8000-000000000001","productTypeId":"30000000-0000-4000-8000-000000000001","coverAssetId":"40000000-0000-4000-8000-000000000001","modelCode":"SYNTHETIC-CABIN-001","translations":[{"locale":"ar","name":"منتج تجريبي","description":null}],"expectedCategoryVersion":"1","expectedSchemaRevision":"3","values":[{"definitionId":"10000000-0000-4000-8000-000000000001","value":{"kind":"NUMBER","number":"90071992547409.123456"}}]}
```

The database stores exact numeric(20,6). Send decimal/bigint/version fields as strings; never round excess precision or convert quantities to JavaScript Number. `false` and `"0"` are present values. TEXT supplies unique ar/en/ckb translations and requires Arabic. CHOICE supplies stable option IDs owned by that definition, without duplicates, respecting single/multiple selection.

PATCH products with current `expectedVersion` and `expectedSchemaRevision`. Omitted fields/definitions remain unchanged; `value: null` removes a value softly; TEXT/CHOICE values replace their active child set. Required values cannot disappear. Model-code replacement reserves the previous code permanently. Product type and category are excluded from PATCH; use the explicit type-change or placement operations. Type change previews enumerate retained/incompatible/missing definitions and require explicit removals/replacements. Product-specific technical sheets block a type change pending applicability review; generic references remain separate.

Public products contain localized ordinary values only. Requested-locale fallback to Arabic applies independently to names, descriptions, attribute labels, TEXT and options. Admin responses retain saved translations and list missing locales. Render all stored text as escaped plain text; no executable HTML/rules are configured. A global private definition stays hidden even if an assignment is public. Search/filter/comparison flags describe eligibility; no full faceted search or export service is implemented.

Category moves preserve product type/values; shared-schema changes invalidate stale product editors and relevant B4 deletion tokens. Category branch deletion retains shared types, definitions, groups, sheets, model-code reservations and assets. Definition semantics remain locked after historical use. Optional -> populate products explicitly -> required is the supported evolution flow. Deprecation permits unchanged legacy values and unrelated edits, but prohibits new selection/use. No restore or physical purge exists.

## Technical evidence and files

`database/sql/11_technical_queries.sql` now targets final public measurement/note views and type-based disclosure/filter policy. Generic REFERENCE sheets do not qualify products for a numeric filter. PRODUCT_SPECIFICATION requires explicitly selected configurations and criteria correlated to the same configuration/condition; no interpolation or inference.

Public notes require a public measurement scope and no private source observation. Broad configuration/section notes remain internal until an explicit public-note disclosure design exists. Stored source observations, qualifiers, missingness and configuration notes are unchanged. `active_asset_usage` still guards retirement; `public_asset_usage` still honors explicit download permission. A hidden field may remain inside an approved downloadable PDF: previews report those documents and never claim file redaction or URL revocation. B5 owns delivery coordination.

## Expand, backfill, validate and switch

The installed project Catalog remains v1.1. No real product data, roles, credentials or mailbox were changed. The final v1.2 schema/Prisma manifest was verified using disposable Catalogs. Default `database/manage.ps1 setup/all` remains the legacy v1.1 installer; it does not silently migrate an existing database. Final fresh entry is `database/sql/15_catalog_dynamic.sql`; v1.1 upgrade uses additive `13_dynamic_catalog_expand.sql` followed by `14_dynamic_catalog_cutover.sql` after review/backfill. Applied v1.0/v1.1 migrations remain unchanged.

Use a reviewed backup/restore environment and Catalog owner credentials. Select a staging tools configuration with `GL_DATABASE_CONFIG_FILE`; never overwrite `.local/database.json` or `.local/database.env` to point tests at staging. CLI output JSON stays inside this workspace and may contain private catalog evidence; do not publish inventory/mapping files.

```powershell
node database/scripts/dynamic-catalog.mjs inventory --output .local/catalog-inventory.json
node database/scripts/dynamic-catalog.mjs propose --output .local/catalog-mapping.json
# Review the mapping before writes; substitute the exact authorized database name.
node database/scripts/dynamic-catalog.mjs expand --confirm-database <database>
node database/scripts/dynamic-catalog.mjs backfill --mapping .local/catalog-mapping.json
node database/scripts/dynamic-catalog.mjs backfill --mapping .local/catalog-mapping.json --apply --batch-size 100 --confirm-database <database>
node database/scripts/dynamic-catalog.mjs validate --mapping .local/catalog-mapping.json --output .local/catalog-validation.json
node database/scripts/dynamic-catalog.mjs cutover --mapping .local/catalog-mapping.json --confirm-database <database>
```

`propose` sets `reviewed: false`, empty types and unresolved public classifications. Signatures are suggestions only. A nonempty mapping must name the exact database, set reviewed true, provide stable type UUID/code/Arabic translations, every active legacy category eligibility mapping, every active product's type (explicit product mapping overrides category mapping), every active definition's explicit disclosure and every active unit's Arabic labels. Product overrides copy their own category eligibility to the reviewed type. Categories mapped to one type must agree on shared attribute order or use separate reviewed types. No inferred types, values or required fields are created. Empty data can use a reviewed empty mapping and creates zero types.

Backfill is dry-run by default, with configurable 1–500 product batches. Stable assignment IDs and conditional inserts/updates make reruns resumable. Existing incompatible types/policies stop the operation rather than overwriting them. Deleted products/values remain untouched; active eligibility, exact values, translations, reserved codes, media and technical evidence remain. Validation checks actual type/assignment/disclosure state against the mapping; final SQL checks Arabic labels, lifecycle, type eligibility and all unrelated Catalog/technical invariants before commit.

Pause all Catalog writers for the expansion/backfill/switch window and retain the pause through validation and deploying the compatible binary. The CLI requires exact database confirmation but cannot prove an operator's traffic pause. Drain old in-flight writes and outbox consumers that mutate Catalog. Apply grants using `07_permissions_template.sql` (the CLI does this after expansion/cutover), then perform authenticated schema/product and anonymous privacy checks before resuming writes. Record mapping hash, batch results, schema parity and backup location.

| Database stage | Compatible behavior |
| --- | --- |
| v1.1 | Existing category/Identity workflows and readiness remain available; new dynamic operations return INVALID_STATE |
| Expanded, before final switch | Legacy eligibility remains authoritative; owner backfill permitted; dynamic API writes stay gated |
| Final v1.2 | New binary uses only type eligibility; legacy category assignments are retained and closed to configuration writes |

Do not run category-based product binaries/validators after the switch or mix old B4 preview implementations with dynamic writers. Roll back an expanded-only release by keeping its additive tables and using the compatible prior API; after switch prefer a forward fix or a separately demonstrated compatible code rollback. Never drop retained tables/values or restore old eligibility validators over type-based products.

## Local validation

Run the seven established npm checks, plus `node database/scripts/verify-dynamic.mjs`. The dynamic verifier installs disposable final/fresh/upgraded schemas, runs SQL fixtures, concurrency and all cross-service denials, then cleans them up. Integration and Identity process smoke create their own disposable databases. ORM runtime parity must target a final v1.2 Catalog; use the task's disposable final configuration or an authorized migrated staging environment via `GL_DATABASE_CONFIG_FILE`. Running final Prisma parity against the unchanged installed v1.1 Catalog correctly detects a mismatch. The default legacy database verifier remains explicit v1.1.

No hosted CI, Docker, production load, real storage/mail providers, Media processing, URL revocation, frontend or production migration is established by these local tests. Deployment and real business-data cutover require separate authorization.
