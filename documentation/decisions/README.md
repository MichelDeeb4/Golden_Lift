# Canonical architecture decision index

This is the sole ADR numbering authority. Records 001–029 describe the legacy implementation or earlier proposals. The dated records remain intact; [030](030-greenfield-target-authority.md) maps their target supersession. The user-selected plan.md architecture governs desired topology.

| ADR                                          | Target decision                                             | Status                   |
| -------------------------------------------- | ----------------------------------------------------------- | ------------------------ |
| [030](030-greenfield-target-authority.md)    | Greenfield target and legacy authority                      | Proposed detail approval |
| [031](031-hybrid-isolation-routing.md)       | Hybrid storage, RLS and routing fences                      | Proposed detail approval |
| [032](032-erp-ownership-and-transactions.md) | ERP ownership, company sharing and atomic orchestration     | Proposed detail approval |
| [033](033-oidc-and-company-authorization.md) | OIDC identity and company authorization                     | Proposed detail approval |
| [034](034-persistence-and-schema-fleet.md)   | Conditional Prisma proof and canonical schema fleet         | Proposed detail approval |
| [035](035-delivery-recovery-and-capacity.md) | Delivery gates, bounded capacity and recoverable operations | Proposed detail approval |

001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023, 024, 025, 026, 027, 028, 029: existing historical sequence; filenames are preserved. See [legacy baseline index](../../docs/architecture/adr/README.md) for the previous topic mapping.

[Phase 01 report](../../docs/implementation/phases/phase-01.md) distinguishes authorized target direction, proposed mechanics and owner sign-off.

## Preserved legacy records

- [001: Backend foundation decisions
  ](001-backend-foundation.md)
- [002: 002: Staff Identity and live service authorization
  ](002-identity.md)
- [003: 003: Engineering standards and shared transaction lifecycle
  ](003-engineering-standards.md)
- [004: 004: Prisma persistence behind service-owned ports
  ](004-prisma-persistence.md)
- [005: 005: Category navigation and branch concurrency
  ](005-category-administration.md)
- [006: 006: Dynamic Catalog Core
  ](006-dynamic-catalog-core.md)
- [007: 007 — Private Media lifecycle and Catalog coordination](007-media-core.md)
- [008: 008 — S1 shared frontend and client-visible catalog shell](008-storefront-design-system.md)
- [009: 009: Catalog administration through existing service boundaries](009-admin-dashboard.md)
- [010: 010 — Shared composition and workflow-oriented editors](010-ui-ux-refinement.md)
- [011: 011 — Editorial public composition and section-based staff workspaces](011-major-visual-redesign.md)
- [012: Decision 012 — Live catalog integration and native local Media](012-functional-integration.md)
- [013: 013 — Independent choice-option drafts](013-choice-option-drafts.md)
- [014: 014 — Focused Admin CRUD modals and scoped cache refresh](014-admin-crud-modals.md)
- [015: 015 — Leaf categories own product specification schemas](015-category-driven-catalog.md)
- [016: 016 — Persistent category tree workspace](016-category-tree-workspace.md)
- [017: 017 — Minimal category-based product drafts](017-minimal-category-product-drafts.md)
- [018: 018 — Admin collection scrolling and pagination](018-admin-scroll-and-pagination.md)
- [019: 019 — Shared Admin actions, dialogs and filter composition](019-admin-actions-dialogs-filters.md)
- [020: 020 — Category relationships and reviewed product placement](020-final-category-relationships.md)
- [021: 021 — Permanent deletion of explicitly owned data](021-permanent-owned-data-deletion.md)
- [022: 022 — Authoritative public filter scope and shared visitor composition](022-public-catalog-filter-scope.md)
- [023: 023 — Admin interface consistency](023-admin-interface-consistency.md)
- [024: Neutral platform identity](024-neutral-platform-identity.md)
- [025: Tenant isolation and storage direction](025-tenant-isolation-storage.md)
- [026: Tenant and legal-company separation](026-tenant-legal-company-separation.md)
- [027: Service and module direction](027-service-module-direction.md)
- [028: Database ownership and integration boundaries](028-database-ownership-integration.md)
- [029: Security and authorization foundations](029-security-authorization-foundations.md)
