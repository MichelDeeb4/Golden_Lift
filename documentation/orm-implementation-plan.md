# Prisma implementation plan

Requested and implemented 2026-10-04. Prisma is the user's selected ORM. Validation results are recorded in [orm-validation.json](orm-validation.json).

1. Save durable engineering rules and Prisma selection in [AGENTS.md](../AGENTS.md); record [decision 004](decisions/004-prisma-persistence.md).
2. Pin stable Prisma 7.10.0 and its PostgreSQL adapter. Define one schema/client per owning service with all 59 tables and existing database-local relationships. Ignore the private Catalog gate.
3. Implement generated model reads/writes through service-owned repository ports and Prisma interactive units of work. Keep outbox operations in the same transaction. Preserve service isolation, versions, generated fields, soft deletion and staff authorization.
4. Preserve exact timestamp cursors, locks and server-timed atomic token checks through reviewed parameterized Prisma SQL. Share bounded retry/error inspection; disconnect each client and pool on shutdown.
5. Add schema/catalog parity checks, precision/retention/permission integrations and generated-client build/CI/container support. Run strict build/type/format/architecture checks, PostgreSQL integrations and both five-service process checks.
6. Update service guides and operating documentation, preserve historical evidence, and confirm disposable fixtures are removed.

This package adopts Prisma for existing persistence. Category moves/order/deletion, Media processing, products, Inquiries workflows and application interfaces retain their separate milestones in the [backend plan](backend-implementation-plan.md).

