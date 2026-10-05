# Golden Lift design system — S1

Implemented 2026-10-05. The public web shell uses architectural charcoal, metallic neutrals, warm white and selective gold. The exact requested palette, semantic roles, spacing, typography, radii, shadows, motion and z-index values are exported by `@golden-lift/tokens`. Brand gold is #C9A15B; small gold-colored text uses the darker semantic `text.gold` to meet contrast requirements on white.

## Packages and ownership

| Package | Responsibility |
| --- | --- |
| `@golden-lift/tokens` | Dependency-free palette, semantic roles, layout/typography scales and contrast calculation |
| `@golden-lift/ui` | Tamagui configuration, shared layout/typography, controls, overlays, feedback and navigation |
| `@golden-lift/icons` | One Lucide icon family through public exports |
| `@golden-lift/i18n` | Arabic, English and Sorani strings; locale/direction provider |
| `@golden-lift/api` | Typed presentation models, CatalogDataSource/MediaResolver ports, validated public HTTP adapters and query keys |
| `@golden-lift/catalog-ui` | Data-driven category/product cards, media/gallery, documents and specifications |

Import through package exports. Frontend code cannot import backend implementation files or database/platform adapters. Backend services cannot import frontend packages. Existing service/domain rules remain enforced.

Tamagui supplies the shared theme, fonts and React Native-compatible stack/text foundation. Web semantic elements, fields, dialog, video and table behavior are web presentation adapters styled centrally from the same tokens; CSS is not a second UI library. No native application or native control renderer is claimed by S1.

## Tokens and layout

`palette` contains every requested gold, champagne, bronze, silver, charcoal and light-surface entry. Components consume `colors.background`, `text`, `action`, `border` and `state`. `GLTokenStyles` maps those exports to web variables; screen CSS consumes the variables.

Spacing uses the named 4px scale. Radii run from XS=4px through 2XL=24px and pill=999px. Shadows are neutral, with no gold glow. Motion uses 120/180/240/320/450ms and the centralized calm easing. Reduced-motion media queries disable movement/animation.

The page container is 1400px maximum. Breakpoints are mobile below 768px, tablet 768–1099px and desktop from 1100px. Page padding is 16/24/40px and grid gaps 16/20/24px. Product grids show two cards on small screens and four on desktop; category/value sections adapt independently within the same container. Detailed product/gallery layouts stack on mobile.

Typography exports displayXL/displayLG, heading1–6, bodyLG/MD/SM, labelLG/MD/SM, caption, buttonLG/MD/SM, technicalValue/Label, navigation and overline. English uses Manrope with Inter for technical values. Arabic/Sorani use IBM Plex Sans Arabic with Noto Sans Arabic fallback. Seven actual font files are loaded directly; unrelated package font weights are not bundled. Font tests inspect Sorani-specific glyphs in regular and semibold IBM files and the Noto fallback.

## Component API

The component lab at `/component-lab` is the interactive reference.

| Family | Exports / representative API |
| --- | --- |
| Layout | `GLPageContainer`, `GLSection`, `GLStack`, `GLXStack`, `GLYStack`, `GLSeparator` |
| Typography | `GLText role="technicalValue"`, `GLHeading level={1} role="heading1"` |
| Buttons | `GLButton variant="primary" size="md" loading={busy}`; `GLIconButton label={translatedLabel}` |
| Fields | `GLInput`, `GLTextarea` with label/help/error/success; controlled `GLSelect`/`GLCombobox` with value/onChange/options |
| Selection/search | `GLCheckbox`, `GLRadio`, `GLSwitch`, `GLSearchField` |
| Feedback | `GLBadge`, `GLChip`, `GLAlert`, `GLToast`, `GLTooltip`, `GLSkeleton`, `GLSpinner`, `GLEmptyState` |
| Overlays | `GLModal` and `GLDrawer` with open/onClose/title |
| Navigation | `GLBreadcrumb`, `GLTabs`, `GLPagination`, `GLHeader`, `GLMobileHeader`, `GLMobileNavigationDrawer`, `GLCategoryNavigation` |
| Data/cards | `GLCard`, `GLTable`, `GLCategoryCard`, `GLProductCard`, `GLTechnicalDocumentCard` |
| Product media/specifications | `GLProductGallery`, `GLMediaImage`, `GLVideo`, `GLSpecificationList`, `GLSpecificationTable`, `GLTechnicalValue` |

Button variants: primary, secondary, dark, light, ghost, text, destructive. Visual sizes: xs=32, sm=36, md=44, lg=52, xl=60px; mobile targets are enlarged. Loading retains label geometry and disables repeated activation. Destructive controls use error red.

Fields share 48px height, spacing, borders, radius, labels and related error/help IDs. GLSelect uses a styled listbox with keyboard selection, Escape/Tab dismissal and outside-pointer dismissal. GLCombobox supports filtering and active-option keyboard navigation. Language switching uses a compact native select with branded styling.

Overlays use the browser modal dialog top layer, focus containment, Escape handling, background scroll lock and focus restoration. Tabs support arrow/Home/End navigation. Icons that indicate direction change with RTL; search/download and other universal icons do not mirror.

## Localization and accessibility

Arabic is the initial/fallback language. Locale changes update HTML `lang`/`dir`, localization, query keys and persisted preference. `en` is LTR; `ar` and `ckb` are RTL. Translation strings are centralized; demo content has separate localized data. Brand names/model codes and structured technical identifiers are data, not translated UI keys.

Use logical start/end spacing. Breadcrumbs, pagination, gallery controls, drawer position and navigation must be checked in both directions. Numbers/units use `bdi` to isolate technical values. Arabic/Sorani do not receive Latin letter spacing.

The implementation targets WCAG 2.2 AA: semantic landmarks, headings, labels, alt text, visible focus, keyboard operation, reduced motion and tested text/action contrast. This target is not a completed external accessibility certification or a substitute for testing with assistive technology across browsers.

## Data and media boundaries

Pages consume CatalogDataSource through TanStack Query. UI cards accept typed Product/Category models and generic attribute lists, not fixed elevator fields. Demo data exists only in `apps/storefront/features/catalog/demo.ts`. API mode uses the existing Gateway category list/detail and product-detail contracts; missing listing/search APIs return an explicit unsupported state.

Media components resolve a MediaReference to a short-lived capability through MediaResolver. They never build bucket/object paths or persist signed URLs. API media resolution uses B5 public authorization and exact owner context. Capability refresh obtains a fresh decision, and failures show a safe fallback. Cards/thumbnails select derivatives; document opening requires the supplied public permission. Demo illustrations/PDFs resolve only within the local `/demo` namespace.

Original architectural vector illustrations and the geometric wordmark are S1 demo assets pending approved brand photography/logo. Product specifications and documents are explicitly illustrative. Company history, certifications and contact details have not been invented.
