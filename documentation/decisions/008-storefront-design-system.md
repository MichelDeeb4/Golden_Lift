# 008 — S1 shared frontend and client-visible catalog shell

Date: 2026-10-05. Scope: public web shell and shared design foundation.

The repository had no frontend. Add one npm workspace at apps/storefront with Expo Router, React Native Web and Tamagui, preserving backend service/database ownership. Frontend typechecking uses Expo's bundler configuration; backend NodeNext compilation stays separate. The root architecture checker covers TSX/apps and rejects frontend/backend implementation imports. No empty Admin/mobile packages are introduced.

Tamagui centralizes themes, tokens, fonts and shared stack/text primitives. Semantic DOM elements and browser controls/dialogs are web adapters rather than a second component framework. This keeps keyboard/focus/table/media behavior explicit for this phase; native renderers remain outside S1. The same public model/component concepts can be reused without claiming tested mobile applications.

CatalogDataSource and MediaResolver are narrow presentation ports. TanStack Query owns fetched state. APICatalogDataSource validates untrusted public responses, preserves exact technical value strings and centralizes timeout/cancellation/error mapping. DemoCatalogDataSource is isolated and clearly labeled. API mode never falls back to demo after a failure. Current category and narrow product-detail contracts are usable; absent listing/search/editor APIs are deferred instead of inventing server endpoints.

React Hook Form and Zod validate local search drafts; no Zustand is necessary for the demonstrated UI state. Lucide is the single icon family. Extra animation infrastructure is not used by screens; the pinned Reanimated/worklets packages are Expo Router dependencies/support, not a separate animation design system.

The initial web output is a single-page application, supporting unknown future product/category IDs without static-generation assumptions. This trades initial bundle/SEO efficiency for a straightforward client review and API transition. Production deployment, SSR and bundle optimization remain explicit later work. Original vector illustrations provide deterministic, licensed-by-project demo visuals without representing photographs or approved product imagery.

Arabic is the fallback; locale-specific queries and fresh media authorization prevent cross-locale/stale-capability state reuse. Browser dialogs handle focus trapping/restore; logical CSS and direction-aware controls support RTL. Contrast and actual font glyph coverage are checked, rather than inferred from brand colors/font names.

Validation combines existing backend checks, frontend unit/HTTP tests, actual development/production browser checks and versioned Windows screenshots. Older B5 reports remain historical and are not presented as newly run database/cloud checks.
