# Golden Lift — Functional integration baseline

Audit date: 2026-10-07. This report precedes functional integration changes. Previous redesign/refinement acceptance reports are historical.

## Runtime and database audit

Initially, ports 3000–3004 and 8081–8082 were unreachable; PostgreSQL on 55432 was stopped. `npm.cmd start` started the existing PostgreSQL cluster and all five APIs. Each `/health/ready` returned 200. Metro served the website on 8081. No database reset or migration was required.

`db:status` reports PostgreSQL 18.6 and four owning databases: Identity (5 tables), Catalog (50), Media (6), Inquiries (5). Dynamic Catalog is at the final stage, B5 migrations are installed in Catalog/Media, and the Admin publication migration is installed. Read-only ORM verification passed: 66 models, 664 columns, 73 foreign keys, installed constraints/indexes/triggers and runtime parity. Existing Catalog has categories but zero products/attribute definitions. Existing staff accounts are retained.

Gateway readiness checks upstream services; owning-service readiness checks its database. API readiness does **not** imply scanner/processor/broker readiness.

## Frontend and authentication

Normal visitor startup displays the demo notice. `StorefrontProvider` defaults `EXPO_PUBLIC_CATALOG_SOURCE` to `demo`. Staff uses a separate real API client and QueryClient. Public and staff have separate API origin variables (both default localhost:3000), which should be consolidated. Public collection adapter explicitly throws `unsupported`; category covers are dropped; detail maps only the cover, not gallery/video/PDF associations.

Normal startup supplies matching localhost:8081 staff/allowed origins, localhost:3003 Media delivery origin. Staff uses credentials/include, in-memory CSRF, SameSite Strict cookies and live service authentication. No insecure token storage is introduced. Login page and real mutation/persistence audit will be exercised with disposable staff fixtures; a rendered page is not considered authentication acceptance.

Initial public browser audit: homepage served, demo notice visible, zero page errors. Backend collection route is absent. Network and CRUD acceptance require actual requests and persistence checks, recorded separately in this phase's evidence.

After waiting for session bootstrap, login rendered both inputs. Its one 401 is the expected anonymous session response, without a repeated loop. Before functional edits were compiled, the existing Admin browser suite passed **10 tests** against real owning services/Gateway and disposable PostgreSQL. It exercises Category/type/definition/options creation, product drafts and conflicts, association/publication, upload controls and staff lifecycle. Its processing adapters are explicitly synthetic; this establishes existing CRUD behavior, not local native Media acceptance. Baseline log: `.local/functional-admin-baseline.log`.

## Media prerequisites and observed blockers

Normal `start` launches the Media API only; workers and both B5 relays require separate commands. No FFmpeg, FFprobe, Poppler, ClamAV or Docker command was detected on PATH. No readiness evidence for RabbitMQ or scanner exists. Upload initiation depends on ClamAV PING and fails closed if unavailable. Consequently normal local image/video/PDF upload is not yet accepted; synthetic browser processing in historical tests cannot close this gate.

Add Product requires a registered READY image cover under the current database model, including inactive creation. Empty local Media plus missing scanner/worker infrastructure blocks that path before product persistence. This is a backend invariant, not permission to synthesize a cover or bypass verification.

## Planned verification

Audit/fix live Category, type, definitions, groups/options/units, products, associations and publication in that order; retain optimistic versions, schema revisions and soft deletion. Implement missing bounded public collection/search/dynamic filters and eligible media projection through Catalog-owned ports. Then change normal mode to API, add additive interaction states, run real PostgreSQL/HTTP/browser persistence regressions and record provider acceptance separately.
