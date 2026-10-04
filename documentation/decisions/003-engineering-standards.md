# 003: Engineering standards and shared transaction lifecycle

Historical decision. Persistence tooling/lifecycle is superseded by [004: Prisma](004-prisma-persistence.md).

Date: 2026-10-04. Status: implemented; local checks are recorded in [architecture-validation.json](../architecture-validation.json).

The user requires engineering best practices and suitable design patterns for ongoing changes. Save this as [AGENTS.md](../../AGENTS.md), supported by an [architecture guide](../architecture.md) and service READMEs. Patterns solve demonstrated problems and retain service ownership/Clean Architecture.

Identity/Catalog duplicated connection, transaction, timeout, rollback/release and retry mechanics. Share that technical lifecycle as platform's PgTransactions. Services retain their Unit of Work ports/adapters, repositories, applicable outbox operations, isolation and safe SQL-error mapping. Catalog remains SERIALIZABLE; Identity remains READ COMMITTED. Bound retries to whole callbacks for serialization/deadlock failures, discard broken clients and keep external effects outside retries.

Narrow ordinary reads to dedicated query-reader views rather than all repository mutation methods. Preserve domain-specific repositories. Close Media/Inquiries database pools if HTTP application construction fails.

The architecture checker missed inline import types and could permit relative contract escapes. Resolve imports through TypeScript configuration, inspect inline types, enforce declared public exports and reject import-equals/dynamic CommonJS bypasses. Negative probes and an allowed contract probe verify this enforcement.

Persistence remains pg with parameterized SQL. An ORM is a separate evidence-based choice; this rule does not force a tooling replacement. No SQL schema or public API change is required. Lifecycle unit tests and existing real PostgreSQL/API/process checks verify the refactor. Earlier dated validation remains historical evidence.

