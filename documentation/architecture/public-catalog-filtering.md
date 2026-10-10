# Public catalog filtering

Updated 2026-10-10. Catalog owns classification and descendant resolution. A Product belongs to one leaf Category; no Product Type participates in visitor filtering.

## Scope and policy

GET /api/v1/products accepts categoryId; category is a retained compatibility alias and combining both is invalid. A leaf scopes exact Category equality. A parent resolves its active descendant leaves through the owning Catalog database. Results, facet discovery and filter applicability use that same resolved scope. Global browsing omits the Category predicate. Pending/deleted owners and unavailable/private/security-blocked cover assets remain unavailable.

Filter identity is definitionId and stable option IDs. Different Attributes use AND. CHOICE optionIds use OR within one Attribute, for both single-selection and multiselection Product values. Legacy optionId inputs normalize to one option. Empty/duplicate/foreign/deprecated option IDs and duplicate Attribute filters are rejected. NUMBER bounds stay decimal strings and PostgreSQL compares numeric values; equal bounds provide exact matching. BOOLEAN includes false. TEXT is available only when the real definition and effective Category policy explicitly allow public filtering. Policy reads are batched, not one network request per Attribute/option.

Facets are the deduplicated union of public/filterable Attributes across eligible Products in scoped leaves, independent of current search/value filters. Labels localize without changing filter identity; controls sort by localized label with stable ID tie-breaking. Specifications deduplicate Attributes and present each under its first ordered effective Group; membership in multiple Groups does not duplicate stored values or visitor controls.

## State and pagination

packages/api exports CatalogFilterState, normalizeCatalogFilterState, parseCatalogFilterState and serializeCatalogFilterState. Public routes and TanStack keys share canonical filter and option ordering. URL state persists Category, search, sort, page and typed filters. Changes push history entries, reset page to one and preserve unrelated filters where applicable. Category changes clear prior Attribute scope. Pagination preserves filters; the default page size is twelve. Collection total counts the same matching published Products before pagination and hasNextPage remains explicit.

API errors render retryable error states and never become zero matches or demo data. Invalid URL filters are explained and clearable. Explicit demo mode remains an isolated development fixture, never an API failure fallback. Category controls lazily browse hierarchy through existing paginated Category reads; the frontend does not resolve descendant Product predicates.

## Presentation and performance

Existing shared UI container, headings, breadcrumbs, drawer, pagination and media authorization are retained. Catalog UI owns BPCategoryHero, BPCategoryGrid, BPProductGrid and BPGroupedSpecifications. Category and Product card media use 4:3 frames, card variants and lazy loading. Home shows six roots in three/two/one columns and four selected Products; listings use a filter rail or mobile drawer, active chips and an accessible count. Detail retains the unified gallery, Group specifications, full-width mobile documents and shared related Product grid.

Collection reads return one bounded page with facets and localized card data; no browser-side Product filtering or per-option HTTP requests. Existing per-Product schema/projection queries remain bounded by page size; future database batching should be driven by measured load rather than speculative repositories. Public read transactions preserve consistency between page, facets and total.

## Compatibility and verification

No schema/data migration is required. Singleton choice and category query aliases remain documented inputs. The switched UI has one filter serializer and removes fixed editorial/featured card layouts. Verify parent/leaf fixtures, OR/AND, decimal precision, false, privacy, totals, publication/value/move integration, URL refresh/history, responsive grids and RTL through real PostgreSQL/HTTP/browser fixtures.
