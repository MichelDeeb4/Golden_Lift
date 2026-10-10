# Identity service

Staff accounts, bootstrap, invitations, sessions, password recovery and Admin lifecycle. Local port: 3001. The service connects only to its own PostgreSQL database/runtime login. Dependencies across services use API/event contracts.

| Layer | Actual example |
| --- | --- |
| Domain | [domain/staff.ts](src/domain/staff.ts) |
| Application ports | [application/ports/identity.ts](src/application/ports/identity.ts) |
| Use cases | [application/use-cases/authenticate-staff.ts](src/application/use-cases/authenticate-staff.ts) |
| Infrastructure | [infrastructure/prisma/repository.ts](src/infrastructure/prisma/repository.ts) |
| Presentation | [presentation/http/auth-controller.ts](src/presentation/http/auth-controller.ts) |
| Composition | [composition/application.ts](src/composition/application.ts) |

Staff workflows are implemented. See [Identity operations](../../documentation/operations/identity.md).

Build from the root with npm run build; start with npm start --workspace=@business-platform/identity. The entrypoint is src/composition/main.ts. Tests live under tests where applicable; domain/application do not import NestJS, Prisma, pg or other service implementations.

See [standing rules](../../AGENTS.md), [architecture/patterns](../../documentation/architecture.md) and [backend setup](../../documentation/operations/backend-local.md).

Prisma models: [schema.prisma](prisma/schema.prisma). Client factory: [client.ts](src/infrastructure/prisma/client.ts). Build generates the owning client; SQL continues to manage constraints, triggers and grants. See [Prisma decision](../../documentation/decisions/004-prisma-persistence.md).
