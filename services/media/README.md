# Media service

Media ownership with health and live staff access checks. Local port: 3003. The service connects only to its own PostgreSQL database/runtime login. Dependencies across services use API/event contracts.

| Layer | Actual example |
| --- | --- |
| Domain | [domain/staff-access.ts](src/domain/staff-access.ts) |
| Application ports | [application/ports/readiness.ts](src/application/ports/readiness.ts) |
| Use cases | [application/use-cases/check-staff-access.ts](src/application/use-cases/check-staff-access.ts) |
| Infrastructure | [infrastructure/prisma/readiness.ts](src/infrastructure/prisma/readiness.ts) |
| Presentation | [presentation/http/staff-controller.ts](src/presentation/http/staff-controller.ts) |
| Composition | [composition/main.ts](src/composition/main.ts) |

Uploads, private storage, processing/variants and controlled delivery are implemented in B5; external processing/provider acceptance remains a separate gate.

Build from the root with npm run build; start with npm start --workspace=@golden-lift/media. The entrypoint is src/composition/main.ts. Tests live under tests where applicable; domain/application do not import NestJS, Prisma, pg or other service implementations.

See [standing rules](../../AGENTS.md), [architecture/patterns](../../documentation/architecture.md) and [backend setup](../../documentation/operations/backend-local.md).

Prisma models: [schema.prisma](prisma/schema.prisma). Client factory: [client.ts](src/infrastructure/prisma/client.ts). Build generates the owning client; SQL continues to manage constraints, triggers and grants. See [Prisma decision](../../documentation/decisions/004-prisma-persistence.md).
## B5 Media core

Protected resumable uploads, private filesystem/S3 adapters, immutable sealing, Prisma-backed fenced jobs, Sharp/FFmpeg/Poppler processing adapters, mandatory ClamAV scanning, a bounded library, controlled delivery, security blocking and Catalog-coordinated retirement are implemented. Separate worker and Media/Catalog event-relay processes own asynchronous work. See [Media operations](../../documentation/operations/media.md) and [decision 007](../../documentation/decisions/007-media-core.md). Native/scanner/broker/provider acceptance is separate from implementation and remains unverified where those dependencies are unavailable.
