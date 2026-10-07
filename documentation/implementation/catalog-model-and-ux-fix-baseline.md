# Golden Lift Catalog model and UX baseline

Date: 2026-10-07. Baseline commit: `80a8a6c`, plus the completed, uncommitted Admin CRUD modal phase. Those changes and dated evidence are retained. Root `AGENTS.md` is the only repository instruction file found.

## Existing model and ownership

Catalog owns classification, categories, product metadata, typed specification values and Media associations. Media owns bytes, processing and delivery; Identity owns staff sessions/roles. Gateway is stateless. Application ports, constructor composition, Prisma interactive Serializable transactions, reviewed SQL/deferred guards and transactional outbox are existing foundations.

`product_types`, `product_type_groups` and `product_type_specifications` currently determine applicability. A product has both `category_id` and `product_type_id`. Categories determine browsing placement and prohibit live children together with live products. `category_specifications` is retained historical eligibility and closed to configuration writes after the dynamic cutover; it is not a usable new schema authority.

Groups are reusable labels, but group placements and attribute memberships belong to a type. A type/attribute has at most one live assignment, optionally attached to one type-group placement. There is no standalone Group ↔ Attribute relationship and no Category ↔ Group relationship. The same attribute cannot currently appear in two groups of the same type.

Typed values already use `product_specification_values` with NUMBER/BOOLEAN columns and TEXT/CHOICE child tables. The live product/definition uniqueness constraint already enforces one value per product/attribute. Exact numeric(20,6), bigint/string versions, options, unit identity and retained soft deletion must remain. Product values must not move into arbitrary JSON or be recreated during migration.

## Runtime coupling to replace

Type authority appears in shared Product/form/public DTOs; value validation and schema evolution; configuration/product repository ports; Prisma type/schema/impact/public query adapters; product create/edit/type-change and placement workflows; deferred SQL integrity/disclosure views; controllers and Gateway allowlists; staff schemas/filters/navigation/creation/editor; public projections/filter query and product-type labels; migration and fixture scripts; unit/integration/browser tests and OpenAPI.

Public policy currently combines definition disclosure with assignment disclosure. Requiredness and search/filter/comparison flags belong to assignments. Migration must preserve these effective policies, not just copy attribute IDs. Technical-sheet bounds, historical semantic locks, explicit PDF permissions and shared asset retention must remain independent.

Current product creation requires a ready image and all required values even for inactive records. The requested Category-only Create & Continue flow requires a coherent inactive-draft policy: creation can precede cover/specification completion, while publication must continue to enforce complete required values and a verified image cover.

## Current UX

The preceding modal phase supplies permanent Create actions, focused metadata overlays, dirty-close protection, captured versions, signed impact confirmation, scoped TanStack refresh and client routing. Staff source and browser document-marker checks already prohibit ordinary hard reload/redirect refresh. These behaviors must be preserved.

Attributes use a full-width table with type/unit/visibility and a row menu. Other configuration resources still use compact master/detail layouts; metadata and lifecycle actions also appear in selected detail. Group membership multi-selects and usage views do not exist. Product Type remains in staff navigation, product filters/create/editor and public product information.

Category navigation currently loads a bounded sibling page with path navigation rather than rendering independently expandable recursive nodes. Create defaults to the selected valid parent but is not a distinct always-visible Add Subcategory command. Category detail counts products/children, with no group-assignment eligibility or group-impact blocking explanation.

The shared gallery already accepts image/video media and uses poster derivatives, keyboard arrows, touch gestures and fullscreen. Video thumbnails lack a play/badge distinction, and product detail repeats videos in a separate section. Related products use an unscoped collection. Breadcrumbs include only the direct category; Back to Category, authoritative previous/next neighbors and nearby-category browsing are missing.

## Read-only normal-database inventory

Observed at `2026-10-07T13:13:30.051Z` against the owning Catalog runtime role in a Repeatable Read, read-only transaction:

| Record collection | Count |
| --- | --- |
| Product types, total/live | 1 / 1 |
| Live products | 1 |
| Typed values, total/live | 0 / 0 |
| Live type-attribute assignments | 1 |
| Live reusable groups | 1 |

Type `metal` (`031fdf46-a016-478f-a0ad-081c86fc4b2d`) is used in leaf category `2121c45d-19a0-4a05-85b2-482827a96ebd`. No category with multiple live types was observed.

The only assignment, `623d6ec1-6c52-497e-b370-9371462c878f`, assigns `length` (`6388346a-dd98-4d55-923c-08bc030c1f75`) without a group. Existing group `Dimensions` (`3ff8719a-264f-4cb7-bf80-ed9e6419ab54`) is placed on that type as `4a9d786e-654c-4c46-b877-4bd524eec84f`. Guessing a group would violate the requested migration rule.

The user explicitly resolved this ambiguity on 2026-10-07: **assign length to the existing Dimensions group**. Preserve order `1024`, optional requiredness, public assignment permission and disabled search/filter/comparison flags. Preserve definition-level disclosure separately. Raw inventory stays in ignored `.local/catalog-classification-inventory.json`; it contains no connection credentials.

## Migration risks and required verification

New inventory/mapping validation must reject categories with conflicting legacy schemas, reusable groups with conflicting member/policy/order definitions, unresolved ungrouped attributes, invalid leaf placement and changes since reviewed mapping. The existing simple normal-data mapping is not permission to guess for other databases.

An additive migration and reviewed backfill must precede the authority switch. Retain old type/configuration records as retired migration evidence until dependency retirement is demonstrated; do not drop typed values, Media, translations, technical evidence or account records. SQL must replace old applicability/disclosure checks coherently and keep deferred final-state validation, owner-only migration privileges, schema revisions and concurrent-write protection.

Verify on disposable fresh/upgraded PostgreSQL databases: value identity/content parity, ambiguous mapping refusal, shared attribute deduplication, membership removal retention, leaf/group invariant, requiredness/privacy/precision, stale tokens, category-change impact, role/Origin/CSRF, real HTTP CRUD and reload persistence. Then run build/types/format/architecture/Prisma, affected unit/integration/process/browser suites, responsive/RTL/focus/tree/gallery/navigation assertions and separate reviewed screenshot comparisons. Existing dated reports are historical, not results for this phase.
