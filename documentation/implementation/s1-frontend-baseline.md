# S1 frontend baseline

Audit date: 2026-10-05. Read root AGENTS.md, project progress, architecture and B5 completed-work report before implementation. No nested AGENTS.md or frontend workspace was found.

## Existing foundation

The repository uses npm workspaces and package-lock.json, Node 24, strict TypeScript, five backend services and service-owned Prisma clients. There is no apps directory, Expo, React Native Web, Tamagui, shared frontend API client or approved logo/image collection. Existing contracts and platform packages belong to the backend and are preserved.

Gateway exposes OpenAPI and public category list/detail routes under `/api/v1`. Category requests accept `locale=ar|en|ckb`; Arabic is the existing fallback. Lists use parentId and an opaque cursor. A narrow public product-detail API exists, but a public product list/search/filter API is not available. B5 media authorization uses an asset/profile/action and exact owner context; storage keys must never appear in frontend models.

## S1 implementation direction

Add `apps/storefront` using Expo Router, React Native Web and Tamagui. Add only populated shared packages: tokens, ui, icons, i18n, api and catalog-ui. Keep frontend type/build configuration separate from Node backend compilation while checking ownership of both. Do not create an Admin application or mobile applications.

Use a typed CatalogDataSource boundary, TanStack Query for server state, a real category adapter and isolated demo product/category content for a runnable visual preview. API mode requires an explicitly configured public Gateway origin and never silently substitutes demo data after a network failure. The implemented configuration selects either demo or API mode; it does not mix ownership implicitly. The component lab documents controls and responsive/RTL states. React Hook Form and Zod serve validated search/filter forms; no server state store is added.

Use original architectural vector illustrations as clearly documented demo visuals and a typographic Golden Lift wordmark pending approved brand assets. Do not invent company history, contact details, certifications or product claims. Load actual Manrope, Inter and IBM Plex Sans Arabic/Noto Sans Arabic font assets; check Sorani glyph coverage.

## Compatibility and boundaries

Preserve B1–B5 files and behavior. No database migration is needed. The existing product API cannot provide the complete S1 listing/media/document experience; demo models fill that visual scope until S4. S1 is a client-visible shell, not production readiness or verification of B5 cloud/scanner/broker acceptance.

References: [Expo installation](https://docs.expo.dev/router/installation/), [Expo SDK compatibility](https://docs.expo.dev/versions/latest/), [Tamagui configuration](https://tamagui.dev/docs/core/configuration). Actual installed package versions and checks will be recorded in the dated S1 validation report.
