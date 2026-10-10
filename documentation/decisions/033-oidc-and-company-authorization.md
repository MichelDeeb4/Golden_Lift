# 033: OIDC identity and company authorization

Date: 2026-10-10. Status: Accepted by repository owner on 2026-10-10 for target-specification-2026-10-10-v1. Bounded product/NFR deferrals are approved in the owner register. Implementation is tracked separately by phase evidence.

## Decision

Use OIDC Authorization Code with PKCE via Next.js BFF, secure host-only sessions, live tenant/company membership and deny-by-default permissions. Platform administration does not grant ERP content access. Privileged operations require MFA/step-up and durable audit. Missing control-plane authority denies new admission; local fences protect transfer and routing changes.

## Authority and supersession

Supersedes ADR 002's custom password/session identity as target and refines ADR 029. Existing safe CSRF/Origin and least-privilege principles remain useful. Phase 04 must use real restricted internal admission or closed tests before Phase 05; no exposed unauthenticated or mock authorization.

Supersession applies to the greenfield target when this specification is approved; historical implementation provenance and existing runtime behavior remain recorded. No dated ADR text is rewritten.

## Alternatives and consequences

Identity-provider token claims alone cannot prove current membership. Browser tenant headers and broad cookie Domain are unsafe authority. Zero-window cross-database revocation is not claimed; bounded previously admitted transactions may finish except fenced operations. Provider, MFA assurance, session deadlines and support consent remain owner decisions.

## Verification and approval

Traceable scenarios are in [Phase 01 acceptance specification](../../docs/specifications/phase-01-acceptance.json). Runtime evidence is not available yet. Approval must identify this record and architecture version; [owner decisions](../../docs/specifications/phase-01-owner-decisions.md) lists unresolved requirements. No Phase 02 work is authorized until Phase 01 approval.
