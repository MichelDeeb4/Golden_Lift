# Golden Lift — Major visual redesign completed work

Date: 2026-10-06. Scope: visitor website, Admin and Super Admin presentation/experience rebuild. See the [baseline audit](major-redesign-baseline.md), [decision 011](../decisions/011-major-visual-redesign.md) and [illustrated guide](../visitor-and-administration-design.md).

## Golden Lift Major Redesign Status

The public page structure and staff workspace structure have been rebuilt. Final acceptance and execution evidence are recorded at the end of this report. Earlier refinement and backend milestone reports remain historical evidence.

## Baseline problems identified

- Small framed hero and repeated equal-card sections did not establish an architectural product identity.
- Product cards gave too much weight to chrome; product detail felt like a conventional small split with tabs.
- Staff editors remained long stacks of white form sections. Navigation and secondary actions lacked hierarchy.
- Category/configuration editing used a primary modal, losing collection context. Media placed upload work ahead of browsing.
- Responsive styling retained old small-card assumptions, and shared atomic heading sizes restricted editorial composition.

## Public redesign

- **Header:** integrated 84px brand/navigation/locale/search row, reduced 64px scroll state, prominent Categories navigation. Below 1100px, navigation uses the menu drawer; mobile uses a 64px command row plus a 36px locale row. The demo notice remains separate.
- **Homepage:** immersive 780px desktop hero with 40/60 content/image composition and edge-bleeding architectural imagery; indexed collection mosaic with one tall/two stacked panels; one large featured system with three supporting products; numbered engineering principles; conditional resources.
- **Category:** large cover and editorial title, breadcrumbs and introductions; child-category/product invariant remains. Image panels use readable dark captions.
- **Listing:** oversized heading and restrained filter toolbar; three columns from 1100px, four only from 1800px, two on tablet and one on mobile. URL/history, bounded pagination, clear filters and honest unsupported/error states remain.
- **Product card:** dominant derivative image, quiet category/model information, a stronger name, up to two generic technical highlights and a small detail affordance. No decorative card wrapper.
- **Product detail:** 60/40 gallery/information layout, vertical desktop thumbnail rail, fullscreen/keyboard/touch interactions and numbered technical dossier. Mobile imagery comes first. Specification rows retain contract order; videos, documents and related products appear only when available.
- **Footer:** large brand statement, collection/company links and locale with a quieter divider hierarchy.

## Admin redesign

- **Shell:** 240px charcoal sidebar, 68px light command bar, grouped navigation and focused light content canvas. Logical placement follows RTL.
- **Dashboard:** one prominent product-creation action, operational links, actual bounded first-page product/Media selections and pending Media job count. Page selections are explicitly labeled; global totals and chronological activity are not invented.
- **Product list:** five columns for thumbnail/name/model identity, consolidated catalog context, state, updated time and overflow actions. Filters wrap without compressing selected labels. Row header identity retains normal case and stronger type; column headers remain restrained technical labels.
- **Product editor:** section rail / focused canvas / read-only summary. Overview, Translations, Specifications, Media and Visibility stay mounted while hidden. Draft indicators and persistent explicit actions retain the existing basics, Media and publication save boundaries. Validation selects the appropriate section; conflicts preserve input. Confirmed product deletion is in Visibility.
- **Category workspace:** bounded recursive master navigation and path beside inline editing; location precedes translations/cover. Move, sibling ordering and branch-deletion reviews retain their existing preconditions. A saved selection has a read-only overview.
- **Media library:** grid-first derivative browsing, clearly scoped loaded-page filename search, server kind/status filters, upload drawer and private asset-inspector drawer. Closing/reopening upload preserves a resumable transfer in memory. Gallery drag/drop and accessible earlier/later actions retain the global association order. Detachment retains shared bytes.
- **Product types/attributes:** persistent bounded master lists beside inline creation/details. Identity, translations, relevant constraints, group placement, assignments, options, impact review and lifecycle state remain actual Catalog workflows. Groups and units use the same composition.
- **Super Admin:** shared shell with Staff/Account permissions, focused invitation section, readable identity directory and overflow lifecycle actions followed by captured-account/version confirmation.

## Major structural differences from old UI

| Before | After |
| --- | --- |
| Framed hero and repeated product cards | Full-width immersive hero, collection mosaic and one featured system |
| Small generic detail split | Large gallery with thumbnail rail and numbered technical dossier |
| Long product form | Controlled five-section workspace with independent mounted drafts and summary |
| Modal-first category/configuration editing | Inline master/detail canvas with context retained |
| Upload-led Media page | Grid-first library with upload and inspection drawers |
| Dark command bar / light sidebar | Light command bar / charcoal sidebar |

## Shared components changed

`GLWorkspace` and `GLWorkspacePanel` are public exports of the existing UI package. They provide controlled section navigation, associated region IDs and a responsive read-only inspector. `GLHeading fluid` allows semantic headings to inherit locale typography while using responsive composition sizes. Overlays accept opt-in `keepMounted`; closed native dialogs remain hidden. Existing page headers, fields, selects, language tabs, action bars, overflow actions and feedback are reused.

Public category/product cards use semantic articles and rebuilt composition. Gallery keyboard arrows respect locale direction and do not steal native video/input keys. Reduced motion disables image hover transforms. No visual library or new dependency was added.

## RTL

Arabic/Sorani preserve shared fonts, logical sidebar/rail/inspector placement, direction-aware gallery controls and independent translation-field direction. Codes and technical values remain directionally isolated. English, Arabic and Sorani staff editors and public mobile/tablet RTL are captured and exercised.

## Responsive

Public tablet navigation uses the drawer; mobile imagery and forms stack. Staff summary becomes a drawer below 1300px; the sidebar becomes a drawer below 1100px; the section rail scrolls horizontally below 768px. Master lists become bounded scroll areas on mobile. Wide tables retain horizontal scrolling. Browser checks verify page scrolling and absence of document overflow at supported viewports.

## Accessibility

Verified behavior includes labeled controls and regions, semantic headings/row headers, visible keyboard focus, select/tab interaction, gallery/fullscreen keyboard navigation, modal/drawer focus containment/restoration, menu Escape handling, mobile section access and accessible alternatives to drag/drop. Frontend unit checks cover token contrast and Sorani font glyphs. WCAG 2.2 AA remains a target; full assistive-technology/cross-browser certification is not claimed.

## Performance

Existing lazy private previews, derivative profiles, capability refresh, query caching and bounded pagination remain. No new dependency or heavy animation library. Final uncompressed export: **4,830,059 bytes of JavaScript** (4.83 MB decimal) and **47,942 bytes across four CSS bundles**. Expo rounds the JS bundle to 4.8 MB, as it did in the historical refinement export; no precise growth percentage is claimed. These are bundle sizes, not device/network performance benchmarks. Screenshot evidence is documentation and is not part of the runtime asset bundle.

## Backend changes

**None** for this redesign: service code, SQL, contracts and OpenAPI are unchanged. Existing uncommitted startup/local-operation work and the earlier refinement are retained separately. No staff accounts or normal local database configuration were reset.

## Screenshots reviewed

Before captures were preserved before editing. After captures were written into a separate review directory before regression baselines changed. Review assessed composition, task hierarchy, imagery, responsive/RTL behavior and readability, rather than treating screenshot equality as design quality.

| Screen | Before | After |
| --- | --- | --- |
| Homepage | [Desktop](../assets/major-redesign/before/home-1440.png) | [Desktop](../assets/major-redesign/after/home-1440.png), [mobile](../assets/major-redesign/after/home-390-viewport.png) |
| Category | [Desktop](../assets/major-redesign/before/category-1440.png) | [Desktop](../assets/major-redesign/after/category-1440.png) |
| Listing | [Desktop](../assets/major-redesign/before/listing-1440.png) | [Desktop](../assets/major-redesign/after/listing-1440.png), [mobile](../assets/major-redesign/after/listing-390.png) |
| Product detail | [Desktop](../assets/major-redesign/before/product-1440.png) | [Desktop](../assets/major-redesign/after/product-1440.png), [mobile](../assets/major-redesign/after/product-390-viewport.png) |
| Dashboard | [Previous](../assets/major-redesign/before/admin-dashboard.png) | [Launchpad](../assets/major-redesign/after/admin-dashboard.png) |
| Product list | [Previous](../assets/major-redesign/before/admin-product-list.png) | [Current](../assets/major-redesign/after/admin-product-list.png) |
| Product editor | [Long form](../assets/major-redesign/before/admin-product-editor.png) | [Overview](../assets/major-redesign/after/admin-product-overview.png), [Media](../assets/major-redesign/after/admin-product-media.png), [tablet](../assets/major-redesign/after/admin-product-editor-tablet.png), [mobile summary](../assets/major-redesign/after/admin-product-summary-mobile.png) |
| Category editor | [Modal](../assets/major-redesign/before/admin-category-editor.png) | [Inline canvas](../assets/major-redesign/after/admin-category-editor.png) |
| Media library | [Previous](../assets/major-redesign/before/admin-media-library.png) | [Grid](../assets/major-redesign/after/admin-media-library.png), [upload](../assets/major-redesign/after/admin-upload-drawer.png), [inspector](../assets/major-redesign/after/admin-asset-inspector.png) |
| Configuration and staff | Baseline code/design audit | [Type creation](../assets/major-redesign/after/admin-type-editor.png), [attribute creation](../assets/major-redesign/after/admin-attribute-editor.png), [Super Admin](../assets/major-redesign/after/super-admin-staff.png) |

Review corrections addressed atomic heading-size precedence, mobile locale overlap, mosaic geometry, obsolete mobile card assumptions, row-header styling, selected filter-label wrapping, tablet navigation and destructive-action placement. Intentional baselines were updated only after review, followed by a separate comparison run without updates.

## Tests executed

Commands and exact final status belong to the dated validation evidence. The verification scope includes `npm.cmd run check` (build/types/format/architecture/Prisma/backend unit), `npm.cmd run test:frontend`, `npm.cmd run storefront:build`, `npm.cmd run test:storefront`, `npm.cmd run test:admin` with the disposable PostgreSQL profile, and `git diff --check`.

Staff browser fixtures exercise real owning services and Gateway HTTP against isolated PostgreSQL databases. Assertions retain role separation, authorization, stale-version/schema review, precision, uploads, Media playback/PDF delivery, association/order/detachment, publication, category moves/deletion, choice drafts and invitation/account lifecycle. Added interactions cover section draft retention, upload drawer resume after closing, actual drag/drop with earlier/later alternatives, summary focus restoration and fullscreen gallery arrows.

Initial failures were old Media-card locators, an ambiguous category heading, and a transient preview 404 caused by rebuilding the export during a review run. Locators and composition were corrected without removing business assertions; subsequent browser runs use a completed export. The initial restricted `tsx` launch could not read Windows account information; the authorized frontend command was rerun outside that restriction.

## Actual results

**58 passing tests**: 36 backend unit, 7 frontend unit, 10 staff browser and 5 visitor browser. Final browser reports contain zero failed, skipped or flaky tests. **24 visual comparisons** passed without baseline updates: 17 staff and 7 visitor. Build, types, format, architecture (201 source files and 14 enforcement probes), four Prisma schemas and diff checks passed. [Dated validation evidence](../validation/major-redesign-2026-10-06T15-36-16-989Z.json).

## Known limitations

- Default visitor content remains explicitly labeled demo content. Full public collection/search/filter API integration is deferred; unsupported API mode is honest.
- No contract field for separate short description, public specification group labels, global dashboard totals or chronological global activity. Only supported data is shown.
- Basics, Media and publication save independently. Media order is global across kinds. These are existing backend constraints, not a new atomic save/order API.
- Architectural imagery remains the existing vector assets pending approved photography/brand assets. Company facts and contact information are not invented.
- Local staff fixtures use test-only scanner/processing adapters and mail capture. They do not establish production SMTP/scanner/codec/broker/S3/Linux acceptance.
- No hosted CI/deployment, fresh full PostgreSQL integration-suite run, external accessibility audit or device performance benchmark is claimed.

## Acceptance

**PASS — final local implementation acceptance.** Separate visual review preceded baseline updates, then all 24 comparisons passed without updates. Acceptance covers the implemented presentation scope and preserved workflows subject to the limitations above; no user/external design sign-off is claimed.

The task-owned disposable PostgreSQL cluster was stopped and removed after fixture cleanup. The normal project was restarted with `npm.cmd start`: the website on port 8081 and all five service readiness endpoints on ports 3000–3004 returned HTTP 200. Existing local staff accounts and configuration were retained.
