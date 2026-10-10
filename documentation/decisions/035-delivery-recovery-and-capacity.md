# 035: Delivery gates, bounded capacity and recoverable operations

Date: 2026-10-10. Status: Accepted by repository owner on 2026-10-10 for target-specification-2026-10-10-v1. Bounded product/NFR deferrals are approved in the owner register. Implementation is tracked separately by phase evidence.

## Decision

Use isolated disposable target environments, owner-approved numeric capacity/recovery objectives, bounded pools/queues, durable tenant-aware jobs, scoped objects and tested backup/restore/transfer. Phase 01 requires owner approval before Phase 02; Phase 08 is a hard foundation gate before ERP. Preserve legacy source/data until replacement acceptance and approved disposition.

## Authority and supersession

Replaces legacy phase numbering and optional hosted evidence as target completion claims. Phase reports distinguish executable design tests from real database/API/browser/worker/load/provider recovery evidence. Unknown thresholds remain null and block applicable gates.

Supersession applies to the greenfield target when this specification is approved; historical implementation provenance and existing runtime behavior remain recorded. No dated ADR text is rewritten.

## Alternatives and consequences

Invented SLOs would fabricate requirements. Old single-company tests cannot certify target isolation. A source copy is not a data backup, and local fixtures cannot certify hosted providers. Production hosting, budget, residency, retention and recovery targets remain open owner decisions.

## Verification and approval

Traceable scenarios are in [Phase 01 acceptance specification](../../docs/specifications/phase-01-acceptance.json). Runtime evidence is not available yet. Approval must identify this record and architecture version; [owner decisions](../../docs/specifications/phase-01-owner-decisions.md) lists unresolved requirements. No Phase 02 work is authorized until Phase 01 approval.
