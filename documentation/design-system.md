# Business Platform design system

Relationship selectors use labeled native checkboxes, bounded search/pagination, ordered selections and keyboard Earlier/Later alternatives. Shared focused dialogs provide dirty-close review and captured-version impact confirmation. Existing BPFilterToolbar, BPPagination, semantic action menus, gold Save/Create, red destructive/close controls, RTL logical layout and reduced motion remain. Video thumbnails include a play icon and VIDEO badge. Current validation belongs to the [final phase report](implementation/final-catalog-admin-visitor-completed-work.md).

Implemented 2026-10-05. The public web shell uses architectural charcoal, metallic neutrals, warm white and selective gold. The exact requested palette, semantic roles, spacing, typography, radii, shadows, motion and z-index values are exported by `@business-platform/tokens`. Brand gold is #C9A15B; small gold-colored text uses the darker semantic `text.gold` to meet contrast requirements on white.

## Packages and ownership

| Package | Responsibility |
| --- | --- |
| `@business-platform/tokens` | Dependency-free palette, semantic roles, layout/typography scales and contrast calculation |
| `@business-platform/ui` | Tamagui configuration, shared layout/typography, controls, overlays, feedback and navigation |
| `@business-platform/icons` | One Lucide icon family through public exports |
| `@business-platform/i18n` | Arabic, English and Sorani strings; locale/direction provider |
| `@business-platform/api` | Typed presentation models, CatalogDataSource/MediaResolver ports, validated public HTTP adapters and query keys |
| `@business-platform/catalog-ui` | Data-driven category/product cards, media/gallery, documents and specifications |

Import through package exports. Frontend code cannot import backend implementation files or database/platform adapters. Backend services cannot import frontend packages. Existing service/domain rules remain enforced.

Tamagui supplies the shared theme, fonts and React Native-compatible stack/text foundation. Web semantic elements, fields, dialog, video and table behavior are web presentation adapters styled centrally from the same tokens; CSS is not a second UI library. No native application or native control renderer is claimed by S1.

## Tokens and layout

`palette` contains every requested gold, champagne, bronze, silver, charcoal and light-surface entry. Components consume `colors.background`, `text`, `action`, `border` and `state`. `BPTokenStyles` maps those exports to web variables; screen CSS consumes the variables.

Spacing uses the named 4px scale. Radii run from XS=4px through 2XL=24px and pill=999px. Shadows are neutral, with no gold glow. Motion uses 120/180/240/320/450ms and the centralized calm easing. Reduced-motion media queries disable movement/animation.

The page container is 1400px maximum. Breakpoints are mobile below 768px, tablet 768–1099px and desktop from 1100px. Page padding is 16/24/40px and grid gaps 16/20/24px. Product grids show two cards on small screens and four on desktop; category/value sections adapt independently within the same container. Detailed product/gallery layouts stack on mobile.

Typography exports displayXL/displayLG, heading1–6, bodyLG/MD/SM, labelLG/MD/SM, caption, buttonLG/MD/SM, technicalValue/Label, navigation and overline. English uses Manrope with Inter for technical values. Arabic/Sorani use IBM Plex Sans Arabic with Noto Sans Arabic fallback. Seven actual font files are loaded directly; unrelated package font weights are not bundled. Font tests inspect Sorani-specific glyphs in regular and semibold IBM files and the Noto fallback.

## Component API

The component lab at `/component-lab` is the interactive reference.

| Family | Exports / representative API |
| --- | --- |
| Layout | `BPPageContainer`, `BPSection`, `BPStack`, `BPXStack`, `BPYStack`, `BPSeparator` |
| Typography | `BPText role="technicalValue"`, `BPHeading level={1} role="heading1"` |
| Buttons | `BPButton variant="primary" size="md" loading={busy}`; `BPIconButton label={translatedLabel}` |
| Fields | `BPInput`, `BPTextarea` with label/help/error/success; controlled `BPSelect`/`BPCombobox` with value/onChange/options |
| Selection/search | `BPCheckbox`, `BPRadio`, `BPSwitch`, `BPSearchField` |
| Feedback | `BPBadge`, `BPChip`, `BPAlert`, `BPToast`, `BPTooltip`, `BPSkeleton`, `BPSpinner`, `BPEmptyState` |
| Overlays | `BPModal` and `BPDrawer` with open/onClose/title |
| Navigation | `BPBreadcrumb`, `BPTabs`, `BPPagination`, `BPHeader`, `BPMobileHeader`, `BPMobileNavigationDrawer`, `BPCategoryNavigation` |
| Data/cards | `BPCard`, `BPTable`, `BPCategoryCard`, `BPProductCard`, `BPTechnicalDocumentCard` |
| Product media/specifications | `BPProductGallery`, `BPMediaImage`, `BPVideo`, `BPSpecificationList`, `BPSpecificationTable`, `BPTechnicalValue` |

Button variants: primary, secondary, dark, light, ghost, text, destructive. Visual sizes: xs=32, sm=36, md=44, lg=52, xl=60px; mobile targets are enlarged. Loading retains label geometry and disables repeated activation. Destructive controls use error red.

Fields share 48px height, spacing, borders, radius, labels and related error/help IDs. BPSelect uses a styled listbox with keyboard selection, Escape/Tab dismissal and outside-pointer dismissal. BPCombobox supports filtering and active-option keyboard navigation. Language switching uses a compact native select with branded styling.

Overlays use the browser modal dialog top layer, focus containment, Escape handling, background scroll lock and focus restoration. Tabs support arrow/Home/End navigation. Icons that indicate direction change with RTL; search/download and other universal icons do not mirror.

## Localization and accessibility

Arabic is the initial/fallback language. Locale changes update HTML `lang`/`dir`, localization, query keys and persisted preference. `en` is LTR; `ar` and `ckb` are RTL. Translation strings are centralized; demo content has separate localized data. Brand names/model codes and structured technical identifiers are data, not translated UI keys.

Use logical start/end spacing. Breadcrumbs, pagination, gallery controls, drawer position and navigation must be checked in both directions. Numbers/units use `bdi` to isolate technical values. Arabic/Sorani do not receive Latin letter spacing.

The implementation targets WCAG 2.2 AA: semantic landmarks, headings, labels, alt text, visible focus, keyboard operation, reduced motion and tested text/action contrast. This target is not a completed external accessibility certification or a substitute for testing with assistive technology across browsers.

## Data and media boundaries

Pages consume CatalogDataSource through TanStack Query. UI cards accept typed Product/Category models and generic attribute lists, not fixed elevator fields. Demo data exists only in `apps/storefront/features/catalog/demo.ts`. API mode uses the existing Gateway category list/detail and product-detail contracts; missing listing/search APIs return an explicit unsupported state.

Media components resolve a MediaReference to a short-lived capability through MediaResolver. They never build bucket/object paths or persist signed URLs. API media resolution uses B5 public authorization and exact owner context. Capability refresh obtains a fresh decision, and failures show a safe fallback. Cards/thumbnails select derivatives; document opening requires the supplied public permission. Demo illustrations/PDFs resolve only within the local `/demo` namespace.

Original architectural vector illustrations and the geometric wordmark are S1 demo assets pending approved brand photography/logo. Product specifications and documents are explicitly illustrative. Company history, certifications and contact details have not been invented.

## Earlier UI/UX refinement — 2026-10-06 (historical composition)

The palette and token architecture remain unchanged. Composition now provides a 45/55 desktop hero, an editorial category grid with a larger first item, image-led product cards, subtle technical dividers and an asymmetrical engineering statement. Mobile product detail puts the gallery first; mobile collection filters use a drawer. Public spacing remains generous while staff forms use compact sections and two-column grids.

New shared exports are `BPPageHeader` (breadcrumbs, title, context and actions), `BPFormSection` (associated section heading), `BPActionBar` (persistent section actions) and `BPActionMenu` (secondary actions). The action group focuses its first enabled control, dismisses on outside interaction and restores its trigger on Escape. Shared overlays accept an optional `className` to preserve screen density through portals. `BPTabs` supports unique ID prefixes and uses non-submit buttons inside forms.

Translation tabs keep hidden panels mounted and retain independent drafts. Arabic errors reopen the required Arabic panel. Arabic/Sorani fields retain RTL direction regardless of interface language. Dynamic fields follow backend group/order, with multiline text full width and short fields in two desktop columns. Tables emphasize primary identity, secondary model metadata and restrained context; the product collection uses viewport-triggered cover thumbnails and secondary action overflow.

See [decision 010](decisions/010-ui-ux-refinement.md), the [current design guide](visitor-and-administration-design.md) and [refinement evidence](implementation/ui-ux-refinement-completed-work.md). Earlier S1 evidence remains historical.

## Major visual redesign — current composition

The palette, seven font assets and token ownership remain unchanged. Public composition uses an edge-bleeding 40/60 hero, indexed category mosaic, one featured system with supporting products, large minimally framed cards and a 60/40 product gallery/information split with a numbered dossier. Desktop display headings opt into `BPHeading fluid` so page CSS can set responsive editorial sizes without Tamagui atomic font-size precedence. Semantic heading levels and locale font inheritance remain.

Staff uses a light 68px command bar, dark 240px sidebar and focused light canvas. New shared exports `BPWorkspace` and `BPWorkspacePanel` provide associated navigation/region IDs, a controlled section rail and read-only inspector. Hidden panels remain mounted. At <1300px the inspector becomes a drawer; at <1100px the sidebar becomes a drawer; at <768px the rail scrolls horizontally. App-specific density/layout CSS stays in `features/admin/workspace.css`.

Shared overlays accept opt-in `keepMounted`, used by the upload drawer to retain transfer state while closed. Closed dialogs stay hidden. Gallery arrows work from keyboard/fullscreen in either direction without stealing native video/input keys; touch and earlier/later controls remain. Reduced motion also disables image hover transforms. New composition reuses existing controls, query caching, bounded pagination and private derivative grants; no new visual dependency is introduced.

See [decision 011](decisions/011-major-visual-redesign.md), [illustrated guide](visitor-and-administration-design.md) and [current completion report](implementation/major-redesign-completed-work.md). Screenshot baselines update only after separate visual review; their equality does not measure design quality.

## Admin interaction controls — 2026-10-08

Use the exported BPActionMenu for a single 40px row trigger. Supply explicit icon metadata independent of translated labels; items expose menu/menuitem semantics, Arrow keys/Home/End/Escape, focus restoration and direction-aware positioning. Destructive items appear last with a divider.

BPButton primary uses existing gold tokens for creation/saving; secondary/ghost are neutral management; success and warning use existing success/warning tokens for Enable and Disable/Deprecate; destructive uses existing error tokens. Pair text with the existing Lucide icon exports. BPCloseButton is a labeled 40px red X with soft-red hover/pressed and shared keyboard focus styles. All shared overlays and toast dismissals use it.

BPFilterToolbar takes a label and count of intermediate fields (search and Clear are separate columns): desktop uses a wider search column and compact controls, tablet two columns, mobile one. Compose only supported filters. Existing BPDataPagination retains its inline desktop row-size control and mobile wrapping.

BPConfirmDialog composes named entity/impact feedback with neutral Cancel and an explicit semantic confirmation. BPUnsavedChangesDialog makes Close/Escape equivalent to Stay. Its staff provider owns asynchronous continuation; it cannot approve mutations or bypass captured API preconditions. See [decision 019](decisions/019-admin-actions-dialogs-filters.md).


## Public catalog composition — 2026-10-10

Public categories and Products use shared 4:3 media frames independent of source dimensions. Category cards separate image and caption; Home roots use three columns on desktop, two on tablet and one on mobile. Products use four columns on wide full-width sections, three on desktop and two on tablet; listings respect the remaining space beside a 280px filter rail and reduce to one column with a drawer below 768px. Existing spacing/color/typography tokens remain authoritative. Fixed editorial first-card spans and giant single featured Products are retired.

Category detail uses a contextual split hero with one H1, description and Catalog CTA. Product detail retains one gallery with ratio-based contained images, localized Group specifications and contextual contact/documents/Category continuation. Filters use real Attribute metadata, stable identity, active removable chips and a polite result count. Errors and empty results have distinct actions. Logical properties, visible keyboard focus and existing reduced-motion behavior apply in all locales.


## Admin interface refinement — 2026-10-10

Control dimensions now come from the shared controls tokens: buttons 32/40/44px, icons 16/18/20px, icon targets 40px, table headers 44px and ordinary rows 52px minimum. Normal and loading buttons always apply the same flex label; icon centering and an 8px gap are shared. Primary, secondary, neutral, success, warning, destructive and ghost variants retain explicit semantics. Required markers leave the field label unchanged; native required semantics remain. Search inputs expose searchbox semantics, an aligned adornment and an optional labeled clear action.

Admin shell/collection/form/Media ownership is consolidated in styles.css; workspace.css owns section editors and the dashboard. Category tree CSS retains recursive navigation-specific behavior. A 240px dark sidebar, 68px desktop command bar, 112px two-row mobile command bar, light surfaces and shared headers replace conflicting page selectors. Collections use controlled horizontal table scrolling, compact status chips and existing pagination; document scrolling remains the normal page behavior. Media tiles use a consistent 4:3 preview and contained images with visible type/status and accessible overflow.

Mobile navigation, editor summaries and pickers reuse existing drawers; modal focus, red close buttons, dirty prompts and action-menu focus restoration remain shared. Logical spacing preserves Arabic/Sorani direction. No duplicate component library or data migration was introduced. See [decision 023](decisions/023-admin-interface-consistency.md) and the [verification report](implementation/admin-ui-redesign-completed-work.md).
