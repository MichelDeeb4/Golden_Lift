# Golden Lift — B5 Media Core completed work

Report date: 2026-10-05.

## Phase status

B5 Media Core implementation is present in the repository, with passing local build, architecture, unit, PostgreSQL integration, HTTP and process checks. Real Sharp image processing and a local coordinated database/object recovery exercise were executed successfully.

B5 production acceptance remains open. The complete upload-to-scanner-to-worker-to-RabbitMQ-to-Catalog-to-delivery workflow has not been exercised with all real external dependencies. Video/PDF processing, the target S3 provider, RabbitMQ failure recovery and the production Linux sandbox still require acceptance testing.

No live database migration, cloud provisioning, deployment, commit or push was performed during this phase. Earlier milestone validation reports remain historical evidence.

## 1. Architecture and service ownership

- Preserved the five-service architecture and four independently owned business databases. Gateway remains stateless.
- Implemented Media domain policies, application use cases and ports, infrastructure adapters, HTTP controllers and composition roots following Clean Architecture.
- Kept Prisma and provider/native types inside infrastructure and composition. Persistence uses focused repository ports and a service-owned Unit of Work.
- Preserved existing Identity, category administration and Dynamic Catalog Core behavior.
- Kept Catalog as the authority for associations, active usage, public eligibility and reference-protected retirement. Media owns file identity, verification, processing generations and delivery.
- Added versioned Media contracts and narrowly shared technical adapters for internal authentication, RabbitMQ and outbox transport.

## 2. Protected resumable uploads

- Added upload initiation, status/resume, part authorization, part transfer, completion and cancellation.
- Required live ADMIN authorization, ownership checks and mutation Origin/CSRF protection. SUPER_ADMIN does not inherit Media library or upload permissions.
- Validated filenames, kind, purpose, declared size, optional SHA-256 and idempotency keys.
- Scoped initiation idempotency to the staff account and canonical request hash; incompatible reuse is rejected.
- Implemented bounded, numbered server-ingested parts for both filesystem and S3 storage profiles. Default parts are at most 8 MiB, with at most 100 parts.
- Made part replay immutable and checksum-aware. Resume responses expose persisted part progress without exposing storage keys.
- Added distributed session, pending-job and retained-byte reservation checks through serializable transactions.
- Added explicit OPEN, SEALING, COMPLETED, EXPIRED, FAILED and CANCELLED session states.
- Completion verifies required parts before sealing, hashes the actual retained original, and atomically records processing state and one logical job.
- Uncertain sealing can resume using the same immutable original identity. Cancellation and expiry prevent completion while retaining uploaded bytes and reservations.
- Mandatory scanner unavailability rejects upload initiation with a safe dependency error.

## 3. Private storage and retained identities

- Implemented a concrete private filesystem adapter with opaque keys, traversal/symlink checks, exclusive publication and immutable object semantics.
- Implemented a concrete AWS S3 adapter using conditional writes, streamed SHA-256 verification, private reads and on-demand presigned delivery.
- Persisted sealed input and derivative object versions where provided, allowing reads/signatures to target the recorded S3 version.
- Kept accepted originals, output generations, rejected inputs and soft-deleted business records retained.
- Kept worker scratch copies separate from retained storage and confined cleanup to owned scratch directories.
- Allowed multiple image profile aliases to reference one immutable output when their dimensions coincide; retained uniqueness of each live asset/profile.

Provider-native multipart uploads and CDN deployment are not implemented. The current upload protocol transfers bounded parts through Media. The S3 adapter still requires testing against the selected private provider and its permissions/immutability policy.

## 4. Verification and processing pipelines

- Added a fail-closed ClamAV TCP adapter using PING, VERSION and streamed INSTREAM scanning. Scanner evidence is associated with the sealed input hash.
- Implemented real Sharp image processing in a separate process: format checks, decoded-pixel limits, orientation/color normalization, metadata removal, transparency preservation and aspect-ratio-preserving output without upscaling.
- Added thumbnail, card, detail and large image profiles with bounds of 320, 640, 1280 and 2048 pixels.
- Implemented FFprobe/FFmpeg video inspection and processing code for the declared MP4/MOV profile, producing canonical H.264/AAC MP4 playback and a poster.
- Implemented Poppler PDF inspection and first-page preview code, with encrypted-document, page-count and page-size restrictions.
- Added output raster/metadata checks, output byte budgets and attempt-specific output identities.
- Added bounded subprocess output, timeouts, argument-array execution and process termination handling.
- Added a production Linux Bubblewrap requirement and a worker container template requiring pinned native package versions and a base-image digest.

Sharp processing was exercised with real images. FFmpeg/FFprobe, Poppler and live ClamAV acceptance were not executed because the required binaries/services were unavailable in the validation environment. The production sandbox/container profile was not executed.

## 5. Durable jobs and safe generation selection

- Used PostgreSQL processing jobs as the durable work authority.
- Added SKIP LOCKED claims, fencing tokens, 120-second leases, 30-second renewal and bounded attempts/backoff.
- Added separate image, video and PDF worker lanes.
- Recorded attempt history for retained-output/orphan investigation.
- Required a current, unexpired lease before readiness or generation selection can commit.
- Required all mandatory verified outputs before selecting READY, with the readiness event written in the same Media transaction.
- Implemented supported infrastructure-failure retry and verified-input reprocessing.
- Reprocessing selects a complete new generation atomically; failure retains the previous usable READY generation.
- Added bounded reconciliation for expired sessions, exhausted leases and selected READY object availability.

External storage, scanning, native processing and HTTP calls remain outside whole-transaction retry callbacks.

## 6. Media–Catalog coordination

- Added versioned readiness, security and retirement event contracts with producer validation, event identity and exact aggregate versions.
- Implemented RabbitMQ durable quorum topology, persistent mandatory publications, publisher confirms, unroutable-message handling, bounded retry and dead-letter behavior.
- Authenticated event envelopes using distinct producer HMAC keys.
- Applied consumer effects and inbox deduplication atomically before manual acknowledgement.
- Kept unrelated Identity and Catalog outbox events outside the B5 relays.
- Distinguished broker publication from completed Catalog registration.
- Added authenticated internal Catalog operations for registration status, usage, public eligibility and protected retirement.
- Preserved security blocks against stale events and prevented late READY events from recreating retired registrations.

The transport implementation is present, but real broker restart, confirm-loss, redelivery and dead-letter acceptance remain unexecuted.

## 7. Catalog attachments, usage and retirement

- Integrated Media registration/security checks with existing category covers and Catalog persistence guards.
- Preserved Dynamic Catalog Core and existing headless product behavior.
- Kept active private references distinct from public usage. Private technical evidence protects assets from ordinary retirement.
- Exposed paginated usage through Catalog ownership rather than creating a duplicate Media association table.
- Used Catalog's protected local retirement transaction to check active references and establish the irreversible retirement marker.
- Added durable retirement completion in Media, retained soft deletion and protection against late worker/event reactivation.
- Supported retirement of not-yet-ready/unregistered assets through the required tombstone path.
- Added emergency blocking that stops fresh Media delivery independently of ordinary reference-protected retirement.

Security-block release and automatic restoration are unsupported. Full technical-sheet/page editing workflows remain separate milestones.

## 8. Controlled delivery

- Added ADMIN private preview authorization and exact-context public authorization using a fresh Catalog eligibility decision.
- Restricted original delivery to the applicable explicit PDF DOWNLOAD policy. Public PDF raster previews remain denied.
- Checked readiness, security, deletion, profile/action and audience before granting access.
- Implemented protected local streaming with backpressure, HEAD, single byte ranges, Content-Length, ETag, If-None-Match, If-Range and 206/416 responses.
- Authorized before conditional/cache/range handling and added no-store, safe filenames and anti-sniffing headers.
- Added on-demand private S3 signatures bounded by the original authorization window, at most 300 seconds.
- Kept binary delivery outside the Gateway/Catalog JSON proxy.

Already authorized remote links may remain usable within their existing expiry. Active transfers, browser caches and downloaded copies cannot be recalled. Provider signing, expired-link behavior, interrupted downloads and browser playback still require external acceptance testing.

## 9. APIs and operating capabilities

Added the following capability groups under the established API conventions:

| Group | Implemented operations |
| --- | --- |
| Capabilities | Formats, purposes, limits, upload instructions and scanner availability |
| Uploads | Initiate, resume/status, authorize, numbered parts, complete and cancel |
| Library | Bounded list/detail, verification/processing state and safe failure information |
| Jobs | Supported retry, reprocess and recent job state |
| Usage | Catalog-owned active-reference inspection |
| Retirement | Versioned, explicitly confirmed retirement and coordinated completion |
| Security | Authorized emergency block; no block-release shortcut |
| Delivery | ADMIN/public authorization and protected GET/HEAD content |
| Statistics | Known retained bytes/reservations, job age/backlog, B5 event state and unselected attempts |
| Internal coordination | Authenticated Media/Catalog contracts excluded from public Gateway routing |

Updated OpenAPI to 0.5.0, Gateway route allowlists, the generated API document controller and process launch scripts. Added environment examples containing configuration names rather than real credentials.

Statistics describe known database-backed storage identities. They do not establish a provider-wide hard storage bound; failed attempts and new generations require operational inventory and capacity monitoring.

## 10. Database and Prisma work

Added reviewed additive migrations and fresh-install entrypoints:

| File | Purpose |
| --- | --- |
| [16_media_core.sql](../database/sql/16_media_core.sql) | Media verification, immutable versions/generations, upload progression/idempotency, reservations, attempt history and output guards |
| [17_catalog_media_core.sql](../database/sql/17_catalog_media_core.sql) | Catalog security projection, registration readiness and attachment guards |
| [18_media_core_fresh.sql](../database/sql/18_media_core_fresh.sql) | Fresh Media installation |
| [19_catalog_media_core_fresh.sql](../database/sql/19_catalog_media_core_fresh.sql) | Fresh Dynamic Catalog with B5 guards |
| [20_catalog_media_legacy_fresh.sql](../database/sql/20_catalog_media_legacy_fresh.sql) | Fresh legacy Catalog with B5 guards |

Updated service Prisma models, the schema manifest, runtime grants, database verification and disposable fixture entrypoints. The verified current schema has **66 Prisma models/tables, 663 columns and 73 foreign keys** across the four database-owning services. The manifest version is 1.3.

Fresh and additive-upgrade Media/Catalog schemas were compared for columns, constraints, indexes and triggers. SQL remains authoritative; no automatic schema synchronization or runtime migration privileges were introduced. Existing legacy READY assets remain UNVERIFIED until an approved validation/import workflow is performed.

## 11. Verification actually executed

These results were executed during B5 work on 2026-10-05; writing this report does not represent another test run.

| Check | Recorded result |
| --- | --- |
| `npm.cmd run check` | Build, strict type checking, formatting and all 36 unit tests passed |
| Architecture enforcement | 144 source files checked; 11 enforcement probes passed |
| Prisma validation | All four service schemas passed |
| `node scripts/b5-run.mjs test:integration` | All 88 integration tests passed |
| `node scripts/b5-run.mjs orm:verify` | 66 models, 663 columns, 73 foreign keys and installed SQL parity passed |
| `node scripts/b5-schema.mjs` | Fresh/additive-upgrade Media and Catalog schema parity passed |
| `node scripts/b5-run.mjs db:verify:dynamic` | Four fresh databases, seven SQL suites, four concurrency scenarios and 12 cross-database connection denials passed |
| `node scripts/b5-run.mjs smoke` | Five independent service processes, Gateway routing/OpenAPI and readiness isolation passed |
| `node scripts/b5-run.mjs smoke:identity` | Five-process Identity/B4/Dynamic Catalog workflows, authorization, revocation and outage behavior passed |
| `node scripts/b5-recovery.mjs` | Real PostgreSQL dump/restore plus local object snapshot preserved original, selected profiles and retained prior generation hashes/byte identities |
| Real Sharp processing | Portrait ratio, transparency, profile reuse, orientation and metadata behavior exercised |
| Synthetic media fixture generator | Image/PDF fixtures generated; video generation stopped because FFmpeg was absent |

Media regression coverage included upload ownership/idempotency/replay, cancellation with retained reservations, checksum rejection, concurrent quota enforcement, stale lease fencing, mandatory-output rollback, event deduplication/order, late readiness after retirement, reference protection and failed reprocessing preserving the prior generation.

HTTP coverage included anonymous/SUPER_ADMIN denial, scanner-unavailable rejection, byte-range 206, HEAD, invalid multi-range 416, conditional 304 and fresh security-block denial before returning a cached response.

Some SQL/HTTP tests deliberately use test-scoped authentication or scanner evidence. They verify transport and persistence invariants and do not establish acceptance of a live ClamAV or the full production processing chain.

Recorded environment: Windows, Node.js 24.21.0, PostgreSQL 18.6, Sharp 0.35.5/libvips 8.18.7, AWS S3 SDK/presigner 3.1146.0 and amqplib 2.2.0. Local check logs and structured smoke/integration evidence are retained under ignored `.local` paths, including `.local/b5-evidence-2026-10-05`, `.local/b5-check-final.log`, `.local/b5-schema-final.log` and `.local/b5-recovery-final.log`.

An earlier online npm audit reported four high-severity advisories in the existing Prisma tooling dependency chain. No forced dependency upgrade was applied. A repeat audit was rejected by automatic approval review because it would transmit dependency metadata to the registry; it was not executed. Offline audit output is not treated as a clean security result.

## 12. Remaining acceptance and deferred work

Before production readiness can be declared, complete:

1. A real image/video/PDF upload-through-delivery run with live Identity, ClamAV, native tools, RabbitMQ and Catalog registration.
2. Video/PDF native output validation and browser playback/download acceptance.
3. RabbitMQ outage/restart, uncertain publication, redelivery and dead-letter/replay acceptance.
4. S3 conditional-write, version pinning, private-origin, signing expiry, range/replay and cloud recovery acceptance against the chosen provider.
5. Linux Bubblewrap, CPU/memory/PID/scratch limits and worker image acceptance.
6. Provider inventory/accounting, abuse/rate controls, interrupted-download/link-refresh behavior and coordinated cross-service/key recovery.
7. Hosted CI and deployment validation when those environments are provisioned.

Provider-native multipart uploads, CDN deployment, adaptive streaming, security-block release and destructive retention cleanup are not implemented. Full content/technical/page interfaces, Inquiry workflows and frontend/mobile/staff applications remain outside B5.

The owned disposable validation cluster was stopped and removed. Additional test fixture directories remain in `.local` because the subsequent cleanup/report command was interrupted by an automatic approval-review failure reporting exhausted workspace credits. Their presence is not retained production media, and this report does not claim that all fixture cleanup completed.

## Related documentation

- [Media operating guide](operations/media.md): migrations, profiles, limits, process launch, monitoring, retention and recovery.
- [Decision 007](decisions/007-media-core.md): design choices and tradeoffs.
- [Architecture guide](architecture.md): service/layer ownership and dependencies.
- [OpenAPI](api/openapi.json): implemented API contracts.
- [Project progress](project-progress.md): project-wide implemented and remaining scope.
- [Worker image template](../infrastructure/containers/MediaWorker.Dockerfile) and [Media configuration example](../infrastructure/media.env.example).
