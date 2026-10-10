# Database ownership and integration boundaries

Date: 2026-10-10. Status: Accepted. Existing constraint reaffirmed; no new persistence implementation.

## Problem

Adding tenant scope must not collapse the current four owning databases or encourage cross-service table/repository access. Target shared PostgreSQL tables can otherwise be misread as one shared business database.

## Decision and alternatives

Identity, Catalog, Media and Inquiries retain separate owning databases, schemas/clients and runtime credentials. Gateway has no business DB. Use public API/event contracts and owning-service repository/UoW ports. Reviewed SQL owns constraints/grants/triggers/migrations; Prisma interactive transactions implement persistence. Direct cross-service DB access offers convenient joins but breaks ownership, authorization and deployment safety. Shared platform stays technical infrastructure.

## Consequences

Every service commits local business changes/outbox together. Projections and idempotent coordination bridge owners; no cross-service ACID assumption. Global/tenant/company scope and storage routing cannot bypass this rule. Dedicated tenant storage preserves separate service authority and private credentials.

## Migration impact

No database/client/schema history changes here. Future scoped contracts/projections must switch together with proven parity and recovery. [Dependencies](../../docs/architecture/dependency-map.md), [data ownership](../../docs/architecture/data-ownership.md).
