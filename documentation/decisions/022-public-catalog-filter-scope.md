# 022 — Authoritative public filter scope and shared visitor composition

Date: 2026-10-10.

Problem: exact Category predicates and exact-scope Attribute validation cannot serve parent browsing; singleton CHOICE and missing totals make visitor controls/pagination incomplete. Fixed editorial rows tie presentation to a small fixture rather than Catalog data.

Options considered: browser descendant/value filtering; separate parent endpoints; one owning-service typed collection. Choose the existing Catalog collection. Resolve descendant leaves inside its Prisma read transaction and reuse the resolved set for result, facet and policy predicates. Keep numeric SQL and boolean predicates, expand CHOICE to OR option IDs, batch filter eligibility, and count the matching result set before pagination. This avoids duplicate endpoints and frontend Catalog policy.

Migration impact: no schema or business data migration. Add categoryId as the canonical query parameter and optionIds as the canonical CHOICE input. Preserve strict legacy category/optionId aliases at the boundary and normalize immediately; reject conflicting forms. Add total and optional localized Group context to existing DTOs. Gateway OpenAPI and shared client remain aligned.

Presentation chooses existing container, drawer, pagination, cards and media authorization. Extend catalog UI with reusable ratio grids and Category hero, and shared API filter state with canonical serialization/cache identity. Replace fixed first-card spans and giant featured sections. History uses route push, filters reset page, pagination retains them, and errors remain errors.

Tradeoffs: bounded page projections still read effective schemas per Product; this task removes browser per-filter option requests and batches policy validation, without inventing an unrelated bulk repository before measured demand. Group specifications assign a deduplicated Attribute to its first ordered effective placement. Provider-generated media URLs remain authorized per reference and are refreshed by the existing resolver.

Verification: real PostgreSQL scope/typed fixture regression, real Admin publication/value/move APIs, anonymous visitor filter/URL/history/pagination tests, all six viewport widths and Arabic/Sorani checks, plus reviewed visual baselines. Updated fixture tests describe the new twelve-item paging/shared grids; old historical validation remains dated.
