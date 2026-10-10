# 031: Hybrid storage, RLS and routing fences

Date: 2026-10-10. Status: Accepted by repository owner on 2026-10-10 for target-specification-2026-10-10-v1. Bounded product/NFR deferrals are approved in the owner register. Implementation is tracked separately by phase evidence.

## Decision

Use a physical control-plane database distinct from ERP databases, a canonical ERP schema in pooled and dedicated storage, tenant/company-safe keys, restricted roles, FORCE RLS and explicit WITH CHECK. Live authenticated admission precedes authoritative storage resolution. Per-tenant local gates and monotonic routing generations fence commits and workers. Use controlled write freeze with durable reconciliation for initial pooled-to-dedicated transfers.

## Authority and supersession

Refines target tenancy; replaces ADR 025 optional later dedicated storage and per-service RLS proposal. Dedicated isolation retains tenant_id and a private expected-tenant guard. No client controls storage assignment. Registry/ERP changes are separate commits; recovery reconciles durable receipts.

Supersession applies to the greenfield target when this specification is approved; historical implementation provenance and existing runtime behavior remain recorded. No dated ADR text is rewritten.

## Alternatives and consequences

Pooled-only or dedicated-only violates approved hybrid direction. Schema/table-per-tenant causes business lineage forks. Unfenced cache invalidation alone cannot stop already-admitted writers. Freeze simplifies consistent transfer; zero-downtime replay/CDC remains a later evidenced scope change. RLS does not contain compromise of a shared context-setting credential.

## Verification and approval

Traceable scenarios are in [Phase 01 acceptance specification](../../docs/specifications/phase-01-acceptance.json). Runtime evidence is not available yet. Approval must identify this record and architecture version; [owner decisions](../../docs/specifications/phase-01-owner-decisions.md) lists unresolved requirements. No Phase 02 work is authorized until Phase 01 approval.
