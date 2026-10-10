# Tenant isolation and storage direction

Date: 2026-10-10. Status: Proposed. Implementation: none.

## Problem

Current service databases contain global single-company data. The ERP target needs tenant isolation, several companies per tenant and optional dedicated storage without losing service ownership or pooled-connection safety.

## Alternatives and recommendation

Recommend shared tables with explicit tenant ownership and RLS inside each existing owning-service database. Enforce company ownership/permissions separately and use tenant/company-safe relationships. Table-per-tenant multiplies DDL/query variants; schema-per-tenant multiplies provisioning/migration/search_path state. Dedicated databases offer stronger credential separation at greater pool/operations cost and remain optional for demonstrated requirements.

## Consequences

Trusted scope must reach every UoW/root reader/raw query, event/job/cache and byte path. Use transaction-local context on the same Prisma transaction connection. Runtime non-owner/NOBYPASSRLS roles, reviewed views/definers/grants and composite keys are required. RLS cannot contain a compromised shared application that may choose context. Versioned per-service storage assignments/pools can route dedicated tenants later.

## Migration impact

Approve ownership manifest, expand/backfill/validate/switch, test real restricted credentials with two tenants/two companies and retain compatibility/evidence until proven safe to contract. No tenant activation before gates. [Detailed design and tests](../../docs/architecture/multi-tenancy.md), [storage transition](../../docs/architecture/target-architecture.md).
