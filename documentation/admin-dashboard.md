# Golden Lift Admin dashboard

Current Product creation, 2026-10-07: select a leaf category and enter an Arabic name; optional model code and English/Sorani names. Create saves an inactive draft, closes the modal, shows Product created and navigates to the editor without a reload. Specifications and Media are added later. Publication separately requires complete required values and a ready image cover. See the [fix report](implementation/fix-product-create-disabled.md) and [decision 017](decisions/017-minimal-category-product-drafts.md).

The category tree retains recursive disclosure, ancestor search, keyboard navigation, compact actions and mobile browsing. Product Type is retired from product creation/editing and navigation. The normal Catalog category cutover was applied after backup restore verification and migration rehearsal. Category schemas now supply reusable groups and unique attributes; relationship editing remains separate unfinished work. See [migration operations](operations/catalog-migration.md).

Earlier [CRUD modal](implementation/admin-crud-modal-fix-completed-work.md), [category model](implementation/catalog-model-and-ux-fix-completed-work.md) and [category tree](implementation/category-tree-completed-work.md) reports retain their dated historical scope.

Implemented route area: `apps/storefront/features/admin`, with Expo Router entrypoints under `app/admin` and `app/super-admin`. Shared frontend packages supply the design system, fonts, localization and typed API client. The public catalog demo source is never used by staff screens.

The 2026-10-07 functional integration adds API-default visitor collections/search/schema-derived filters and native local image/video/PDF processing. Staff mutations refresh both staff and visitor query caches after successful responses. Upload format/size/scanner checks come from actual B5 capabilities. See [local development](operations/local-development.md), [decision 012](decisions/012-functional-integration.md) and [completion evidence](implementation/functional-integration-completed-work.md).

## Routes and roles

| Route | Access and behavior |
| --- | --- |
| `/admin/login` | Staff login; role determines the landing page |
| `/admin` | Admin launchpad, bounded first-page catalog/Media selection and actual Media job count |
| `/admin/categories`, `/:id` | Recursive navigation, translations, image cover, move, sibling ordering, deletion preview/confirmation |
| `/admin/products`, `/new`, `/:id` | Collection filters, independent translations, leaf category placement, schema-driven attributes, ordered media, publication and soft deletion |
| `/admin/product-types`, `/:id` | Retired notice; existing links remain safe, with no Product Type creation |
| `/admin/attributes`, `/:id` | Typed definitions, numeric/text/choice constraints, translated help, options and deprecation |
| `/admin/attribute-groups`, `/:id` | Shared translated groups |
| `/admin/units`, `/:code` | Canonical units and translated metadata |
| `/admin/media`, `/:id` | Resumable upload, processing feedback, private preview, safe metadata, usage and supported lifecycle actions |
| `/admin/account` | Admin profile, current session, own password change and logout |
| `/super-admin/admins`, `/:id` | Account directory, invite, resend, disable/enable and retained deletion |
| `/super-admin/account` | Super Admin profile/session/password |
| `/admin/invitation`, `/password-reset`, `/reset-request` | Identity action flows; single-use tokens are read from a fragment and kept only in memory |

Super Admin has no Catalog/Media permission. Frontend guards hide unauthorized screens; owning use cases independently verify every request through live Identity. Disabling/deleting an account invalidates authorization. No customer, commerce, inquiry, revenue, CMS or native Admin workflow is included.

## API and persistence

Existing Identity, B4, Dynamic Catalog and B5 contracts remain authoritative. OpenAPI 0.8.0 documents Catalog routes GET `/admin/products`, GET `/:id/management`, POST `/:id/publication`, POST `/:id/media` and DELETE `/:id`. POST `/admin/products` accepts only categoryId, optional modelCode and translations with Arabic required. It always creates an inactive draft; obsolete type/schema/cover/values/publication fields are rejected. Collections are bounded and product search/filtering occurs on the server. Collections support ID keysets or exact bigint manual ordering with ID tie breaks and filter-bound opaque cursors. Cover thumbnails request private grants near the viewport; definition/group selectors can fetch further bounded pages.

`database/sql/21_catalog_product_management.sql` is the reviewed additive upgrade. `25_category_catalog_fresh.sql` composes the current fresh category-based Catalog schema; SQL 22 is the historical pre-cutover composition. It preserves existing product activation and separately filters public asset usage. No live database migration is implied by checking out the code. See [local operations](operations/admin-local.md) and [decision 009](decisions/009-admin-dashboard.md).

## Editing and Media

Arabic is required; English and Sorani are independent optional translations. There is no automatic translation. Dynamic forms use the current backend groups, order, requiredness, unit, bounds, precision and choice options. Decimal and bigint values remain strings. Existing deprecated selections remain readable; the backend rejects new deprecated use. Version/schema conflicts preserve local input, require review and never silently retry a write.

Product basics, media and publication have explicit section saves. Attaching media requires ready, registered, allowed assets. An image cover is required for publication, not initial draft creation. Detachment removes a Catalog association without retiring shared bytes. Category-derived schema revisions protect later values and reviewed configuration changes; Product Type changes are retired. Soft deletion retains records and files; restoration is not offered.

Uploads check capabilities, initiate, transfer immutable bounded parts, complete and poll processing. Resume retries use the existing server session within the current view, including a committed part whose acknowledgement was lost; navigation/reload does not persist upload capabilities or staff secrets. The reusable picker can upload or choose existing ready images/videos/PDFs. Private previews request fresh B5 capabilities near the viewport and pause refreshes offscreen. Expired grants are replaced before rendering, failed image refreshes are bounded, videos use poster/playback profiles and PDFs use raster preview or authorized original download. Metadata omits storage identities and scanner internals.

## Localization, accessibility and verification

Arabic, English and Kurdish Sorani use shared fonts and locale direction. Layout uses logical borders/padding, responsive drawer navigation, horizontal table scrolling and page scrolling. Shared controls provide keyboard interaction, labels, focus management and accessible earlier/later reorder buttons. The product collection uses `GLTable`; dialogs, fields, controls, breadcrumbs, toast and feedback reuse the shared UI package.

The [dated validation report](validation/admin-dashboard-2026-10-06T12-39-33-944Z.json) and [completion report](implementation/admin-dashboard-completed-work.md) record 149 passing tests and local acceptance. B5 real scanner/codec/broker/S3/Linux gates remain separate. Technical-sheet editors, full public collection/search integration, hosted CI/deployment, restoration and unsupported session directories remain outside the implemented Admin contracts.

## Earlier UI/UX refinement — 2026-10-06 (historical composition)

Navigation is grouped into Overview, Catalog, Media and Account; Super Admin uses Staff/Account. Page headers provide hierarchy and context. Product rows consolidate thumbnail/name/model, then category/type/status/updated context and overflow actions. Filters retain bounded server/URL state and add a clear action.

Product editors now follow Identity (type/category before model) → Content (language tabs) → Specifications (backend groups/order, two desktop columns) → Media (cover/gallery/video/PDF) → Publication. Persistent actions show each independent section's dirty state. They preserve version/schema checks, drafts, decimal/bigint strings, false/zero/unset distinctions and reviewed type-change impacts.

Category location and parent appear before translations/cover. Type group placement precedes assignments; attribute constraints hide irrelevant fields and normalize type-specific payloads. State actions follow options/schema. Media has visual tiles, compact filters and a drawer picker. Staff directory secondary actions use an overflow menu and confirmation of the captured account/version; passwords/action links remain excluded from documentation.

See the [current design guide](visitor-and-administration-design.md), [decision 010](decisions/010-ui-ux-refinement.md) and [current completion report](implementation/ui-ux-refinement-completed-work.md). No backend/API/schema changes were made in this refinement. The operational dashboard uses real Media job data; unsupported global catalog totals are not fabricated.

## Major redesign — retained workspace structure

A light 68px command bar and dark 240px sidebar frame the workspace. Products use a five-column identity/catalog-context/status/updated/actions table. The dashboard provides a primary creation action, operational links, bounded first-page product/Media selections and actual pending Media jobs. It does not advertise global counts or chronological activity that the API cannot supply.

Products use a section rail, focused canvas and read-only summary: Overview, Translations, Specifications, Media, Visibility. Hidden panels retain drafts. Identity/translations/specifications share the existing basics save; Media and publication keep explicit independent saves. Dirty indicators, required-field navigation and version/schema conflicts remain. Product deletion is confirmed from Visibility. Summary moves into a drawer below 1300px; the rail becomes horizontal on mobile.

Category navigation uses the main master/detail canvas; creation and metadata editing now use focused modals. Bounded child navigation/path, leaf constraints, sibling revision checks, reviewed moves and branch deletion remain. Configuration master lists persist beside details and reviewed schema assignments, while creation and metadata editing use overlays with permanent resource-specific Create actions. The Media library is grid-first, uploads use a drawer that retains in-memory progress when closed, and asset inspection uses a separate drawer. Filename search explicitly covers loaded assets; kind/status filtering remains server-owned. Media drag/drop and accessible earlier/later alternatives preserve global association order.

Super Admin shares the shell and uses a focused invitation section plus overflow lifecycle actions with captured-account/version confirmation. Role separation, CSRF/Origin checks, live sessions, safe capabilities and retained deletion remain unchanged. No backend, SQL or OpenAPI changes accompany this phase.

See [decision 011](decisions/011-major-visual-redesign.md) and [major redesign completion](implementation/major-redesign-completed-work.md) for current execution evidence. Earlier milestone reports remain dated historical evidence.
