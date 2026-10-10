# Phase 02 local engineering operation

Use Node 24.21.0 and npm. Run npm ci --ignore-scripts --no-audit --no-fund, npm run build, then npm start. Backend ports: ERP 4100, platform 4101, worker health runtime 4102. Web ports: ERP 4200, platform administration 4201. Ctrl+C stops the launcher. No business routes or authenticated tenant access are exposed.

Backend readiness: /api/v1/health/ready. OpenAPI: /api/v1/openapi.json and /api/v1/docs. Web process health: /api/health. Readiness certifies only this engineering runtime. It does not certify tenant storage, identity, durable jobs or business readiness.

Optional OTEL_EXPORTER_OTLP_TRACES_ENDPOINT selects a trusted HTTP collector. Empty disables trace export. JSON logs include service, timestamp, event, correlation ID and response status; query strings and bodies are not logged. Backend configuration rejects malformed environment/port/host and telemetry URLs containing credentials.

With Docker available, npm run test:docker builds and starts five target containers bound to loopback. Stop them using docker compose -f infrastructure/deployment/compose.yml down. npm run test:database creates and removes its own randomly named PostgreSQL fixture. No production resources, legacy databases, object stores or backups are changed.

Validation: npm run check runs local build/type/format/boundary/unit/HTTP/browser checks. Install Chromium first with npx playwright install chromium. Container/database/security and hosted CI gates are additional mandatory Phase 02 checks, not implied by check. The evidence gate is node packages/tooling/phase-02-gate.mjs; it rejects any missing/nonpassing criterion.

The container build currently includes development dependencies for an engineering foundation. Runtime uses the unprivileged node user. Production image minimization, credentials and tenant database connectivity belong to later reviewed implementation and release gates. No production deployment is authorized here.
