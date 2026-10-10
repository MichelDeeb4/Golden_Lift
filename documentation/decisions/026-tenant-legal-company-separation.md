# Tenant and legal-company separation

Date: 2026-10-10. Status: Proposed. Implementation: none.

## Problem

The earlier audit treated one company as one tenant. The new ERP vision explicitly permits several legal companies in one SaaS tenant; financial ownership and SaaS isolation cannot share one identifier.

## Choice and alternatives

Recommend tenant as subscription/administration/isolation boundary; legal company as financial/statutory owner, exactly within one tenant. Branches, departments, operating units, warehouses and locations have explicit relationships, not an indiscriminate generic hierarchy. A one-company tenant remains valid. Collapsing IDs prevents correct multi-company finance/access; a universal organization tree obscures legal and stock invariants.

## Consequences

Global users have tenant memberships and explicit company scopes; tenant access is not all-company permission. Company-specific ledgers/stock/documents require company authority even within a tenant. Tenant-shared definitions need deliberate applicability. Intercompany transactions correlate separately balanced company records through an approved protocol.

## Migration impact

Review legacy tenant+company assignment and all relationship keys; no mapping inferred from names. Preserve earlier audit evidence but use this proposed hierarchy for future review. No organization tables are created. [Model](../../docs/architecture/organizational-model.md), [ownership](../../docs/architecture/data-ownership.md).
