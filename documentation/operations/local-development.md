# Local development

Updated 2026-10-07. Run commands from the repository root with Node 24 and npm workspaces. See [database preparation](admin-local.md#database-preparation) and [backend setup](backend-local.md) for a fresh installation. The launcher never applies migrations or resets existing staff/data.

For the prepared Windows project:

```powershell
npm.cmd run media:tools
npm.cmd run media:setup
npm.cmd start
```

The first command downloads pinned, SHA-256-verified portable FFmpeg/FFprobe, Poppler and ClamAV packages into `.local/tools`. It needs network access and disk space. The second downloads real ClamAV signatures and prepares private local coordination secrets. Rerun it periodically for signature updates while the project is stopped. No tools are added to the system PATH. `--offline` is available only when signatures already exist; it does not bypass scanning.

After preparation, daily startup is **`npm.cmd start`**. It starts the configured PostgreSQL instance, prepares existing service credentials, builds, and supervises the five APIs, native Media worker, two event relays, scanner and website. Missing native setup produces an actionable warning; upload intake fails closed if the scanner is unavailable. Ctrl+C stops owned application processes; PostgreSQL remains available. Do not start a second scanner on the same port.

Open [the website](http://localhost:8081) or [staff login](http://localhost:8081/admin/login). Admin enters `/admin`; Super Admin enters `/super-admin/admins`. There is no default password. Use the [Identity bootstrap](identity.md) and invitation flows; retain account secrets outside repository artifacts. `.test` addresses require the development mailbox or a configured SMTP delivery provider, not public Internet mail.

```powershell
npm.cmd run doctor
```

This operator-only command reports service readiness, database queries, tool versions, scanner PING and event transport reachability without credentials. A nonzero result identifies incomplete startup. It does not establish production provider acceptance or prove a worker's completed job; browser acceptance supplies that evidence.

| Process                                      | Default local address                            |
| -------------------------------------------- | ------------------------------------------------ |
| Website / staff                              | localhost:8081                                   |
| Gateway                                      | localhost:3000                                   |
| Identity / Catalog / Media / Inquiries       | localhost:3001 / 3002 / 3003 / 3004              |
| Project PostgreSQL                           | 127.0.0.1:55432; four separate service databases |
| ClamAV                                       | 127.0.0.1:3310                                   |
| Signed Catalog / Media local event listeners | 127.0.0.1:3102 / 3103                            |
| Exported browser-test preview                | localhost:8082                                   |

The normal Windows profile is explicitly `native-local-http`: real scanning/processing, private retained filesystem storage, durable signed HTTP event relays. RabbitMQ is not required for this named profile and is not claimed as validated. The external production profile still requires RabbitMQ, private S3 and verified Linux processor isolation. See [Media operations](media.md) for separate worker/relay launch, provider configuration and retention.

`apps/storefront/configuration.ts` is authoritative for both public and staff origins:

| Public variable           | Default               |
| ------------------------- | --------------------- |
| EXPO_PUBLIC_API_URL       | http://localhost:3000 |
| EXPO_PUBLIC_MEDIA_ORIGIN  | http://localhost:3003 |
| EXPO_PUBLIC_APP_DATA_MODE | api                   |

Set public variables before Metro/export and restart after changes. Backend `MEDIA_PUBLIC_ORIGIN` must match binary delivery; `STAFF_APP_URL` and `ALLOWED_ORIGINS` must match the browser origin. Use localhost consistently for cookies. Staff requests include credentials and mutation CSRF; anonymous public requests do not need a staff cookie. Never put secrets in `EXPO_PUBLIC_*`.

Explicit demo export, only for the isolated visitor visual fixture:

```powershell
$env:EXPO_PUBLIC_APP_DATA_MODE='demo'
npm.cmd run storefront:build
npm.cmd run test:storefront
$env:EXPO_PUBLIC_APP_DATA_MODE='api'
npm.cmd run storefront:build
```

For real backend/browser tests, stop the normal application first to free ports. Create an owned disposable PostgreSQL profile with `node scripts/b5-environment.mjs start`, set `BUSINESS_PLATFORM_DATABASE_CONFIG_FILE` to its private pointer's `configFile`, then run `check`, `test:integration`, `smoke`, `test:frontend` and the API export. `BUSINESS_PLATFORM_MEDIA_NATIVE_FIXTURE=true` selects actual processors for `test:admin`; it also requires a running scanner. Synthetic browser fixtures are explicitly test-only. Do not rebuild services/export or run the two browser suites concurrently. Finish with `node scripts/b5-environment.mjs stop`, clear test variables, and restart the normal project. Disposable fixture credentials and database pointers remain in ignored `.local`.

Troubleshooting: scanner unavailable → check signatures/3310; READY but not Catalog registered → inspect event listeners/outbox evidence; native processing failure → inspect installed tools and safe asset failure state; service readiness failure → inspect its database configuration and grants. The frontend displays API failures rather than switching to demo data. No retained object or business row should be deleted to resolve these failures.

## Business Platform identity cutover

The workspace scope is @business-platform/*. Existing installations must stop all APIs, workers and relays before changing physical names. Run `npm.cmd run db:rename` to inspect the OID-based plan, then `npm.cmd run db:rename -- --apply` for a checked four-database/eight-role rename. It refuses active clients, validates the private cluster, makes four custom-format backups and retains a resumable journal in ignored .local/identity-rename. No business data, constraints or Media object paths are changed. Do not run db setup/all to rebuild a populated installation. See the [rename report](../implementation/01-business-platform-rename.md) for executed evidence, recovery and folder/Git hosting actions.

Session cookies are bp_staff (development) and __Host-bp_staff (production); existing development sessions must sign in again. Browser preferences/history use bp namespaces. Current API callers and UI exports use the new identity together; there is no package alias.

For RabbitMQ, pause legacy publishers/consumers and drain the two legacy Media queues and dead-letter queue before starting renamed relays. Startup refuses queues with messages/consumers or a failed broker check. The new exchange is business-platform.media.v1; consumer queues are business-platform.media.catalog.v1 and business-platform.media.media.v1; dead-letter exchange/queue is business-platform.media.dead.v1. Confirm delivery and retries on the actual selected broker. No queue or storage object is automatically deleted by this rename.
