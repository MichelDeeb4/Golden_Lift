# Golden Lift - Database Design v1.1

**Date:** 2026-10-03  
**Change:** reusable technical reference sheets and product-specific configurations.  
**Status:** updated design and additive reference SQL; no live deployment; SQL execution tests still required.

## Version 1.1 - Technical reference sheets

**Change authorized:** selected information in `description.pdf` must be representable on the public website. The approved recommendation is readable product specifications plus reusable technical sheets linked explicitly to categories and/or products. This is an additive Catalog-only change; Identity, Media storage tables, and Inquiries are unchanged.

**Artifact status:** the design, migration, query templates and test scripts are updated. No company database was contacted or migrated. The PostgreSQL migration and integration tests have not been executed in this environment. The validation report records only the static checks actually performed.

### V1.1.1 Source fidelity and the scope of this change

`description.pdf` is a two-page image-based reference. Page 1 contains passenger-elevator measurements grouped by building use and capacity, with some speed-dependent rows. Page 2 contains tables headed Patient Lifts, Load Elevators and Service Elevators. Those tables do not establish applicability to a named Golden Lift cabin product.

The database must preserve the source's table groups, column distinctions, row symbols, units, operating conditions, minimum/maximum qualifiers, blank cells and notes. It must not infer a manufacturing specification, correct a value silently, or claim that an unspecified speed condition applies universally. This update contains **no production measurement seeds** and no automatic assignments to GOLDEN LOTUS, GOLDEN SIRIUS or another model.

The source review notes identify apparent issues on page 2, including the patient-lift 1600 column's displayed minimum greater than its maximum and the load-table 630 heading above a 620 capacity entry. These are retained as unresolved source issues, not repaired measurements. That is source-data preparation, not a new editorial approval role or publishing workflow.

### V1.1.2 Two distinct kinds of information

Existing `product_specification_values` remain the place for a product's single, unconditional attributes. They are not overwritten or automatically populated from a generic reference sheet.

New technical sheets hold a **configuration + condition + measurement** matrix. A configuration identifies a specific reference column/use setup. It may have a confirmed capacity in kg and passenger count, but its identity is a UUID/key, not just the capacity. Two different use groups may have equal capacities without becoming the same configuration.

Conditions are independent rows shared within a sheet. `EXACT_SPEED` contains an explicitly established speed in m/s. `UNQUALIFIED` means the source does not state a condition; it does **not** mean all speeds. `OTHER` carries an explicit translated condition label/detail without pretending it can be reduced to a speed number. No default/override inheritance or interpolation is implemented.

A measurement references one configuration, one condition, one section, one existing NUMBER specification definition, and one qualifier (`EXACT`, `MINIMUM`, or `MAXIMUM`). Repeated minimum/maximum or speed-specific source rows therefore do not overwrite one another.

These configurations are technical reference data, not commercial product variants. They have no price, inventory, ordering or SKU workflow.

### V1.1.3 Tables added (16)

| Group | Tables | Responsibility |
| --- | --- | --- |
| Sheet identity | `technical_sheets`, `technical_sheet_translations` | Reusable translated sheet, summary and applicability note. |
| Source provenance | `technical_sheet_sources`, `technical_source_observations` | Verified PDF references, page ranges, exact original cells/labels/notes, and private clarification information. |
| Presentation groups | `technical_sections`, `technical_section_translations` | Ordered cabin/door/pit/room groups without replacing the source organization. |
| Reference columns | `technical_configurations`, `technical_configuration_translations` | Distinct capacity/use configurations and their labels. |
| Operating context | `technical_conditions`, `technical_condition_translations` | Stated speed or other conditions; no implicit universal default. |
| Values | `technical_measurements` | Numeric values with conditions, qualifiers, explicit missingness and source references. |
| Qualifications | `technical_notes`, `technical_note_translations` | Notes attached to a sheet, group, configuration, condition or individual measurement. |
| Category applicability | `category_technical_sheets` | Category-level reference material, allowed even on a category with children. |
| Product applicability | `product_technical_sheets`, `product_technical_configurations` | General reference links or explicitly selected product-specific configurations. |

This brings the package to **50 business/support tables plus eight messaging tables and one write-gate table: 59 physical tables across four service databases**. The 16 additions are not 16 new services. Five are translation tables; the remaining separation preserves ownership, source fidelity and reusable relationships.

### V1.1.4 Relationships and applicability

A sheet owns its sections, configurations, conditions, sources, source observations, measurements and notes. Composite foreign keys include `sheet_id`, preventing a measurement from accidentally combining a configuration from one sheet with a source or condition from another.

A category may reference multiple sheets, and one sheet may appear on several categories. Category references are informational metadata; they do not count as direct products and do not weaken the children-or-products rule. There is no implicit inheritance from ancestors to descendants or products. Moving a category preserves its explicit links.

A product attachment has `relation_kind`:

- `REFERENCE`: display the sheet as reference information, not as guaranteed product dimensions. There are no configuration-selection rows.
- `PRODUCT_SPECIFICATION`: require at least one explicit selection in `product_technical_configurations`. Only those selected configurations appear in product-specific results.

Both modes use the same reusable sheet. The same product/sheet pair has at most one active attachment; an editor deliberately chooses its mode. Switching modes and changing the selection set happen in one transaction. Selecting configurations asserts company applicability; the database cannot establish engineering applicability from the PDF itself.

When filtering products by technical values, the API must use only `PRODUCT_SPECIFICATION` attachments and correlate all criteria to the **same selected configuration and required condition**. A product cannot satisfy capacity using one configuration and cabin dimensions using another. Generic category guidance must not qualify a product for a numerical product filter.

### V1.1.5 Source observations versus public measurements

`technical_source_observations` is a private evidence area, not the public specification table. It retains a page, table/row/column labels, source symbol and unit notation, original value text, original condition text and original note text. Raw evidence identity/text is immutable: fix a transcription by adding a replacement observation, not by silently rewriting the original. Clarification flags and explanations describe the current interpretation and are not an administrator action-history feature.

A public measurement either references an observation or supplies a nonempty `entry_basis` for company-entered information. A source observation flagged `requires_clarification` cannot support a public measurement or note without a resolution explanation. An empty raw cell cannot silently become a known numeric zero. This is a structural validation safeguard, not proof that an administrator's explanation or numeric entry is factually correct.

Known numeric values use `numeric(20,6)` and the canonical unit on the existing specification definition. Source formatting such as a comma decimal remains in raw evidence. The importer must make any unit/decimal interpretation explicitly and must not invent units missing from the source.

`value_state` distinguishes `KNOWN`, `NOT_SPECIFIED`, and `NOT_APPLICABLE`. A known value requires a finite number. Missing/not-applicable values require NULL. `NOT_APPLICABLE` should only be used when explicitly supported; an empty source cell means not specified, not automatically not applicable. The application must display missingness rather than render zero or omit an important qualifier.

A note may target a sheet, or narrow its scope using section/configuration/condition references. These targets combine by intersection. A single-measurement note is exclusive of those three selectors. It follows its measurement when that measurement is displayed, including on narrow mobile layouts. `sql/11_technical_queries.sql` demonstrates correctly scoped notes.

### V1.1.6 Integrity and transaction behavior

The existing serializable Catalog write gate and optimistic aggregate versions remain in use. No extra approval states or staff roles are introduced. Valid saved changes become visible to fresh requests after commit.

The migration installs ordinary constraints for non-null data, finite values, same-sheet foreign keys and unique live keys. Deferred validation checks active ownership, Arabic fallback, source page ranges, PDF readiness/type, definition bounds, source ambiguity, selected configuration rules and coherent minimum/exact/maximum values. Cross-row checks use deferred constraint triggers rather than pretending an ordinary row CHECK can inspect other rows reliably. PostgreSQL documents that distinction [T1, T2].

Changing a definition's type/unit is blocked after **any** product or technical measurement uses it, including deleted values. Conditions' kind/speed are immutable; changing a meaning requires a new condition and deliberate remapping. This avoids silently reinterpreting existing measurements. Translation labels remain editable with the normal version checks.

Edits to child translations, configurations, measurements, notes or selections must check and advance the appropriate root's `version` in the same transaction: sheet edits update the sheet root; product/category attachments also update their owning product/category. This is a repository contract, not automatically inferred by every low-level DML statement.

The write gate remains a correctness-first serialized editing strategy. Readers do not acquire it. Retry an entire serialization-failed transaction with bounded backoff [T4]. Do not perform file uploads or network requests while holding the gate. Production throughput has not been measured.

### V1.1.7 Soft deletion and shared PDFs

All added tables use `deleted_at`; physical DELETE/TRUNCATE and restoration are prohibited by the existing guards. Files are retained. No hard-delete down migration or content purge is supplied.

Deleting a category/product soft-deletes only its technical attachments (and product configuration selections), not shared sheets or files. The new owner-deletion hooks also run inside the existing `soft_delete_branch` routine, so the earlier branch workflow remains compatible.

Deleting a sheet via `soft_delete_technical_sheet(id, expected_version)` soft-deletes its translations, sources, evidence, groups, configurations, conditions, measurements, notes and category/product attachments. The source PDF registration and stored file are not automatically deleted. Another sheet or active product may still reference that PDF.

Two asset-usage views now serve different purposes:

| View | Purpose |
| --- | --- |
| `active_asset_usage` | Retirement protection. Includes private source attachments to active sheets, even when a sheet has no public link. |
| `public_asset_usage` | Public delivery eligibility. A technical source requires a live linked sheet, an active ready PDF registration and `download_enabled=true`. |

A source's `download_enabled` defaults to false. An administrator can explicitly make an appropriate source PDF downloadable. Storing evidence alone must never expose a private PDF. The Media authorization integration must switch its public eligibility check to `public_asset_usage`, while retirement keeps using `active_asset_usage`.

This does not itself invalidate signed CDN URLs or downloaded copies. The existing controlled-delivery and expiry requirements remain application/infrastructure responsibilities. Public endpoints must remain owner-scoped and must never expose raw observation/clarification records as public specifications.

### V1.1.8 New index strategy

Partial unique indexes protect one active translation per locale, stable within-sheet configuration/condition/group keys, one active category/product sheet link, one selected configuration per product link, and one active measurement per `(configuration_id, condition_id, definition_id, qualifier)`.

Read indexes follow page assembly and filtering: sheets by owner/display order; configurations and sections by sheet/display order; measurements by sheet/configuration/section/order; numeric values by definition/qualifier/value/configuration; capacity and speed lookups; source-reference checks; and reverse sheet/asset usage. Missing values are excluded from the known-number filter index. Queries must include compatible active/known predicates to benefit from those partial indexes [T3].

A configuration does not have a unique capacity constraint: identical kg values in distinct building-use groups are valid separate columns. Every measurement has an explicit non-null condition ID, so nullable speed values cannot create a uniqueness loophole.

No new search service, cache, cross-database FK or commercial-variant model is added.

### V1.1.9 Installation, upgrade and validation status

**Fresh installation:** use the updated `sql/02_catalog.sql`. It creates the original Catalog, installs the original integrity functions, then includes `09_technical_sheets.sql`. Do not run migration 09 again. Other service entry scripts remain byte-for-byte unchanged.

**Existing v1.0 Catalog:** back up and review a staging copy, then apply only `sql/09_technical_sheets.sql` once as the migration owner. It creates new tables/views and replaces the relevant integrity callbacks; it does not recreate the original schema, move existing product values or import PDF measurements.

Run both `06_smoke_test.sql` and `10_technical_sheets_test.sql` in staging, then review service permissions and Media delivery integration. Test fixtures are explicitly synthetic and finish with ROLLBACK. Files named query/permission templates are not data migrations.

Static inspection is not a PostgreSQL parser or an execution test. Neither the migration nor the SQL integration tests were executed in this environment. `validation-report-v1.1.json` records the exact static checks, and `VALIDATION.md` lists outstanding execution/concurrency/security work. No live database was modified.

### V1.1.10 Source and implementation references

Project sources: `golden left.md`; the v1.0 database package; the user's acceptance of reusable reference sheets; and `description.pdf`, pages 1-2. The PDF informs the new data relationships, not universally valid product facts or regulatory claims. See `SOURCE_REVIEW.md` before content entry.

External technical references were used only for PostgreSQL implementation mechanisms, not to correct or replace the PDF:

- [T1] PostgreSQL, Constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
- [T2] PostgreSQL, CREATE TRIGGER: https://www.postgresql.org/docs/current/sql-createtrigger.html
- [T3] PostgreSQL, Partial Indexes: https://www.postgresql.org/docs/current/indexes-partial.html
- [T4] PostgreSQL, Transaction Isolation: https://www.postgresql.org/docs/current/transaction-iso.html

---

## V1.1.11 Complete column, relationship and index dictionary

All 16 new tables live in the Catalog service database. Common timestamp/version fields are shown explicitly.

### `catalog.technical_sheets`

Reusable reference sheet; category guidance and product applicability are separate links.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_key` | `text NOT NULL UNIQUE CHECK (length(btrim(sheet_key)) > 0)` | Stable internal key, not a capacity or hard-coded elevator type. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Immutable relationship/semantic fields: `sheet_key`.

### `catalog.technical_sheet_translations`

Localized presentation with Arabic fallback; original source text lives separately.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Translated owner. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Application locale, independent of source language. |
| `title` | `text NOT NULL CHECK (length(btrim(title)) > 0)` | Display title. |
| `summary` | `text` | Optional summary. |
| `applicability_note` | `text` | Scope and limits; not a statement of compliance. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_sheet_translations_live_uq ON catalog.technical_sheet_translations (sheet_id, locale) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `sheet_id`, `locale`.

### `catalog.technical_sheet_sources`

Private provenance and optional PDF download; an active source also protects its file from retirement.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `asset_id` | `uuid NOT NULL REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT` | Verified PDF registration; no storage URL or cross-service FK. |
| `source_label` | `text NOT NULL CHECK (length(btrim(source_label)) > 0)` | Human-readable document/table label, kept as supplied. |
| `page_from` | `integer NOT NULL CHECK (page_from > 0)` | Inclusive PDF page, one-based. |
| `page_to` | `integer NOT NULL CHECK (page_to >= page_from)` | Inclusive PDF page. |
| `download_enabled` | `boolean NOT NULL DEFAULT false` | False keeps provenance private; true only grants downloads through a live attached sheet. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
UNIQUE (sheet_id,id)
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE INDEX technical_sources_sheet_idx ON catalog.technical_sheet_sources (sheet_id,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_sources_asset_idx ON catalog.technical_sheet_sources (asset_id,sheet_id) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `sheet_id`, `asset_id`, `page_from`, `page_to`.

### `catalog.technical_source_observations`

Private transcription/evidence. Ambiguous or blank cells can be retained without becoming public engineering facts.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `source_id` | `uuid NOT NULL` | PDF source within the same sheet. |
| `page_number` | `integer NOT NULL CHECK (page_number > 0)` | One-based page inside source page range. |
| `table_label` | `text NOT NULL` | Original table/section heading. |
| `row_label` | `text NOT NULL` | Original row/group label; do not silently relabel. |
| `column_label` | `text NOT NULL` | Original capacity/use column, independent of normalized capacity. |
| `source_symbol` | `text` | Original symbol such as b1 or h1; not assumed globally unique. |
| `source_unit_text` | `text` | Original unit notation; a missing unit is not inferred. |
| `raw_value_text` | `text NOT NULL` | Verbatim value; empty string preserves an empty cell. |
| `raw_condition_text` | `text` | Original condition/speed text, including conflicting multilingual labels. |
| `raw_note_text` | `text` | Source explanatory note, if relevant. |
| `requires_clarification` | `boolean NOT NULL DEFAULT false` | Data-quality flag; not an editorial approval stage. |
| `resolution_note` | `text CHECK (resolution_note IS NULL OR length(btrim(resolution_note)) > 0)` | Company clarification/mapping explanation; no invented repair. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
UNIQUE (sheet_id,id)
FOREIGN KEY (sheet_id,source_id) REFERENCES catalog.technical_sheet_sources (sheet_id,id) ON DELETE RESTRICT
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE INDEX technical_observations_source_idx ON catalog.technical_source_observations (source_id,page_number,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_observations_sheet_idx ON catalog.technical_source_observations (sheet_id,id) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `sheet_id`, `source_id`, `page_number`, `table_label`, `row_label`, `column_label`, `source_symbol`, `source_unit_text`, `raw_value_text`, `raw_condition_text`, `raw_note_text`.

### `catalog.technical_sections`

Ordered groups that preserve table organization, such as cabin, door, pit, and machine-room measurements.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `section_key` | `text NOT NULL CHECK (length(btrim(section_key)) > 0)` | Stable within-sheet presentation key. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
UNIQUE (sheet_id,id)
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_sections_live_uq ON catalog.technical_sections (sheet_id,section_key) WHERE deleted_at IS NULL;
CREATE INDEX technical_sections_order_idx ON catalog.technical_sections (sheet_id,sort_order,id) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `sheet_id`, `section_key`.

### `catalog.technical_section_translations`

Localized presentation with Arabic fallback; original source text lives separately.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `section_id` | `uuid NOT NULL REFERENCES catalog.technical_sections(id) ON DELETE RESTRICT` | Translated owner. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Application locale, independent of source language. |
| `title` | `text NOT NULL CHECK (length(btrim(title)) > 0)` | Translated group heading. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_section_translations_live_uq ON catalog.technical_section_translations (section_id, locale) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `section_id`, `locale`.

### `catalog.technical_configurations`

One source column/applicable configuration; equal capacities in different use groups remain distinct.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `configuration_key` | `text NOT NULL CHECK (length(btrim(configuration_key)) > 0)` | Stable configuration key, independent of capacity. |
| `capacity_kg` | `numeric(20,6) CHECK (capacity_kg IS NULL OR (capacity_kg > 0 AND capacity_kg NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)))` | Confirmed load capacity; NULL is unspecified, never copied blindly from a conflicting heading. |
| `passenger_count` | `integer CHECK (passenger_count IS NULL OR passenger_count > 0)` | Optional explicitly stated passenger count. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Column/display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
UNIQUE (sheet_id,id)
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_configurations_live_uq ON catalog.technical_configurations (sheet_id,configuration_key) WHERE deleted_at IS NULL;
CREATE INDEX technical_configurations_order_idx ON catalog.technical_configurations (sheet_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_capacity_lookup_idx ON catalog.technical_configurations (capacity_kg,sheet_id,id) WHERE deleted_at IS NULL AND capacity_kg IS NOT NULL;
```

Immutable relationship/semantic fields: `sheet_id`, `configuration_key`.

### `catalog.technical_configuration_translations`

Localized presentation with Arabic fallback; original source text lives separately.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `configuration_id` | `uuid NOT NULL REFERENCES catalog.technical_configurations(id) ON DELETE RESTRICT` | Translated owner. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Application locale, independent of source language. |
| `label` | `text NOT NULL CHECK (length(btrim(label)) > 0)` | Configuration label including use group where needed. |
| `applicability_note` | `text` | What the configuration does and does not describe. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_configuration_translations_live_uq ON catalog.technical_configuration_translations (configuration_id, locale) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `configuration_id`, `locale`.

### `catalog.technical_conditions`

Reusable within-sheet conditions; unqualified rows never automatically mean every speed.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `condition_key` | `text NOT NULL CHECK (length(btrim(condition_key)) > 0)` | Stable condition key. |
| `condition_kind` | `text NOT NULL CHECK (condition_kind IN ('UNQUALIFIED','EXACT_SPEED','OTHER'))` | UNQUALIFIED means no condition stated, not universal validity. |
| `speed_mps` | `numeric(20,6)` | Confirmed exact speed in m/s, only for EXACT_SPEED. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
UNIQUE (sheet_id,id)
CHECK ((condition_kind = 'EXACT_SPEED' AND speed_mps IS NOT NULL AND speed_mps > 0 AND speed_mps NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) OR (condition_kind <> 'EXACT_SPEED' AND speed_mps IS NULL))
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_conditions_live_uq ON catalog.technical_conditions (sheet_id,condition_key) WHERE deleted_at IS NULL;
CREATE INDEX technical_conditions_order_idx ON catalog.technical_conditions (sheet_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_speed_lookup_idx ON catalog.technical_conditions (speed_mps,sheet_id,id) WHERE deleted_at IS NULL AND condition_kind = 'EXACT_SPEED';
```

Immutable relationship/semantic fields: `sheet_id`, `condition_key`, `condition_kind`, `speed_mps`.

### `catalog.technical_condition_translations`

Localized presentation with Arabic fallback; original source text lives separately.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `condition_id` | `uuid NOT NULL REFERENCES catalog.technical_conditions(id) ON DELETE RESTRICT` | Translated owner. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Application locale, independent of source language. |
| `label` | `text NOT NULL CHECK (length(btrim(label)) > 0)` | Human-readable condition; preserves distinctions that one speed number cannot represent. |
| `detail` | `text` | Additional condition explanation. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_condition_translations_live_uq ON catalog.technical_condition_translations (condition_id, locale) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `condition_id`, `locale`.

### `catalog.technical_measurements`

Numeric source-cell interpretation scoped to a configuration, condition, definition and qualifier.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `configuration_id` | `uuid NOT NULL` | Configuration in this sheet. |
| `condition_id` | `uuid NOT NULL` | Explicit condition in this sheet, including an UNQUALIFIED row. |
| `section_id` | `uuid NOT NULL` | Ordered presentation group in this sheet. |
| `definition_id` | `uuid NOT NULL` | Existing NUMBER specification definition; unit comes from its canonical unit. |
| `value_type` | `text NOT NULL DEFAULT 'NUMBER' CHECK (value_type = 'NUMBER')` | Composite FK protects definition type. |
| `qualifier` | `text NOT NULL DEFAULT 'EXACT' CHECK (qualifier IN ('EXACT','MINIMUM','MAXIMUM'))` | Preserve separate min/max meanings, not one overwritten value. |
| `value_state` | `text NOT NULL DEFAULT 'KNOWN' CHECK (value_state IN ('KNOWN','NOT_SPECIFIED','NOT_APPLICABLE'))` | Explicit missingness. NOT_APPLICABLE requires an explicit source/company statement. |
| `number_value` | `numeric(20,6)` | Canonical numeric value, never zero for a blank cell. |
| `source_observation_id` | `uuid` | Optional exact source evidence within the sheet; private evidence is not automatically public. |
| `entry_basis` | `text CHECK (entry_basis IS NULL OR length(btrim(entry_basis)) > 0)` | Required for company-entered values without source observation. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Measurement order within a section. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
UNIQUE (sheet_id,id)
FOREIGN KEY (sheet_id,configuration_id) REFERENCES catalog.technical_configurations (sheet_id,id) ON DELETE RESTRICT
FOREIGN KEY (sheet_id,condition_id) REFERENCES catalog.technical_conditions (sheet_id,id) ON DELETE RESTRICT
FOREIGN KEY (sheet_id,section_id) REFERENCES catalog.technical_sections (sheet_id,id) ON DELETE RESTRICT
FOREIGN KEY (definition_id,value_type) REFERENCES catalog.specification_definitions (id,value_type) ON DELETE RESTRICT
FOREIGN KEY (sheet_id,source_observation_id) REFERENCES catalog.technical_source_observations (sheet_id,id) ON DELETE RESTRICT
CHECK ((value_state = 'KNOWN' AND number_value IS NOT NULL AND number_value NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) OR (value_state <> 'KNOWN' AND number_value IS NULL))
CHECK (source_observation_id IS NOT NULL OR entry_basis IS NOT NULL)
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_measurements_live_uq ON catalog.technical_measurements (configuration_id,condition_id,definition_id,qualifier) WHERE deleted_at IS NULL;
CREATE INDEX technical_measurements_render_idx ON catalog.technical_measurements (sheet_id,configuration_id,section_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_measurements_numeric_idx ON catalog.technical_measurements (definition_id,qualifier,number_value,configuration_id) WHERE deleted_at IS NULL AND value_state = 'KNOWN';
CREATE INDEX technical_measurements_condition_idx ON catalog.technical_measurements (condition_id,configuration_id) WHERE deleted_at IS NULL;
CREATE INDEX technical_measurements_source_idx ON catalog.technical_measurements (source_observation_id) WHERE deleted_at IS NULL AND source_observation_id IS NOT NULL;
```

Immutable relationship/semantic fields: `sheet_id`, `configuration_id`, `condition_id`, `definition_id`, `value_type`, `qualifier`.

### `catalog.technical_notes`

Scoped translated qualifications. Non-null targets combine by intersection, not by OR.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `section_id` | `uuid` | Optional section target. |
| `configuration_id` | `uuid` | Optional configuration target. |
| `condition_id` | `uuid` | Optional condition target. |
| `measurement_id` | `uuid` | Optional single-measurement target; exclusive of the preceding three targets. |
| `source_observation_id` | `uuid` | Optional original note evidence in this sheet. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
FOREIGN KEY (sheet_id,section_id) REFERENCES catalog.technical_sections (sheet_id,id) ON DELETE RESTRICT
FOREIGN KEY (sheet_id,configuration_id) REFERENCES catalog.technical_configurations (sheet_id,id) ON DELETE RESTRICT
FOREIGN KEY (sheet_id,condition_id) REFERENCES catalog.technical_conditions (sheet_id,id) ON DELETE RESTRICT
FOREIGN KEY (sheet_id,measurement_id) REFERENCES catalog.technical_measurements (sheet_id,id) ON DELETE RESTRICT
FOREIGN KEY (sheet_id,source_observation_id) REFERENCES catalog.technical_source_observations (sheet_id,id) ON DELETE RESTRICT
CHECK (measurement_id IS NULL OR (section_id IS NULL AND configuration_id IS NULL AND condition_id IS NULL))
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE INDEX technical_notes_order_idx ON catalog.technical_notes (sheet_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_notes_measurement_idx ON catalog.technical_notes (measurement_id) WHERE deleted_at IS NULL AND measurement_id IS NOT NULL;
```

Immutable relationship/semantic fields: `sheet_id`.

### `catalog.technical_note_translations`

Localized presentation with Arabic fallback; original source text lives separately.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `note_id` | `uuid NOT NULL REFERENCES catalog.technical_notes(id) ON DELETE RESTRICT` | Translated owner. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Application locale, independent of source language. |
| `body` | `text NOT NULL CHECK (length(btrim(body)) > 0)` | Qualification text, not separated from the data it qualifies in the UI. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX technical_note_translations_live_uq ON catalog.technical_note_translations (note_id, locale) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `note_id`, `locale`.

### `catalog.category_technical_sheets`

Explicit category-level reference attachment; allowed on parent categories and does not create product contents.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `category_id` | `uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT` | Category at any depth. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX category_technical_sheets_live_uq ON catalog.category_technical_sheets (category_id,sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX category_technical_sheets_order_idx ON catalog.category_technical_sheets (category_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX category_technical_sheets_reverse_idx ON catalog.category_technical_sheets (sheet_id,category_id) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `category_id`, `sheet_id`.

### `catalog.product_technical_sheets`

Explicit product attachment. A general reference is not a guaranteed product specification.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `product_id` | `uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT` | Owning product. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `relation_kind` | `text NOT NULL DEFAULT 'REFERENCE' CHECK (relation_kind IN ('REFERENCE','PRODUCT_SPECIFICATION'))` | PRODUCT_SPECIFICATION requires explicit selected configuration rows. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
UNIQUE (sheet_id,id)
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX product_technical_sheets_live_uq ON catalog.product_technical_sheets (product_id,sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX product_technical_sheets_order_idx ON catalog.product_technical_sheets (product_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX product_technical_sheets_reverse_idx ON catalog.product_technical_sheets (sheet_id,product_id) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `product_id`, `sheet_id`.

### `catalog.product_technical_configurations`

Explicit subset for a product-specific sheet attachment; no commercial variants, SKU, inventory or pricing.

| Column | SQL definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identity. |
| `sheet_id` | `uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT` | Owning technical sheet. |
| `product_sheet_id` | `uuid NOT NULL` | Product attachment in this same sheet. |
| `configuration_id` | `uuid NOT NULL` | Explicitly applicable configuration from the same sheet. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-record modification. |
| `deleted_at` | `timestamptz` | Soft deletion; no restore or physical purge. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic edit token; not audit history. |

Additional constraints:

```sql
FOREIGN KEY (sheet_id,product_sheet_id) REFERENCES catalog.product_technical_sheets (sheet_id,id) ON DELETE RESTRICT
FOREIGN KEY (sheet_id,configuration_id) REFERENCES catalog.technical_configurations (sheet_id,id) ON DELETE RESTRICT
```

Indexes (primary keys and non-partial unique constraints also create indexes):

```sql
CREATE UNIQUE INDEX product_technical_configurations_live_uq ON catalog.product_technical_configurations (product_sheet_id,configuration_id) WHERE deleted_at IS NULL;
CREATE INDEX product_technical_configurations_reverse_idx ON catalog.product_technical_configurations (configuration_id,product_sheet_id) WHERE deleted_at IS NULL;
```

Immutable relationship/semantic fields: `sheet_id`, `product_sheet_id`, `configuration_id`.

---

## Base schema and architecture (retained, with v1.1 amendments)

The following original schema remains applicable except where the v1.1 sections explicitly extend it. The original unmodified document is also included as `baseline-v1.0-design.md`.

### Base recommendation and scope

Use four independently owned PostgreSQL databases on one PostgreSQL deployment initially:
`golden_lift_identity`, `golden_lift_catalog`, `golden_lift_media`, and `golden_lift_inquiries`.
The corresponding internal schemas are `identity`, `catalog`, `media`, and `inquiries`.
Schema namespaces do not replace database isolation: run each entry script in its own database.

Catalog contains the recursive tree, products, translations, specifications, file associations,
and company content. Keep those together because the category-content and required-cover
rules need local transactions. Media owns actual file metadata, variants and processing;
Identity owns staff credentials; Inquiries owns private contact requests.

The original baseline has 34 business/support tables; v1.1 adds 16. With two `ops` tables in each database and one private Catalog `write_gate` table, the current package has 59 physical tables across the four databases. Translation and
operational tables account for much of that count; these tables are not independently deployed services.

This is the best-fit design I recommend for the agreed requirements, not a universal claim
that it beats every possible schema or a claim of measured performance. It optimizes for
correctness, explicit data ownership, multilingual content, easy branch moves, and
read-heavy browsing. Product/media counts and peak traffic are still unknown.

### Requirement-to-design traceability

| Agreed requirement | Design consequence |
| --- | --- |
| Anonymous web/Android/iOS browsing | No customer/user/visitor-account table. Device-local shortlists and locale choices stay on the device. |
| Admin content; Super Admin accounts only | Two stored staff role values with non-hierarchical API permissions; Public User is anonymous access. |
| Arbitrary category nesting | One self-referencing categories table; no hard-coded depth or separate table for every level. |
| Children OR products, covers allowed everywhere | Final-state transaction validation; independent optional category cover. |
| One leaf category per product | Non-null products.category_id plus active-parent/exclusivity validation. |
| Arabic, English, Sorani | Translation tables with locale ar/en/ckb and required active Arabic fallback rows. |
| Product must have a processed image cover | Non-null cover association pointer, same-product composite FK, and image/readiness validation. |
| Model codes reserved after deletion | Non-partial unique code registry, not an active-only unique index. |
| Immediate valid changes | No editorial publishing state; one commit updates active content. |
| Soft delete, no restore | deleted_at, retained rows/files, blocked physical deletion/restoration and effective-owner visibility. |
| Photos/videos/PDFs and reusable files | Media assets separate from ordered catalog associations. |
| Contact and quotation form | Private inquiries with product snapshots and durable notification state. |
| No business audit feature | No audit_log or event-sourced domain history; outbox/inbox are delivery infrastructure only. |

### New engineering choices made in this design

These are design recommendations, not statements that the user separately specified their SQL form:
UUID keys; a permanent code-reservation registry (also protecting codes after edits);
case-insensitive normalized staff emails that stay reserved after staff deletion;
explicit specification-to-category assignments without automatic inheritance;
canonical typed units; a serialized Catalog write gate; a local media registration/fence;
and immutable semantics for codes/units once used. Reconsider an engineering choice only
through a documented change, not by silently weakening agreed invariants.

## 2. Database boundaries and relationships

A real SQL foreign key exists only inside the same service database.
Catalog.media_asset_refs.id equals Media.assets.id by API contract but is not a cross-database FK.
Inquiry product_id and Media uploader_staff_id are external references; the services verify
and retain context rather than join remote tables. Do not install database links or
cross-service table credentials to make those look like ordinary local relations.

```text
Identity database                     Catalog database
  staff_accounts                         categories -> categories (parent)
    +-- staff_sessions                   categories -> products
    +-- staff_tokens                     products -> translations/specifications/media
                                         media_asset_refs (local verification/fence)
                                                 : API/events, NOT a SQL FK
Media database                           assets / variants / jobs
  assets -> asset_variants
  assets -> upload_sessions           Inquiry database
  assets -> processing_jobs              inquiries -> notification_deliveries
                                         product_id + product snapshot (external reference)
```

The six initial main categories are rows, not tables or fixed enum values:
Elevator cabins; Doors; Control panels; Motors; Home and service elevators;
Platforms and special elevators. Admins can add more or reorganize them.
The brochure provides business context for those categories, not the architecture.

## 3. Common modeling conventions

Business entities use UUID primary keys generated with gen_random_uuid(), except stable
natural keys for units and singleton settings. Source-assigned media registry UUIDs are
not regenerated locally. Dates use timestamptz. Numeric engineering quantities use
numeric(20,6), not formatted strings containing both numbers and units.

Every mutable business/support row carries created_at, updated_at, deleted_at and version.
`deleted_at IS NULL` means active. A trigger prevents changing a row once it is deleted,
updates timestamps, and increments version. Physical DELETE and TRUNCATE are rejected,
and runtime privileges must also withhold them. Migration owners remain powerful; normal
application roles must never be owners/superusers or be able to disable triggers.

Record versions are optimistic edit tokens, not audit history. A product/category edit
must check the owning aggregate version, including edits of its translated or media rows.
The repository must update that owning version in the same transaction. A zero-row
expected-version UPDATE is an edit conflict, not a successful save.

Foreign keys use RESTRICT/NO ACTION, not ON DELETE CASCADE. Soft deletion is an UPDATE,
so ordinary FK deletion actions cannot implement branch archival. Service routines make
branch state changes explicitly and atomically. Soft-deleted parents remain valid
historical FK targets, but public visibility additionally requires active ownership.

Translation rows have their own UUID plus a partial unique owner/locale index. This lets
an Admin remove a translation and later insert a NEW translation row without restoring
the old one. Arabic cannot be removed while its owner stays active. Optional description
fallback operates field-by-field, not merely by whether a translation row exists.

A stable URL uses the entity UUID, optionally followed by a translated descriptive slug.
Slugs do not need global uniqueness and category moves do not change identity.

## 4. The category tree and its transaction rules

### 4.1 Why adjacency list

`categories.parent_id` is NULL at a root and references another category otherwise.
Recursive CTEs retrieve ancestors and descendants [1]. About 100 categories and
administrator-controlled branch moves make this a simpler initial choice than maintaining
closure rows, nested-set left/right values, or duplicated materialized paths.

Do not store is_leaf or content_mode as another mutable fact. Determine eligibility from
active child categories and active products. Do not cache that answer in a column that
can disagree with the actual contents. A category whose contents have all been soft-deleted
is empty for new active content, while its historical children/products remain stored.

### 4.2 Invariants not expressed by an ordinary CHECK

PostgreSQL CHECK constraints are not a general mechanism for checking other rows/tables [2].
Therefore, use ordinary CHECK/FK/unique constraints for row-local facts and deferred
constraint triggers for final-state rules. PostgreSQL supports deferred constraint triggers [3].

The Catalog validator rejects a commit when an active category has an inactive parent,
contains both child categories and products, forms a cycle, or lacks Arabic content.
It rejects active products without a valid category, Arabic name, current owned code,
or active verified IMAGE cover. It also validates used specification definitions, units,
option ownership/cardinality and explicit category applicability.

### 4.3 Concurrency strategy

All Catalog mutations run in SERIALIZABLE transactions. A BEFORE STATEMENT trigger
updates one private write_gate row, serializing Catalog write transactions. Every mutation
advances a revision. Deferred callbacks validate final state once per revision and mark
that revision checked. Multiple callbacks at commit do not repeatedly scan unchanged state.

The write gate is NOT writable by the runtime login except through protected trigger
functions. SERIALIZABLE is still required so a waiting writer cannot safely commit using
an old snapshot. Retry the entire transaction on 40001; retry deadlocks (40P01) with bounded
backoff. Do not automatically retry a stale expected-version edit as if the user had seen
the new record. Serializable transactions can require retries [4].

Do not call remote APIs, upload files, send emails, or publish messages while holding the
gate. Verify input before entry; persist local effects plus outbox events; perform external
work after commit. Ordinary browsing does not acquire the write gate.

Tradeoff: all Catalog writes are serialized and validation scans grow with stored active
content. That is intentional for low-frequency staff editing, not a claim that this is the
maximum-throughput write architecture. Benchmark before release; switch to carefully
scoped checks/per-root locking only when a measured need justifies the added complexity.

### 4.4 Branch operations

Move: acquire the write gate, check expected version, active destination and ancestry,
change only the root parent/order, validate and commit. Descendant category IDs, product
ownership and specification assignments stay unchanged. The final validator is the
backstop, not a replacement for friendly use-case errors.

Delete: enumerate active descendants, soft-delete their active product detail records,
products, category translations/assignments and categories in one transaction, and append
one outbox notification. Shared Media assets are not automatically deleted. The included
soft_delete_branch routine demonstrates this operation. The outbox event contains counts
and a root ID, not an unbounded array of every product or a full historical snapshot.

## 5. Products, covers and model-code reservation

`products.cover_media_id` is NOT NULL. A deferred composite FK from
`products(id, cover_media_id)` to `product_media(product_id, id)` proves that a cover is
one of that product's gallery members. Final-state validation proves that the member is
active and points to a verified IMAGE asset. This guarantees at least one cover, unlike
an is_cover partial unique index, which by itself guarantees only at most one.

Create a product transactionally: allocate UUIDs, insert the product with its future
cover association ID, insert its Arabic translation and gallery association, optionally
reserve a code, then commit. The FK is deferred only until that commit. This does not add
public drafts. A referenced asset must have passed Media validation before this operation.

The code registry has a global UNIQUE(code_key), normalized as upper(btrim(code)).
There is no deleted_at predicate on that uniqueness. Registry ownership and display code
are immutable. Products may choose a new current reservation while old reservations remain
owned by the same product. Searching a previous code can resolve to its live owner;
canonical display still uses the current code. A deleted product never appears in results.
This small extra table closes the otherwise easy-to-miss code-edit reuse loophole.

## 6. Typed specifications rather than unstructured product JSON

Definitions have NUMBER, BOOLEAN, TEXT or CHOICE type. A NUMBER uses a canonical unit;
TEXT values have localized rows; CHOICE values reference stable options with localized
labels. Definition labels also have translations. Width/height/depth are separate numeric
attributes in a common canonical unit, not an opaque string such as '100 x 200 cm'.

The product value container has exactly the appropriate typed scalar populated. A composite
FK forces value_type to agree with the definition. Option selections also use composite
FKs so an option cannot be selected under another definition. Deferred validation checks
required Arabic text, at least one selected option, single/multi-choice cardinality,
numeric bounds, and category applicability. Specifications remain optional at product creation.

Definitions are assigned explicitly to categories in V1. No hidden ancestor inheritance
changes a product's fields after a branch move. A bulk copy/template use case can reduce
admin input without changing this data model. Option IDs, not translated labels, drive
material/finish filters. Type and canonical unit cannot change once any values, even
historical values, exist; create a replacement definition for a semantic change.

Rich-text page documents, technical media metadata and event envelopes use JSONB. Source observations added in v1.1 are explicit relational evidence rows, not replacement specification JSON.
Core relationships, categories, product identity, specifications and media membership stay
relational. This improves type enforcement and makes numerical/option filters explicit.

## 7. Media ownership, reuse and race-free retirement

Media.assets owns storage keys, MIME/checksum/dimension metadata and readiness. Original
files and variants reside in private object storage. Do not persist signed URLs; they are
short-lived delivery results. Catalog.product_media owns gallery ordering/captions, and a
category/page/logo has its explicit cover reference. An asset can be reused many times.

Catalog.media_asset_refs stores only a verified registration and an irreversible retirement
fence. It is not the authoritative copy of file storage metadata. Trustworthy Media events
or service responses create READY registrations; public/admin payloads cannot create them.

A remote 'check references, then delete' sequence is unsafe because another attachment can
arrive between those steps. Instead:

1. The Media retirement request asks Catalog to retire the asset reference.
2. In a gated Catalog transaction, check all active product/category/page/logo references.
   Reject while any remain. Otherwise set local deleted_at and record a durable outbox event.
3. All new attachments now fail against that same local fence, including delayed READY events.
4. Media consumes the trusted event, records its event ID, soft-deletes its asset metadata,
   and stops authorizing delivery. Stored objects are retained. Retries finish failures
   after Catalog commits; they do not undo the retirement.

A failed upload never registered in Catalog gets a tombstone (ready_at remains NULL), so
late readiness cannot resurrect it. The Media row's retirement_event_id documents the
protocol step but is not a magical cross-database constraint. Services must authenticate
and validate the message. There is no distributed transaction across databases.

Delivery checks Media state AND effective live Catalog usage. Removing a product's last
reference does not physically delete the file or automatically delete the asset record,
but that removed context no longer grants public delivery. Shared valid contexts continue.
The previously proposed five-minute link-expiry objective remains an engineering target
for the delivery/CDN layer; database timestamps do not enforce it by themselves. Already
downloaded copies and transfers already in progress cannot be withdrawn by this schema.

## 8. Staff, inquiries, and durable asynchronous work

Only ADMIN and SUPER_ADMIN appear in staff_accounts. Their capabilities are not hierarchical:
SUPER_ADMIN account administration must reject a target SUPER_ADMIN and does not grant
Catalog/Inquiries permissions. Database service roles isolate services; they are not a
substitute for staff-role authorization in Node.js use cases.

Store password hashes, never passwords. Sessions and one-use action tokens store digests
of high-entropy random secrets. Every authorization checks session expiry/revocation,
account status/deletion and matching auth_version. Account authentication changes advance
auth_version and revoke existing sessions/tokens. Token consumption and password setup/reset
must be atomic; never store a raw invitation/reset token in the database.

Inquiries require a name, message, and at least one contact method. The optional external
product reference has a verified name/code snapshot so future product changes/deletion do
not make the request unintelligible. All Admins can use the inbox; Super Admin cannot.
No visitor/customer row is created. Idempotency keys prevent duplicate form submissions;
a hash detects the same key reused with a different payload.

Store the inquiry and pending notification state in one local transaction, independently
of actual email success. Catalog settings propagate to a local Inquiry settings projection
using versioned messages. Missing configuration can leave delivery pending without losing
the inquiry. Soft-deleting an inquiry must cancel unstarted notification work; email
already handed to an external provider is a separate irreversible side effect.

Each database has an outbox for committed events and an inbox primary key on
(consumer_name, message_id). Write the business effect and outbox together. Consumers write
the inbox key and local effect together; reject duplicates atomically. The transactional
outbox addresses the dual-write problem, but consumers still need idempotency [5].

Worker queues use available/next-attempt timestamps, lease expiration, attempts and fencing
tokens. Claim bounded batches with FOR UPDATE SKIP LOCKED, commit the claim, do external
work, and accept completion only with the current lease token. SKIP LOCKED is suitable for
queue-like work, not for pretending a skipped-row query is a complete report [6].

Outbox/inbox/job state is operational reliability infrastructure, not a user-facing content
audit trail. No event-sourced catalog or general administrator-change history is introduced.
No physical retention purge is included; retained records and files continue to grow.

## 9. Index strategy and example queries

Partial indexes include active rows and frequently queried subsets, not one index for every
category. The query must include predicates compatible with the index predicate [7]. Keep
`deleted_at IS NULL` explicit. Permanent identifiers (model codes, staff email keys, object
keys, token digests and idempotency keys) use full unique indexes.

The primary listing index is `(category_id, sort_order, id)` over live products. Put equality
filters before ordering/cursor columns; column order matters for multicolumn B-tree indexes [8].
Use id as a deterministic tie-breaker. Ordering numbers are not unique; insert gaps such as
1024 between positions and renumber a bounded sibling list in a transaction when necessary.
Concurrent reorders use an expected parent/tree version and invalidate existing list cursors.

```sql
-- Run through the Catalog read repository. Parameters are bind parameters, not interpolation.
SELECT p.id, p.category_id, p.sort_order,
       coalesce(wanted.name, ar.name) AS name,
       CASE WHEN wanted.id IS NULL THEN 'ar' ELSE $2 END AS name_locale,
       coalesce(nullif(wanted.short_description, ''), ar.short_description) AS short_description
FROM catalog.live_products p
JOIN catalog.product_translations ar
  ON ar.product_id = p.id AND ar.locale = 'ar' AND ar.deleted_at IS NULL
LEFT JOIN catalog.product_translations wanted
  ON wanted.product_id = p.id AND wanted.locale = $2 AND wanted.deleted_at IS NULL
WHERE p.category_id = $1
  AND (p.sort_order, p.id) > ($3::bigint, $4::uuid)
ORDER BY p.sort_order, p.id
LIMIT $5;
```

For a first page omit the cursor predicate. A later request after a reorder is a fresh live
list, not a guaranteed historical snapshot; a cursor containing a changed list revision
should cause a reload rather than silently promise stable traversal.

Translation search_text columns preserve display text and use a minimal lowercased search
projection with GIN pg_trgm indexes. PostgreSQL pg_trgm supports indexed similarity and
LIKE/ILIKE searches [9]. It does not itself supply a complete Arabic or Sorani morphological
search engine. Test native-language examples and short queries. Avoid wildcard-only or
unbounded searches. Model-code exact lookup takes the B-tree fast path. Search results
must join live products/categories and deduplicate requested-language/Arabic matches.

Category-name searches can return categories and/or query descendants explicitly; do not
silently duplicate mutable ancestor names into every product document without an update
strategy. Search is local PostgreSQL work in V1, not a separate search service.

Do not create partial indexes with `expires_at > now()` or `next_attempt_at <= now()`.
Time belongs in the query filter; the index stores the timestamp and a stable state predicate.
Do not add duplicate indexes for PK/UNIQUE constraints: PostgreSQL already creates supporting
indexes. Foreign-key columns need workload-specific indexes, not an assumption that declaring
a FK indexes its referencing side [2]. Inspect the complete generated index catalog below.

Use EXPLAIN (ANALYZE, BUFFERS) on realistic data before changing indexes. No partitioning,
closure table, dedicated search engine, read replica or sharding is justified solely by
100 categories or an unquantified expectation of high visitors. Replicas/caches would need
an explicit freshness policy so they do not weaken immediate publication.

## 10. Why this is the recommended fit

| Alternative | Why it is not the initial design |
| --- | --- |
| Separate main/sub/sub-sub tables | Hard-codes depth and duplicates category operations. |
| Nested sets/materialized paths/closure table by default | Additional maintenance on moves; not justified by the known small category tree. |
| One database shared by all services | Weakens data ownership and permits cross-service coupling. |
| Service per category/table | Makes one business rule span unnecessary distributed transactions. |
| All specifications in untyped JSON or strings | Weak unit/type validation and less explicit numeric/option filtering. |
| Separate fixed columns per language | Repeats multilingual structure and makes fallback/translation deletion less systematic. |
| Only is_cover plus a unique index | Prevents two covers but does not require one or ensure it belongs to its product. |
| Active-only model-code uniqueness | Frees deleted codes, contrary to the agreed rule. |
| Only deleted_at with no visibility/privilege policy | Can leak deleted data through joins, direct routes or files and allows accidental restoration. |
| Remote check-then-delete for media | Leaves a race with new references. |
| Dynamic permission system/event sourcing at launch | Adds requirements not requested; fixed staff roles and delivery state are sufficient. |

The costs are real: four databases and service coordination are operationally more complex
than a modular monolith, typed translated attributes use more joins than an opaque document,
indefinite soft deletion grows storage, and the global write fence limits write throughput.
Microservices are a user requirement; this design minimizes unnecessary distributed rules
inside that requirement rather than pretending those costs disappear.

## 11. Implementation and validation status

The package defines tables, columns, relationships, constraints, indexes, Catalog final-state
validation, soft-delete/retirement routines and rollback-only smoke checks. It does not
implement the TypeScript services, ORM repositories, upload verification, message transport,
mail delivery, caching/CDN rules, UI or authorization endpoints.

The SQL has not been executed against PostgreSQL here, so syntax/runtime behavior, function
privileges, full migration application and concurrent behavior must be verified in an actual
PostgreSQL environment. `VALIDATION.md` names the required tests and performance checks.
The global validator deliberately favors comprehensible correctness; its full-catalog scan
cost must be measured before calling this a production-ready implementation.

Below is the complete field dictionary and exact proposed index set. Generated columns are
read-only to application inserts/updates. IDs and standard lifecycle fields are not omitted.

## 12. Complete table dictionary

### Database: golden_lift_identity

#### `identity.staff_accounts`

Authenticated staff only; anonymous visitors have no account row.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `email` | `text NOT NULL CHECK (length(btrim(email)) > 0)` | Original staff email. |
| `email_key` | `text GENERATED ALWAYS AS (lower(btrim(email))) STORED` | Normalized login identity. |
| `display_name` | `text NOT NULL CHECK (length(btrim(display_name)) > 0)` | Staff display name. |
| `role` | `text NOT NULL CHECK (role IN ('ADMIN','SUPER_ADMIN'))` | Non-hierarchical application role. |
| `status` | `text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','DISABLED'))` | Disabled is distinct from deleted. |
| `password_hash` | `text` | Encoded password hash; never plaintext. |
| `auth_version` | `bigint NOT NULL DEFAULT 1 CHECK (auth_version > 0)` | Increment to invalidate existing sessions. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
UNIQUE (email_key)
CHECK (status <> 'ACTIVE' OR password_hash IS NOT NULL)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX staff_active_directory_idx ON identity.staff_accounts (role, created_at DESC, id) WHERE deleted_at IS NULL;
```

Design policy: normalized staff emails stay reserved after deletion. Super Admin may manage Admin accounts only; target-role checks belong in Identity use cases.

#### `identity.staff_sessions`

Server-side sessions using a digest of a high-entropy opaque token.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `staff_id` | `uuid NOT NULL REFERENCES identity.staff_accounts(id) ON DELETE RESTRICT` | Owning staff account. |
| `token_hash` | `bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32)` | SHA-256 digest of random session token, not a password hash. |
| `auth_version` | `bigint NOT NULL` | Account auth_version captured at issuance. |
| `expires_at` | `timestamptz NOT NULL` | Absolute expiration; checked on every authorization. |
| `revoked_at` | `timestamptz` | Session revocation instant. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
CHECK (expires_at > created_at)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX sessions_account_active_idx ON identity.staff_sessions (staff_id, expires_at, id) WHERE deleted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx ON identity.staff_sessions (expires_at, id) WHERE deleted_at IS NULL AND revoked_at IS NULL;
```

Join the account for each authorization or use a separately validated synchronous revocation mechanism. A valid token alone never overrides account deletion/disablement.

#### `identity.staff_tokens`

Expiring, single-use invitation and password-reset tokens.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `staff_id` | `uuid NOT NULL REFERENCES identity.staff_accounts(id) ON DELETE RESTRICT` | Target account. |
| `purpose` | `text NOT NULL CHECK (purpose IN ('INVITATION','PASSWORD_RESET'))` | Token purpose. |
| `token_hash` | `bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32)` | Digest of random token. |
| `expires_at` | `timestamptz NOT NULL` | Absolute expiration. |
| `consumed_at` | `timestamptz` | Set atomically on successful use. |
| `revoked_at` | `timestamptz` | Set on invalidation. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
CHECK (expires_at > created_at)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX staff_tokens_open_idx ON identity.staff_tokens (staff_id, purpose, expires_at) WHERE deleted_at IS NULL AND consumed_at IS NULL AND revoked_at IS NULL;
```

### Database: golden_lift_catalog

#### `catalog.media_asset_refs`

Local registrations of verified READY assets; also the attachment/deletion coordination boundary.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY` | The asset UUID from Media; a local registry key, not a cross-database FK. |
| `media_kind` | `text NOT NULL CHECK (media_kind IN ('IMAGE','VIDEO','PDF'))` | Immutable asset kind supplied by Media. |
| `source_version` | `bigint NOT NULL CHECK (source_version > 0)` | Media version verified at registration. |
| `ready_at` | `timestamptz` | Verified readiness timestamp; NULL only for a pre-readiness retirement tombstone. |
| `retirement_event_id` | `uuid UNIQUE` | Durable event identifier when retirement is accepted. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
CHECK (deleted_at IS NULL OR retirement_event_id IS NOT NULL)
CHECK (deleted_at IS NOT NULL OR ready_at IS NOT NULL)
```

Only a trusted service flow may register a verified READY asset. Setting deleted_at is the irreversible local fence that prevents new references. Source files stay owned by Media.

#### `catalog.categories`

One adjacency-list table represents roots and subcategories at every depth.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `parent_id` | `uuid REFERENCES catalog.categories(id) ON DELETE RESTRICT` | NULL for a root; otherwise direct parent. |
| `cover_asset_id` | `uuid REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT` | Optional IMAGE presentation asset, including on parent categories. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Sibling order; ties are resolved by id. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
CHECK (parent_id IS NULL OR parent_id <> id)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX categories_children_live_idx ON catalog.categories (parent_id, sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX categories_cover_live_idx ON catalog.categories (cover_asset_id) WHERE deleted_at IS NULL AND cover_asset_id IS NOT NULL;
```

The category content mode is derived from active children/products. Do not persist is_leaf or duplicated depth/path counters in V1.

#### `catalog.category_translations`

One active translation per category and supported locale.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `category_id` | `uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT` | Owning category. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Content language. |
| `name` | `text NOT NULL CHECK (length(btrim(name)) > 0)` | Translated name. |
| `description` | `text` | Optional translated description. |
| `slug` | `text` | Optional descriptive URL suffix; ID remains the route identity. |
| `search_text` | `text GENERATED ALWAYS AS (lower(name &#124;&#124; ' ' &#124;&#124; coalesce(description,''))) STORED` | Search-only text; original fields are preserved. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX category_translation_live_uq ON catalog.category_translations (category_id, locale) WHERE deleted_at IS NULL;
CREATE INDEX category_translation_search_idx ON catalog.category_translations USING gin (search_text gin_trgm_ops) WHERE deleted_at IS NULL;
```

Arabic is required by the deferred catalog validator. Translation deletion uses a surrogate ID so a later new translation can be a new row, not restoration of the deleted row.

#### `catalog.products`

A product/design belongs to exactly one active leaf category.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `category_id` | `uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT` | Single owning category. |
| `cover_media_id` | `uuid NOT NULL` | Required member of this product gallery; composite FK added after product_media exists. |
| `current_model_code_id` | `uuid` | Optional current code reservation; previous reservations are retained. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Order within category. |
| `is_featured` | `boolean NOT NULL DEFAULT false` | Eligible for homepage featured section. |
| `featured_order` | `bigint NOT NULL DEFAULT 1024` | Homepage order when featured. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX products_category_live_idx ON catalog.products (category_id, sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX products_featured_live_idx ON catalog.products (featured_order, id) WHERE deleted_at IS NULL AND is_featured;
```

No draft/published status, price, inventory, or customer ownership columns. Validation is deferred to transaction commit, not deferred publication.

#### `catalog.product_code_reservations`

Permanent model-code ownership, including replaced codes and deleted products.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `product_id` | `uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT` | Permanent owner. |
| `code` | `text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 128)` | Display model code. |
| `code_key` | `text GENERATED ALWAYS AS (upper(btrim(code))) STORED` | Case-insensitive, outer-whitespace-normalized key. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
UNIQUE (code_key)
UNIQUE (product_id, id)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX product_code_owner_idx ON catalog.product_code_reservations (product_id);
```

The uniqueness is deliberately NOT partial. Old codes cannot be reassigned to another product even after edits or soft deletion. This is an identity registry, not a business audit log.

#### `catalog.product_translations`

Translated names/descriptions; active Arabic name required.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `product_id` | `uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT` | Owning product. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Content language. |
| `name` | `text NOT NULL CHECK (length(btrim(name)) > 0)` | Product name. |
| `short_description` | `text` | Card/summary description. |
| `description` | `text` | Detailed description. |
| `slug` | `text` | Optional URL suffix; not the identity. |
| `search_text` | `text GENERATED ALWAYS AS (lower(name &#124;&#124; ' ' &#124;&#124; coalesce(short_description,'') &#124;&#124; ' ' &#124;&#124; coalesce(description,''))) STORED` | Search text without destructive linguistic normalization. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX product_translation_live_uq ON catalog.product_translations (product_id, locale) WHERE deleted_at IS NULL;
CREATE INDEX product_translation_search_idx ON catalog.product_translations USING gin (search_text gin_trgm_ops) WHERE deleted_at IS NULL;
```

#### `catalog.product_media`

Ordered product-to-asset associations, independently soft-deletable.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `product_id` | `uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT` | Owning product. |
| `asset_id` | `uuid NOT NULL REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT` | Locally verified reference to Media asset. |
| `content_locale` | `text CHECK (content_locale IN ('ar','en','ckb'))` | File language, especially brochures; NULL means language-neutral. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Gallery order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
UNIQUE (product_id, id)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX product_media_live_uq ON catalog.product_media (product_id, asset_id) WHERE deleted_at IS NULL;
CREATE INDEX product_media_order_live_idx ON catalog.product_media (product_id, sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX product_media_asset_live_idx ON catalog.product_media (asset_id, product_id) WHERE deleted_at IS NULL;
```

There is no duplicate is_cover flag. products.cover_media_id selects the one cover association. Deleting an association does not delete its asset.

#### `catalog.product_media_translations`

Translated display titles, captions, and image alternative text.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `product_media_id` | `uuid NOT NULL REFERENCES catalog.product_media(id) ON DELETE RESTRICT` | Owning association. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Content language. |
| `title` | `text` | Media title, including brochure label. |
| `caption` | `text` | Optional caption. |
| `alt_text` | `text` | Image alternative text. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX product_media_translation_live_uq ON catalog.product_media_translations (product_media_id, locale) WHERE deleted_at IS NULL;
```

#### `catalog.units`

Canonical engineering units, not per-product unit strings.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `code` | `text PRIMARY KEY` | Stable unit code, for example mm, kg, kw. |
| `symbol` | `text NOT NULL` | Display symbol, for example mm or kg. |
| `dimension` | `text NOT NULL` | Physical quantity, for example length, mass, or power. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Definitions reference a canonical unit. Changing unit semantics after values exist is prohibited. Conversion, when offered, is application logic.

#### `catalog.specification_definitions`

Typed, reusable attribute definitions with canonical units.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `code` | `text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0)` | Stable identifier such as width or rated_power. |
| `value_type` | `text NOT NULL CHECK (value_type IN ('NUMBER','BOOLEAN','TEXT','CHOICE'))` | Storage/validation type. |
| `unit_code` | `text REFERENCES catalog.units(code) ON DELETE RESTRICT` | Canonical unit for NUMBER values; NULL for unitless counts. |
| `minimum_value` | `numeric(20,6)` | Optional numeric lower bound. |
| `maximum_value` | `numeric(20,6)` | Optional numeric upper bound. |
| `allow_multiple` | `boolean NOT NULL DEFAULT false` | For CHOICE only. |
| `is_filterable` | `boolean NOT NULL DEFAULT false` | Whether to expose as a public filter. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
UNIQUE (id, value_type)
CHECK (value_type = 'NUMBER' OR (unit_code IS NULL AND minimum_value IS NULL AND maximum_value IS NULL))
CHECK (value_type = 'CHOICE' OR allow_multiple = false)
CHECK (minimum_value IS NULL OR maximum_value IS NULL OR minimum_value <= maximum_value)
```

Definition type and unit cannot change after any values have been recorded. Create a new definition for a semantic change. No specification is globally mandatory at product creation.

#### `catalog.specification_translations`

Translated specification labels.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `definition_id` | `uuid NOT NULL REFERENCES catalog.specification_definitions(id) ON DELETE RESTRICT` | Owning definition. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Label language. |
| `label` | `text NOT NULL CHECK (length(btrim(label)) > 0)` | Human-readable label. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX specification_translation_live_uq ON catalog.specification_translations (definition_id, locale) WHERE deleted_at IS NULL;
```

#### `catalog.specification_options`

Controlled option values, such as stainless steel or bronze.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `definition_id` | `uuid NOT NULL REFERENCES catalog.specification_definitions(id) ON DELETE RESTRICT` | Owning CHOICE definition. |
| `code` | `text NOT NULL CHECK (length(btrim(code)) > 0)` | Stable option code. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Option display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
UNIQUE (definition_id, code)
UNIQUE (id, definition_id)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX specification_options_live_idx ON catalog.specification_options (definition_id, sort_order, id) WHERE deleted_at IS NULL;
```

#### `catalog.specification_option_translations`

Translated option labels; option IDs drive filtering.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `option_id` | `uuid NOT NULL REFERENCES catalog.specification_options(id) ON DELETE RESTRICT` | Owning option. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Label language. |
| `label` | `text NOT NULL CHECK (length(btrim(label)) > 0)` | Display label. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX specification_option_translation_live_uq ON catalog.specification_option_translations (option_id, locale) WHERE deleted_at IS NULL;
```

#### `catalog.category_specifications`

Explicit category-to-definition assignments, with no implicit inheritance in V1.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `category_id` | `uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT` | Category whose products may use this definition. |
| `definition_id` | `uuid NOT NULL REFERENCES catalog.specification_definitions(id) ON DELETE RESTRICT` | Allowed specification. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Order in product specification editor. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX category_specification_live_uq ON catalog.category_specifications (category_id, definition_id) WHERE deleted_at IS NULL;
CREATE INDEX category_specification_definition_idx ON catalog.category_specifications (definition_id, category_id) WHERE deleted_at IS NULL;
```

Moving a category branch preserves its definition assignments. Copying templates is an admin use case. Moving an individual product requires compatible destination assignments.

#### `catalog.product_specification_values`

One active typed value container per product/definition.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `product_id` | `uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT` | Owning product. |
| `definition_id` | `uuid NOT NULL` | Specification definition. |
| `value_type` | `text NOT NULL CHECK (value_type IN ('NUMBER','BOOLEAN','TEXT','CHOICE'))` | Must match definition through composite FK. |
| `number_value` | `numeric(20,6)` | NUMBER value in the definition canonical unit. |
| `boolean_value` | `boolean` | BOOLEAN value. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
FOREIGN KEY (definition_id, value_type) REFERENCES catalog.specification_definitions(id, value_type) ON DELETE RESTRICT
UNIQUE (id, definition_id)
CHECK ((value_type = 'NUMBER' AND number_value IS NOT NULL AND number_value <> 'NaN'::numeric AND boolean_value IS NULL) OR (value_type = 'BOOLEAN' AND boolean_value IS NOT NULL AND number_value IS NULL) OR (value_type IN ('TEXT','CHOICE') AND number_value IS NULL AND boolean_value IS NULL))
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX product_specification_live_uq ON catalog.product_specification_values (product_id, definition_id) WHERE deleted_at IS NULL;
CREATE INDEX specification_number_filter_idx ON catalog.product_specification_values (definition_id, number_value, product_id) WHERE deleted_at IS NULL AND value_type = 'NUMBER';
CREATE INDEX specification_boolean_filter_idx ON catalog.product_specification_values (definition_id, boolean_value, product_id) WHERE deleted_at IS NULL AND value_type = 'BOOLEAN';
```

#### `catalog.product_specification_texts`

Language-specific values for TEXT specifications.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `value_id` | `uuid NOT NULL REFERENCES catalog.product_specification_values(id) ON DELETE RESTRICT` | Owning TEXT value. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Value language. |
| `text_value` | `text NOT NULL CHECK (length(btrim(text_value)) > 0)` | Translated free-text value. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX specification_text_live_uq ON catalog.product_specification_texts (value_id, locale) WHERE deleted_at IS NULL;
```

#### `catalog.product_specification_choices`

One or more selected controlled options for a CHOICE value.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `value_id` | `uuid NOT NULL` | Owning value container. |
| `definition_id` | `uuid NOT NULL` | Carried to enforce matching definition through composite FKs. |
| `option_id` | `uuid NOT NULL` | Selected option. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
FOREIGN KEY (value_id, definition_id) REFERENCES catalog.product_specification_values(id, definition_id) ON DELETE RESTRICT
FOREIGN KEY (option_id, definition_id) REFERENCES catalog.specification_options(id, definition_id) ON DELETE RESTRICT
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX specification_choice_live_uq ON catalog.product_specification_choices (value_id, option_id) WHERE deleted_at IS NULL;
CREATE INDEX specification_choice_filter_idx ON catalog.product_specification_choices (option_id, value_id) WHERE deleted_at IS NULL;
```

Composite FKs prevent selecting an option from another definition. Deferred validation enforces CHOICE type and single/multiple cardinality.

#### `catalog.pages`

Company/Home/About/Contact page identities, independent of translations.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `page_key` | `text NOT NULL UNIQUE CHECK (length(btrim(page_key)) > 0)` | Stable key such as home, about, or contact. |
| `cover_asset_id` | `uuid REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT` | Optional IMAGE asset. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX page_cover_live_idx ON catalog.pages (cover_asset_id) WHERE deleted_at IS NULL AND cover_asset_id IS NOT NULL;
```

#### `catalog.page_translations`

Translated company-page content.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `page_id` | `uuid NOT NULL REFERENCES catalog.pages(id) ON DELETE RESTRICT` | Owning page. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Content language. |
| `title` | `text NOT NULL CHECK (length(btrim(title)) > 0)` | Page title. |
| `body` | `jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(body) = 'object')` | Validated rich-text document; text/formatting only, no hidden asset references. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX page_translation_live_uq ON catalog.page_translations (page_id, locale) WHERE deleted_at IS NULL;
```

#### `catalog.faq_items`

Ordered FAQ entries.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | FAQ display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX faq_order_live_idx ON catalog.faq_items (sort_order, id) WHERE deleted_at IS NULL;
```

#### `catalog.faq_translations`

Translated FAQ questions and answers.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `faq_id` | `uuid NOT NULL REFERENCES catalog.faq_items(id) ON DELETE RESTRICT` | Owning FAQ item. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Content language. |
| `question` | `text NOT NULL CHECK (length(btrim(question)) > 0)` | Question. |
| `answer` | `text NOT NULL CHECK (length(btrim(answer)) > 0)` | Answer. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX faq_translation_live_uq ON catalog.faq_translations (faq_id, locale) WHERE deleted_at IS NULL;
```

#### `catalog.site_settings`

One current company configuration record.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `smallint PRIMARY KEY CHECK (id = 1)` | Singleton key. |
| `logo_asset_id` | `uuid REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT` | Optional approved company logo asset. |
| `public_email` | `text` | Public contact email; actual verified value required for launch. |
| `sales_notification_email` | `text` | Destination for inquiry notifications. |
| `phone` | `text` | Verified public phone. |
| `whatsapp` | `text` | Verified WhatsApp contact. |
| `map_url` | `text` | Optional map link. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

No brochure placeholders are seeded. Soft-deleting the singleton deactivates configuration; no restore is supplied. Normal changes are updates. Public access must omit sales_notification_email.

#### `catalog.site_setting_translations`

Company name, address, and short branding copy by language.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `settings_id` | `smallint NOT NULL REFERENCES catalog.site_settings(id) ON DELETE RESTRICT` | Singleton settings owner. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Content language. |
| `company_name` | `text NOT NULL CHECK (length(btrim(company_name)) > 0)` | Approved company name. |
| `tagline` | `text` | Short tagline. |
| `address` | `text` | Verified company address. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX site_translation_live_uq ON catalog.site_setting_translations (settings_id, locale) WHERE deleted_at IS NULL;
```

#### `catalog.social_links`

Editable company social links.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `platform` | `text NOT NULL CHECK (length(btrim(platform)) > 0)` | Platform label/code. |
| `url` | `text NOT NULL CHECK (url ~ '^https://')` | HTTPS destination; application validates full URL. |
| `sort_order` | `bigint NOT NULL DEFAULT 1024` | Display order. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX social_links_order_live_idx ON catalog.social_links (sort_order, id) WHERE deleted_at IS NULL;
```

### Database: golden_lift_media

#### `media.assets`

Authoritative files and readiness; binaries remain in private object storage.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `media_kind` | `text NOT NULL CHECK (media_kind IN ('IMAGE','VIDEO','PDF'))` | Image, video, or PDF. |
| `status` | `text NOT NULL DEFAULT 'UPLOADING' CHECK (status IN ('UPLOADING','PROCESSING','READY','FAILED'))` | Upload/processing lifecycle, not publication approval. |
| `original_name` | `text NOT NULL` | Untrusted original filename, for staff display only. |
| `storage_bucket` | `text NOT NULL` | Private bucket/container. |
| `storage_key` | `text NOT NULL` | Generated immutable storage object key, not a public URL. |
| `detected_mime_type` | `text` | Validated MIME type. |
| `byte_size` | `bigint CHECK (byte_size IS NULL OR byte_size > 0)` | Validated original byte size. |
| `sha256` | `bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32)` | Content checksum; not a uniqueness key. |
| `width_px` | `integer CHECK (width_px IS NULL OR width_px > 0)` | Image/video width. |
| `height_px` | `integer CHECK (height_px IS NULL OR height_px > 0)` | Image/video height. |
| `duration_ms` | `bigint CHECK (duration_ms IS NULL OR duration_ms >= 0)` | Video duration. |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')` | Extractor metadata; not catalog specifications. |
| `retirement_event_id` | `uuid UNIQUE` | Catalog retirement event authorizing asset-level soft deletion. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
UNIQUE (storage_bucket, storage_key)
CHECK (status <> 'READY' OR (detected_mime_type IS NOT NULL AND byte_size IS NOT NULL AND sha256 IS NOT NULL))
CHECK (deleted_at IS NULL OR retirement_event_id IS NOT NULL)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX media_assets_library_live_idx ON media.assets (media_kind, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX media_assets_state_live_idx ON media.assets (status, created_at, id) WHERE deleted_at IS NULL;
```

READY is stable until soft deletion; regenerate variants without making attached assets non-ready. Catalog retirement is required even for an unregistered failed upload; the protocol can register an irreversible tombstone, not a fake READY registration.

#### `media.asset_variants`

Image sizes, video renditions/posters/manifests, and PDF previews.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `asset_id` | `uuid NOT NULL REFERENCES media.assets(id) ON DELETE RESTRICT` | Original asset. |
| `variant_key` | `text NOT NULL CHECK (length(btrim(variant_key)) > 0)` | Variant identifier such as image_640 or video_720p. |
| `mime_type` | `text NOT NULL` | Generated output MIME type. |
| `storage_bucket` | `text NOT NULL` | Private output bucket. |
| `storage_key` | `text NOT NULL` | Unique immutable object key. |
| `byte_size` | `bigint NOT NULL CHECK (byte_size > 0)` | Output size. |
| `width_px` | `integer CHECK (width_px IS NULL OR width_px > 0)` | Output width. |
| `height_px` | `integer CHECK (height_px IS NULL OR height_px > 0)` | Output height. |
| `duration_ms` | `bigint CHECK (duration_ms IS NULL OR duration_ms >= 0)` | Output duration. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
UNIQUE (storage_bucket, storage_key)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX asset_variant_live_uq ON media.asset_variants (asset_id, variant_key) WHERE deleted_at IS NULL;
```

Replacing a variant uses a new key and row. Old objects remain retained. Delivery checks both the asset and variant effective visibility.

#### `media.upload_sessions`

Resumable/expiring upload state.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `asset_id` | `uuid NOT NULL REFERENCES media.assets(id) ON DELETE RESTRICT` | Allocated asset. |
| `uploader_staff_id` | `uuid NOT NULL` | External Identity account ID; no cross-database FK. |
| `provider_upload_id` | `text` | Multipart/provider upload identifier. |
| `expected_byte_size` | `bigint CHECK (expected_byte_size IS NULL OR expected_byte_size > 0)` | Declared size, subject to actual validation. |
| `status` | `text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','EXPIRED','FAILED'))` | Upload state. |
| `expires_at` | `timestamptz NOT NULL` | Upload authorization expiry. |
| `completed_at` | `timestamptz` | Completion time. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
CHECK (expires_at > created_at)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX upload_open_asset_uq ON media.upload_sessions (asset_id) WHERE deleted_at IS NULL AND status = 'OPEN';
CREATE INDEX upload_expiry_idx ON media.upload_sessions (expires_at, id) WHERE deleted_at IS NULL AND status = 'OPEN';
```

#### `media.processing_jobs`

Background validation/transcoding work with retry and lease state.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `asset_id` | `uuid NOT NULL REFERENCES media.assets(id) ON DELETE RESTRICT` | Target asset. |
| `job_type` | `text NOT NULL CHECK (job_type IN ('VALIDATE','IMAGE_VARIANTS','VIDEO_TRANSCODE','PDF_PREVIEW'))` | Processing operation. |
| `status` | `text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED'))` | Current job state. |
| `attempts` | `integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)` | Attempt count, not a per-attempt history. |
| `next_attempt_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Earliest claim time. |
| `locked_until` | `timestamptz` | Worker lease expiration. |
| `lease_token` | `uuid` | Worker fencing token; completion must match current lease. |
| `last_error` | `text` | Sanitized last failure summary. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE UNIQUE INDEX processing_active_job_uq ON media.processing_jobs (asset_id, job_type) WHERE deleted_at IS NULL AND status IN ('QUEUED','RUNNING');
CREATE INDEX processing_ready_queue_idx ON media.processing_jobs (next_attempt_at, created_at, id) WHERE deleted_at IS NULL AND status = 'QUEUED';
CREATE INDEX processing_stale_lease_idx ON media.processing_jobs (locked_until, id) WHERE deleted_at IS NULL AND status = 'RUNNING';
```

### Database: golden_lift_inquiries

#### `inquiries.inquiries`

Anonymous contact and quotation requests; no customer account.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `kind` | `text NOT NULL CHECK (kind IN ('CONTACT','QUOTE'))` | Form intent. |
| `locale` | `text NOT NULL CHECK (locale IN ('ar','en','ckb'))` | Submission language. |
| `full_name` | `text NOT NULL CHECK (length(btrim(full_name)) > 0)` | Visitor name. |
| `email` | `text CHECK (email IS NULL OR length(btrim(email)) > 0)` | Contact email. |
| `phone` | `text CHECK (phone IS NULL OR length(btrim(phone)) > 0)` | Contact phone. |
| `message` | `text NOT NULL CHECK (length(btrim(message)) > 0)` | Visitor message. |
| `product_id` | `uuid` | External Catalog ID; no cross-database FK. |
| `product_name_snapshot` | `text` | Verified product name at submission. |
| `product_model_code_snapshot` | `text` | Verified code at submission, if any. |
| `status` | `text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','IN_PROGRESS','CLOSED'))` | Inbox state. |
| `idempotency_key` | `uuid NOT NULL UNIQUE` | Client request key for safe retries. |
| `request_hash` | `bytea NOT NULL CHECK (octet_length(request_hash) = 32)` | Detects reuse of idempotency key with another payload. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
CHECK (email IS NOT NULL OR phone IS NOT NULL)
CHECK ((product_id IS NULL AND product_name_snapshot IS NULL AND product_model_code_snapshot IS NULL) OR (product_id IS NOT NULL AND product_name_snapshot IS NOT NULL AND length(btrim(product_name_snapshot)) > 0))
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX inquiries_inbox_live_idx ON inquiries.inquiries (status, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX inquiries_recent_live_idx ON inquiries.inquiries (created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX inquiries_product_live_idx ON inquiries.inquiries (product_id, created_at DESC, id) WHERE deleted_at IS NULL AND product_id IS NOT NULL;
```

Snapshots are trusted values obtained by the service, not accepted blindly from the visitor. Retried requests must not recreate a soft-deleted inquiry or reveal private details.

#### `inquiries.notification_deliveries`

Durable email notification state, separate from storing the inquiry.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Stable identifier. |
| `inquiry_id` | `uuid NOT NULL REFERENCES inquiries.inquiries(id) ON DELETE RESTRICT` | Owning inquiry. |
| `notification_kind` | `text NOT NULL DEFAULT 'NEW_INQUIRY' CHECK (notification_kind = 'NEW_INQUIRY')` | First-release notification type. |
| `recipient_email` | `text` | Resolved company sales address; may wait for configuration. |
| `status` | `text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED','CANCELLED'))` | Current send state. |
| `attempts` | `integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)` | Attempt count. |
| `next_attempt_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Earliest retry time. |
| `locked_until` | `timestamptz` | Worker lease. |
| `lease_token` | `uuid` | Fencing token for completion. |
| `provider_message_id` | `text` | Provider result/reference. |
| `sent_at` | `timestamptz` | Successful delivery submission time. |
| `last_error` | `text` | Sanitized last error. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Additional relational/row constraints:

```sql
UNIQUE (inquiry_id, notification_kind)
CHECK (status NOT IN ('SENDING','SENT') OR recipient_email IS NOT NULL)
```

Additional indexes (PK/UNIQUE column constraints also create indexes):

```sql
CREATE INDEX notifications_pending_idx ON inquiries.notification_deliveries (next_attempt_at, id) WHERE deleted_at IS NULL AND status = 'PENDING';
CREATE INDEX notifications_stale_lease_idx ON inquiries.notification_deliveries (locked_until, id) WHERE deleted_at IS NULL AND status = 'SENDING';
```

One record does not guarantee exactly-once external email. Use provider idempotency where available; otherwise duplicates remain possible after uncertain send outcomes.

#### `inquiries.notification_settings`

A local, versioned projection of Catalog sales notification configuration.

| Column | SQL type / definition | Meaning |
| --- | --- | --- |
| `id` | `smallint PRIMARY KEY CHECK (id = 1)` | Singleton setting. |
| `sales_email` | `text` | Current configured company recipient. |
| `source_version` | `bigint NOT NULL CHECK (source_version > 0)` | Catalog setting version used to ignore stale events. |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Creation time; UTC instant. |
| `updated_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Last current-state change; not a history log. |
| `deleted_at` | `timestamptz` | NULL means active. Once set, the row cannot be restored or edited. |
| `version` | `bigint NOT NULL DEFAULT 1 CHECK (version > 0)` | Optimistic concurrency token; incremented by the update trigger. |

Catalog is the authority. Deactivation should set sales_email to NULL via a newer configuration event, not soft-delete this replaceable operational projection. No placeholder values are seeded.

## 13. Repeated operational tables and private gate

| Table | Important fields | Key/index | Purpose |
| --- | --- | --- | --- |
| `ops.outbox_events` in every database | id, aggregate_type/id/version, event_type, payload, available_at, published_at, attempts, locked_until, lease_token, last_error, deleted_at | PK id; live pending `(available_at, created_at, id)` | Durable delivery after local commit. |
| `ops.inbox_messages` in every database | consumer_name, message_id, processed_at | Composite PK `(consumer_name, message_id)` | Atomic deduplication with consumer effect; keys retained. |
| `catalog.write_gate` | id=1, revision, validated_revision | Singleton PK | Serialize Catalog writers and avoid repeated final-state validation. Runtime cannot write it directly. |

Outbox ordering is not globally guaranteed merely by timestamps; use aggregate versions,
consumer-side version checks and explicit per-aggregate ordering where a workflow needs it.
Inbox deduplication is not permission to replay effects after deleting its dedup key.
The final delivery/retention policy must not silently purge retained business records.

## 14. Source notes

Requirements are taken from the accepted conversation and the supplied `golden left.md`
version 1.0, particularly sections 4-9, 11, 15, 17-20 and 24-25. New engineering choices
are identified above rather than attributed to the company brochure.

The brochure's six areas are on page 2, its example cabin names on page 3, and its explicit
placeholder-contact warning on page 4. No placeholder contact details are seeded here.
No complete product taxonomy, product/media volume, actual audience or measured load was
provided; those are not invented capacity inputs.

Primary technical documentation consulted:

[1] PostgreSQL recursive WITH queries and cycle handling: https://www.postgresql.org/docs/current/queries-with.html

[2] PostgreSQL constraints, row-local CHECK restrictions, FK and uniqueness behavior: https://www.postgresql.org/docs/current/ddl-constraints.html

[3] PostgreSQL CREATE TRIGGER, including deferred constraint triggers: https://www.postgresql.org/docs/current/sql-createtrigger.html

[4] PostgreSQL transaction isolation and serialization retries: https://www.postgresql.org/docs/current/transaction-iso.html

[5] AWS Prescriptive Guidance, transactional outbox pattern: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html

[6] PostgreSQL SELECT and SKIP LOCKED semantics: https://www.postgresql.org/docs/current/sql-select.html

[7] PostgreSQL partial indexes and predicate matching: https://www.postgresql.org/docs/current/indexes-partial.html

[8] PostgreSQL multicolumn indexes: https://www.postgresql.org/docs/current/indexes-multicolumn.html

[9] PostgreSQL pg_trgm index support: https://www.postgresql.org/docs/current/pgtrgm.html

These references support PostgreSQL mechanics and reliability patterns. They do not prove
that one schema is universally best, that this SQL has been executed, or that target
latency/throughput has been achieved.
