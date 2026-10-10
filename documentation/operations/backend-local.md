# Backend local development

The B1/B2 foundation, B3 Identity and B4 category administration are implemented: five independent processes, runtime-only PostgreSQL connections, public category reads, staff authentication/Admin-account management, editor navigation, branch moves, root/nested ordering and confirmed branch deletion. See the [Identity operating guide](identity.md) for bootstrap, sessions, invitations, recovery and configuration. See the [Catalog operating guide](catalog.md) for B4 preconditions, preview/confirmation and disposable testing. Media/product/inquiry workflows and application interfaces follow the [implementation plan](../backend-implementation-plan.md).

## Install and run

Use Node.js 24.21.0 in the 24.x line. From the repository root, install locked dependencies:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
npm.cmd ci --ignore-scripts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action auth:setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action dev
```

After source edits, rebuild and restart the dev command. Keep the dev command running. Ctrl+C stops its five child processes. Local service configuration reads only its own runtime URL from the ignored .local/database.env, or the corresponding environment override. The gateway has no database connection. No backend command runs schema synchronization or privileged migrations.

| Process   | Local address         |
| --------- | --------------------- |
| Gateway   | http://127.0.0.1:3000 |
| Identity  | http://127.0.0.1:3001 |
| Catalog   | http://127.0.0.1:3002 |
| Media     | http://127.0.0.1:3003 |
| Inquiries | http://127.0.0.1:3004 |

Start just one service with npm run dev -- catalog, or use npm start --workspace=@business-platform/catalog after building. Each service checks its runtime role, database and owning schema before listening. Production requires an explicit runtime URL and never falls back to local credentials. Configuration failures log safe field names rather than connection strings.

## Available HTTP endpoints

- GET /health/live: process liveness.
- GET /health/ready: database readiness on services, upstream readiness on the gateway.
- GET /api/v1/categories: root categories by default; optional parentId, locale, limit and cursor.
- GET /api/v1/categories/{id}: active category with optional locale.
- GET /api/v1/openapi.json: gateway contract document, also stored in [openapi.json](../api/openapi.json).

Category endpoints exist on Catalog and the gateway. Responses use decimal-string versions/order keys, field-level Arabic fallback and no-store caching. Pagination cursors bind the parent and locale; reuse them with the same query scope. Pages reflect current data without a snapshot guarantee if categories are edited between reads. Unknown filters and malformed parameters are rejected.

The initial public category response contains category text/navigation fields. Covers/products need later milestones. B3/B4 expose protected category reads/create/edit/move/reorder/preview/delete under /api/v1/admin/categories as documented in the [Catalog guide](catalog.md), plus Identity staff routes in the [Identity guide](identity.md). Caller-supplied role headers never authenticate a request. Browser origins come from ALLOWED_ORIGINS; development defaults to the STAFF_APP_URL origin, or http://127.0.0.1:8082. Production needs explicit allowed origins. Internal introspection is absent from gateway routing.

## Validation

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action test:integration
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action smoke
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action smoke:identity
```

Check runs builds, strict typechecking, architectural lint and unit tests. Integration tests use runtime credentials for business operations in uniquely named disposable databases for all four owning services. Existing local operator credentials provision the test databases, apply the unchanged SQL/grants and remove only those databases afterwards. Tests verify commit/outbox atomicity, rollback, deferred validation, version conflicts, parent versions, localization and real two-connection serialization retry. HTTP checks cover gateway routing, pagination, redaction, role-header rejection, soft deletion and dependency failures.

Smoke checks start the five actual entrypoints on temporary loopback ports, exercise health/public/OpenAPI routing, then stop them. They establish that public Catalog reads survive an Identity outage while gateway readiness reports unavailable. The additional smoke:identity command exercises the actual operator CLI, private local mail, staff activation/login and service authorization with disposable Identity/Catalog databases. Test fixtures do not add products/categories to the installed project databases.

## Configuration and containers

.env.example lists available overrides; never place real credentials in tracked files. Four default pools allow five connections each, for 20 potential API connections before workers/test/operational connections. Review the total budget as workers are introduced. Request logs contain method, status, duration and trace ID; no bodies, URLs, cookies, passwords or signed links.

Build a service image when Docker is available:

```text
docker build -f infrastructure/containers/Dockerfile --build-arg SERVICE_NAME=catalog -t business-platform/catalog:local .
```

Supply CATALOG_DATABASE_URL, IDENTITY_SERVICE_URL and CATALOG_IDENTITY_SERVICE_TOKEN for Catalog, plus the approved origin configuration. The container runs as node with production configuration and HOST=0.0.0.0. Do not point a container at its own 127.0.0.1 to reach the Windows PostgreSQL host; use the appropriate container-network host address. Containers need reachable databases and gateway upstreams, secret injection and TLS routing. The recipe and hosted CI configuration have been added but not executed locally.

See the [recorded local validation](../backend-validation.json) for the earlier foundation checks and [Identity validation](../identity-validation.json) for the Identity milestone; [engineering validation](../architecture-validation.json) records the refactor checks.

See the [architecture guide](../architecture.md) and [standing project rules](../../AGENTS.md).

## Prisma workflow

B5 Media additionally needs private storage, ClamAV, native workers and authenticated Media/Catalog event processes. Follow [Media operations](media.md) for the reviewed additive migrations, process configuration and acceptance gates. Normal API startup alone does not process uploaded files.

Prisma 7.10.0 is pinned. npm ci --ignore-scripts installs dependencies; npm run build generates each client before TypeScript compilation. Use npm run orm:check to validate bindings, npm run orm:format to format schemas and npm run orm:verify for read-only model/catalog parity. npm run orm:pull saves introspection into ignored .local/prisma-introspection for review. Keep SQL as the migration authority and update the owning schema/dictionary after reviewed changes. Never use runtime credentials for schema deployment or Prisma db push. See [decision 004](../decisions/004-prisma-persistence.md).
