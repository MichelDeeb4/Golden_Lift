# 030: Greenfield target and legacy authority

Date: 2026-10-10. Status: Accepted by repository owner on 2026-10-10 for target-specification-2026-10-10-v1. Bounded product/NFR deferrals are approved in the owner register. Implementation is tracked separately by phase evidence.

## Decision

The approved plan replaces the five-service ERP direction with a NestJS modular monolith and separately deployable SaaS control plane. Both pooled and dedicated tenancy are mandatory from the foundation; the web target is Next.js. Canonical ADRs remain here. The master prompt governs execution and Phase 06 warehouse ownership contracts. Earlier root AGENTS.md rules were explicitly revoked by the owner in this session.

## Authority and supersession

ADR 001 service topology, 002 legacy password/session identity, 004 unconditional service-specific Prisma adoption, 008 Expo web target, 025 per-service pooled-first storage, 027 service retention, 028 separate business databases and 029 legacy auth placement are superseded for the target through this record and ADRs 031–035. ADR 026 tenant/company distinction is incorporated and refined by ADR 032. ADRs 005–023 describe legacy Catalog/UI/deletion behavior and are historical reuse evidence, not ERP target invariants. ADR 024 neutral platform naming remains applicable. ADR 003's layer intent remains useful; its revoked standing rules and old checker scope do not govern target boundaries.

Supersession applies to the greenfield target when this specification is approved; historical implementation provenance and existing runtime behavior remain recorded. No dated ADR text is rewritten.

## Alternatives and consequences

Retaining existing coarse services or adding one service per ERP module would conflict with the owner-selected atomic core. Replacing old databases directly risks valuable data. Build clean target applications and disposable databases, preserve source/data evidence, and remove obsolete components only after acceptance and approved data disposition.

## Verification and approval

Traceable scenarios are in [Phase 01 acceptance specification](../../docs/specifications/phase-01-acceptance.json). Runtime evidence is not available yet. Approval must identify this record and architecture version; [owner decisions](../../docs/specifications/phase-01-owner-decisions.md) lists unresolved requirements. No Phase 02 work is authorized until Phase 01 approval.
