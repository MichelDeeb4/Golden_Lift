# S1 completed work

Recorded 2026-10-05. [Dated validation evidence](validation/s1-2026-10-05T15-26-43-536Z.json) contains installed versions, source/screenshot hashes, command-log hashes and export sizes. B1–B5 historical reports remain separate.

## S1 Status

Implemented and locally verified. This is the shared design system and client-visible website shell; production readiness is not claimed.

## Implemented

Six populated shared frontend packages, a responsive storefront, component lab, original demonstration assets, automated verification and operating documentation. No database migration, commit, push or deployment was performed.

## Frontend architecture

`apps/storefront` uses Expo Router, React Native Web and Tamagui. Shared packages are `tokens`, `ui`, `icons`, `i18n`, `api` and `catalog-ui`, consumed through public exports. Typed catalog/media ports separate presentation from data sources. TanStack Query handles remote state; React Hook Form and Zod validate search. Ownership checks cover backend and frontend without weakening existing service rules.

## Design tokens

Central palette and semantic colors, typography roles, spacing, radii, neutral shadows, motion, z-index and responsive layout tokens. Fonts are Manrope/Inter for English and IBM Plex Sans Arabic with Noto Sans Arabic fallback for Arabic/Sorani. Seven actual font files are loaded. See [design system](design-system.md).

## Components

Layout and typography; seven button variants and five sizes; icon buttons; inputs, textarea, select, combobox, checkbox, radio, switch and search; alerts, badges, chips, toasts, tooltips, skeletons and empty states; modal/drawer; header, mobile navigation, breadcrumbs, tabs and pagination; cards/table; category/product cards, gallery, specifications, technical values, document card and video component. The component lab shows states and interactive behavior. Current DOM controls target web; native applications remain deferred.

## Pages

Homepage, categories/index/detail, product listing/detail, search results, informational About/Contact, branded unknown-route/error states and `/component-lab`. The Contact page does not fabricate contact details or introduce a submission workflow.

## Languages

Arabic default/fallback, English and Kurdish Sorani. Language selection persists locally and updates document language/direction and query keys. RTL navigation, gallery controls, breadcrumbs and technical-value isolation are implemented; actual Sorani glyphs were inspected.

## Real APIs used

Implemented adapters target existing Gateway category list/detail, public product detail and B5 public media authorization with exact owner context. API mode requires an explicit origin and reports failures without falling back to fixtures. Actual HTTP adapter verification used an isolated localhost fixture; a live owning-service API session was not run during S1. Public category covers and product listing/search/filter are unavailable in current contracts.

## Demo fixture areas

Dedicated localized category/product fixtures, five illustrative products with generic attributes, six original architectural SVGs and an explicitly labeled demo PDF. Default demo mode is visibly identified. Approved photographs/logo, company facts and contact content are pending. No commerce or customer-account scope was introduced.

## Tests executed

- `npm.cmd run check`: backend builds, strict backend/frontend types, formatting, architecture and ORM checks, existing backend unit tests.
- `npm.cmd run test:frontend`: contrast, glyphs, demo invariants, safe origins/URLs/query keys and actual local HTTP adapter behavior.
- `npm.cmd run storefront:build`: Expo web export.
- `npm.cmd run test:storefront`: Edge interactions and four visual comparisons, final run without updating baselines.
- `node scripts/s1-dev-smoke.mjs`: real Expo development compilation and Arabic homepage/component-lab smoke, plus Arabic/Sorani review captures.
- Final formatting check and `git diff --check`.

## Actual results

36 backend unit tests, five frontend unit tests and five browser tests passed. Architecture checked 174 source files and 14 enforcement probes; four Prisma schemas validated. The export succeeded. Development pages loaded without uncaught page errors. This evidence does not claim newly executed B5 database/process integration, hosted CI or production-provider acceptance.

## Visual QA

Reviewed English desktop and Arabic mobile homepages, Arabic desktop category/product pages, Sorani desktop homepage and Sorani tablet product page. Automated checks exercised locale persistence, mobile RTL drawer, custom-select keyboard operation, modal focus containment/Escape/restoration, gallery/fullscreen/tabs, pagination, search URL/history/reset and overflow at 390/768/1440/1920px.

The review corrected document title/file-type layout. Full-page comparison capture waits for lazy images to load, preventing incomplete off-screen image baselines. Four versioned Windows/Edge screenshots passed the subsequent comparison. Review captures are under `.local/s1-screenshots`; comparisons are under `tests/frontend.browser.test.ts-snapshots`.

## Known limitations

Live product list/search/filter integration and category cover identity need API work. The export uses SPA rendering; SSR/SEO, route splitting, deployment caching/security and performance budgets remain deployment work. Export measurements are recorded, but no Lighthouse score is claimed. No Firefox/Safari or complete assistive-technology audit was performed. Demo content does not establish production video/cloud media delivery. B5 external-provider gates remain open.

## Deferred to S2

Product-management backend work.

## Deferred to S3

Full Admin dashboard.

## Deferred to S4

Replace remaining fixture data with real product APIs.

## Acceptance gate

**PASS for local S1 design-system and client-visible shell scope.** Production and live-provider acceptance are outside this result.

Run `npm.cmd run storefront:dev`, then open `http://localhost:8081` or `http://localhost:8081/component-lab`. See [frontend operations](operations/frontend-local.md) for API configuration, build and verification instructions.
