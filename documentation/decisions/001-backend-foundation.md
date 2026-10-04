# Backend foundation decisions

Historical decision. Persistence tooling/lifecycle is superseded by [004: Prisma](004-prisma-persistence.md).

Status: implemented locally, 2026-10-03. Scope: implementation packages B1/B2.

Use npm workspaces with separately runnable NestJS 12.1.2 applications, Node.js 24.21.0, TypeScript 6.0.3, ESM and node-postgres 8.23.1. Package versions and the lockfile are committed artifacts; install with npm ci. Nest remains in presentation/composition; repositories and domain/application code do not depend on Nest. Nest's [migration guide](https://docs.nestjs.com/migration-guide) describes its ESM/Node requirements.

Use pg repositories over the reviewed PostgreSQL schema. No ORM synchronization or new migrations were introduced. Catalog transactions acquire one client, use SERIALIZABLE and retry the complete callback at most three times for 40001/40P01, with bounded backoff. Deferred COMMIT failures are mapped as safe application errors. Every repository and outbox operation inside a unit of work uses that client, following [node-postgres transaction requirements](https://node-postgres.com/features/transactions). The existing statement triggers acquire the private Catalog gate; runtime code cannot manipulate it directly.

Services own their repositories and use-case ports. Shared contracts contain transport-neutral types, errors and event envelopes; the platform package contains technical configuration, HTTP and database adapters. The architectural linter checks layer direction, direct cross-service imports, circular static imports and explicit any usage. Strict TypeScript handles unused code and unsafe types. Tests may compose multiple services for integration verification.

The gateway currently routes only implemented public category reads, serves OpenAPI and checks upstream readiness. It forwards an allowlisted trace header, with no caller-provided identity/role forwarding. Internal and staff mutation routes are absent. Category create/edit use cases require an authenticated ADMIN actor and currently run through integration tests only. B3 introduces real session verification before exposing them over HTTP.

Development service transport uses loopback HTTP, with no internal authenticated endpoints yet. B3 must provision distinct service credentials for protected Identity introspection and enforce caller/action allowlists. Production gateway upstream configuration already requires HTTPS. TLS termination, service authentication, CSRF and browser session policies are deployment/Identity gates, not implemented claims.

Event envelopes preserve aggregate versions as decimal strings and allow UUID or singleton keys. Outbox aggregate_id is populated only for UUID keys. Category changes and their events commit together. Broker publication, consumer acknowledgement, processing leases and notification delivery remain their later milestones.

The GitHub Actions workflow uses the official PostgreSQL Ubuntu repository, [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) actions. It runs build/unit/architecture checks, the existing SQL suites, service integration tests and process smoke checks. It has not been executed on a hosted runner in this workspace. Container recipes provide a service-specific runtime image; Docker execution remains unverified because Docker is unavailable here.

