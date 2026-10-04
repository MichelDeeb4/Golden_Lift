# Gateway service

Stateless HTTP entrypoint, port 3000. It has no database or internal introspection credential. It exposes implemented public/staff routes and OpenAPI; owning services validate sessions and business roles. Internal endpoints are absent from routing.

| Layer | Actual example |
| --- | --- |
| Application ports | [staff-proxy.ts](src/application/ports/staff-proxy.ts) |
| HTTP infrastructure | [staff-proxy.ts](src/infrastructure/http/staff-proxy.ts) |
| Presentation | [staff-controller.ts](src/presentation/http/staff-controller.ts) |
| Composition | [application.ts](src/composition/application.ts) |

The gateway has no artificial business domain. Build from the root with npm run build and start with npm start --workspace=@golden-lift/gateway. The entrypoint is src/composition/main.ts. Service integration/process tests exercise the actual gateway.

The saved contract is [openapi.json](../../documentation/api/openapi.json). After edits run npm run api:sync and npm run format. An integration check compares the saved/runtime contracts. Retain allowlisted headers/routes, safe failures, request limits and trace IDs.

See [standing rules](../../AGENTS.md), [architecture/patterns](../../documentation/architecture.md) and [backend setup](../../documentation/operations/backend-local.md).

