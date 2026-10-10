# 034: Conditional Prisma proof and canonical schema fleet

Date: 2026-10-10. Status: Accepted by repository owner on 2026-10-10 for target-specification-2026-10-10-v1. Bounded product/NFR deferrals are approved in the owner register. Implementation is tracked separately by phase evidence.

## Decision

Reviewed SQL owns ERP constraints, RLS, grants and one checksum-versioned migration stream in both modes. Control-plane migrations are separate. Prisma is a candidate behind focused ports, accepted only after actual role/transaction/PID/context/retry/reuse/pool/routing/migration proof in Phase 03. If proof fails, document a reviewed SQL/node-postgres alternative with evidence before adoption.

## Authority and supersession

Replaces ADR 004's unconditional target tooling obligation. No runtime db push, owner credentials, schema synchronization or tenant-specific migrations. Fleet workflow observes failures/drift and quarantines incompatible assignments; backups/application compatibility govern recovery rather than destructive automatic down migrations.

Supersession applies to the greenfield target when this specification is approved; historical implementation provenance and existing runtime behavior remain recorded. No dated ADR text is rewritten.

## Alternatives and consequences

ORM convenience does not prove RLS or connection safety. Selecting a replacement without proof would be speculation. The owner already permits an evidenced ORM alternative; weakening hybrid tenancy or isolation would require separate owner-approved architecture change. Version/pool/provider details must be measured on pinned selected tooling.

## Verification and approval

Traceable scenarios are in [Phase 01 acceptance specification](../../docs/specifications/phase-01-acceptance.json). Runtime evidence is not available yet. Approval must identify this record and architecture version; [owner decisions](../../docs/specifications/phase-01-owner-decisions.md) lists unresolved requirements. No Phase 02 work is authorized until Phase 01 approval.
