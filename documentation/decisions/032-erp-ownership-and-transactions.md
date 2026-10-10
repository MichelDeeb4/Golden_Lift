# 032: ERP ownership, company sharing and atomic orchestration

Date: 2026-10-10. Status: Accepted by repository owner on 2026-10-10 for target-specification-2026-10-10-v1. Bounded product/NFR deferrals are approved in the owner register. Implementation is tracked separately by phase evidence.

## Decision

Tenant is SaaS isolation; legal companies own finance and stock. Organization owns companies/branches/departments/cost centers; Inventory owns warehouses/locations. Tenant-shared product/party masters require explicit company applicability. Published domain-owned commands participate in one orchestrated tenant transaction; ledger, stock, documents, audit, idempotency and outbox commit atomically when workflow requires it.

## Authority and supersession

Incorporates ADR 026 and supersedes ADR 028's separate business database constraint for ERP. Phase 06 establishes warehouse/company contracts; Phase 10 implements stock detail. Company grants stay authoritative in the control plane and are validated against ERP Organization without cross-DB FKs.

Supersession applies to the greenfield target when this specification is approved; historical implementation provenance and existing runtime behavior remain recorded. No dated ADR text is rewritten.

## Alternatives and consequences

Company-equals-tenant prevents legitimate multi-company tenants. Universal organization trees obscure financial and stock ownership. Cross-module repository writes violate encapsulation; asynchronous ledger/stock updates cannot satisfy required atomicity. Exact money, immutable posts and compensating reversals are mandatory; valuation/jurisdiction policies need owner values.

## Verification and approval

Traceable scenarios are in [Phase 01 acceptance specification](../../docs/specifications/phase-01-acceptance.json). Runtime evidence is not available yet. Approval must identify this record and architecture version; [owner decisions](../../docs/specifications/phase-01-owner-decisions.md) lists unresolved requirements. No Phase 02 work is authorized until Phase 01 approval.
