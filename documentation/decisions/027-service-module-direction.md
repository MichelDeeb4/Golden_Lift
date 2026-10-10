# Service and module direction

Date: 2026-10-10. Status: Accepted for preserving current boundaries. Future ERP placement: Proposed, unimplemented.

## Problem and evidence

There are five HTTP services and four owning databases, with enforced Clean Architecture and working API/event coordination. Future ERP breadth does not demonstrate a need for a service per module or a monolith conversion.

## Decision and alternatives

Retain Identity, Catalog, Media, Inquiries and stateless Gateway in Phase 01. Existing standing rules support this constraint. Prefer cohesive future modules within a small approved coarse service arrangement; extract only on measured scaling/team/security needs. A modular monolith could simplify operations but needs explicit approval and a data/auth/integration migration. Immediate service-per-module increases distributed transactions and operations without evidence.

## Consequences and migration impact

No merge/split/deletion/new service occurs. Catalog remains content authority, not stock/finance. Organization/access and future business owners require explicit contracts and placement approval. Keep current local transactions/outbox and avoid cross-service repositories/DB reads. [Comparison](../../docs/architecture/target-architecture.md), [module map](../../docs/architecture/module-boundaries.md).
