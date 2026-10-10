# Identity Implementation Plan

Prepared 2026-10-03. Status: I1-I7 implemented and verified locally. Scope: B3, following the implemented backend foundation. This package makes staff authentication and Admin-account management usable through the gateway and demonstrates authenticated Catalog writes. The public site still requires no customer account. The implementation uses the existing Identity tables, with no schema synchronization or additional business tables.

## Outcomes and scope

Implement an operator-only initial Super Admin bootstrap, Admin invitations and activation, login/current-session/logout, own-password changes, password-reset requests and consumption, Admin directory/detail/edit/disable/enable/delete/resend operations, and authenticated internal session introspection. Wire the existing Catalog create/edit use cases to protected HTTP routes and provide protected current-actor checks in Media and Inquiries for the next milestones.

Super Admin manages ADMIN targets only. Admin manages content and inquiries, and cannot manage staff accounts. Both roles manage their own sessions/passwords. No HTTP route creates or edits Super Admin accounts, changes roles, restores deleted accounts or registers customers. Application use cases enforce these rules as well as transport authentication.

## Work sequence and completion gates

| Step | Deliverable | Acceptance |
| --- | --- | --- |
| I1 Contracts and configuration | Staff/session DTOs, Identity ports, local secrets, production validation | No secret-bearing fields in staff responses; no production fallback to local files |
| I2 Security adapters | Argon2id, opaque tokens/digests, session-bound CSRF, bounded rate/concurrency limits | Password verification/precision/token tests; unsafe inputs rejected |
| I3 PostgreSQL repositories | Account/session/token queries and local unit of work | Atomic token consumption, credential revocation, stale-edit protection and rollback |
| I4 Staff workflows | Bootstrap, login/logout, invitations, recovery and Admin management | Non-hierarchical role matrix and single-use/expiry behavior proven |
| I5 HTTP and delivery | Cookie handling, approved origins, local mailbox and SMTP adapter | Tokens stay out of JSON responses/logs/database payloads; resend recovers delivery failure |
| I6 Service integration | Authenticated introspection, gateway routes and Catalog mutations | Disabled accounts denied on their next protected request; Identity outage fails protected access closed |
| I7 Handoff | OpenAPI, operating guide, CI setup and validation report | Build, types, format, architecture, real PostgreSQL/API and process checks pass |

## Clean Architecture and persistence

Identity domain code contains role/target and input rules. Application code owns authentication, Admin management, action-token and bootstrap use cases and repository/security/mail ports. PostgreSQL, crypto, SMTP, local mailbox and delivery scheduling are infrastructure adapters. Controllers parse transport DTOs and cookies and call use cases. Composition connects implementations; it also owns the operator bootstrap entrypoint. Domain/application code imports neither NestJS nor SQL/Node infrastructure modules.

Identity mutations use one PostgreSQL client per transaction. Lock the affected account before its action tokens, keeping consistent ordering with the existing revocation triggers. Password hashing happens before acquiring row locks. Login rechecks account status/password/auth_version under a lock after verification, so a concurrent credential change cannot create a valid old session. Invitation/reset consumption atomically marks the token consumed and changes the account password/status; concurrent consumers can succeed only once. Known database failures become safe API errors. Retry deadlock/serialization failures at most three times for complete local transactions, without resending mail inside the retry callback.

Staff edits require the expected account version. Display-name changes preserve authorization; password, email, status and deletion changes use the existing auth_version/revocation triggers. Deleted rows and their credentials remain retained. Email uniqueness includes deleted account rows. Account/session/action-token data never enters a public Catalog response.

## Sessions passwords and browser protection

Use 32-byte random opaque session/action tokens and SHA-256 digests for database lookup. SHA-256 is appropriate for these random tokens; passwords use salted Argon2id. Encode passwords using the PHC format with a 16-byte salt, 32-byte output, 19 MiB memory, two passes and one lane initially. Bound concurrent password work and measure the adapter locally; production tuning follows deployed capacity. Node 24.21.0 has [Argon2 support](https://nodejs.org/docs/latest-v24.x/api/crypto.html). The starting work parameters follow [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). New passwords contain 15 to 128 Unicode characters without forced composition rules; never trim a supplied password.

Session lifetime defaults to eight hours, invitation lifetime to 24 hours and reset lifetime to 30 minutes. Configuration may shorten these or raise them within documented bounds. Sessions have an absolute expiry, checked against database time, and require an ACTIVE, nondeleted account with a matching authorization version.

Production uses a Secure, HttpOnly, SameSite=Strict cookie named __Host-bp_staff with Path=/ and no Domain. Development uses bp_staff on loopback HTTP. JSON responses include the staff DTO, session expiry and CSRF token, never the raw session token. CSRF tokens are HMACs bound to the opaque session token and an Identity-only signing key. All staff mutations require an approved Origin and valid CSRF header; login and invitation/reset endpoints require an approved Origin as well. The browser sends the cookie automatically and keeps the CSRF value in application memory. See [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Invalid login results share one safe message and perform password work for missing accounts. Reset requests return the same acknowledgement for eligible/ineligible/missing accounts; SMTP work happens asynchronously after commit, avoiding a provider-latency account-disclosure path. Add bounded per-process quotas keyed by connection IP and digested email, plus bounded pending mail work. Distributed abuse limits across replicas remain a deployment gate; never trust arbitrary forwarded IP headers.

## Invitations recovery and bootstrap

Creating an Admin inserts an INVITED ADMIN account and invitation digest together. The raw token passes only to the mail adapter after commit. Resend checks the current account version/status, revokes earlier invitations and issues a fresh link. Delivery failure leaves the account recoverable through resend; a process crash cannot recover raw tokens from the database and follows the same resend path. Reissuing a reset revokes its previous open reset token. Consuming a reset/password change revokes sessions and outstanding action tokens and requires a new login.

Local development writes email messages to the ignored .local/mailbox directory, with private file permissions where supported. This mailbox intentionally contains action links and is separate from operational logs or database/outbox records. Production requires configured SMTP and a verified sender; no local mailbox fallback. Require TLS and certificate verification for production SMTP. Adapter tests use a local SMTP server, with no email to real recipients. [Nodemailer SMTP documentation](https://nodemailer.com/smtp)

The bootstrap command reads operator-supplied email/name and a password from a protected prompt/environment. It runs through the Identity runtime role, holds a transaction-scoped advisory lock and refuses to create another Super Admin if one already exists, including retained records. It never prints the password/token and has no HTTP equivalent. Do not invent actual company accounts during implementation; acceptance fixtures live in disposable databases.

## Service authentication and gateway

Each of Catalog, Media and Inquiries receives a distinct secret for Identity introspection. Identity holds the corresponding caller allowlist. Local secrets are generated once into an ignored file; each service loads only the entry it needs. Production uses explicit environment/secret injection and encrypted service transport. The gateway receives no introspection credentials and never routes internal endpoints.

Protected business routes resolve their own session through Identity on every request, with no positive authorization cache. Identity verifies current database state and, for mutations, the approved Origin/session-bound CSRF. The owning service separately enforces its action/role policy. Gateway forwarding includes only required cookie, CSRF, Origin, content type and trace headers; caller-supplied identity/role/service credentials are discarded. After an account is disabled, its next protected request fails; a request already in progress can finish. If Identity is unavailable, protected operations return a safe 503 while anonymous Catalog reads remain independent.

## HTTP coverage

| Surface | Routes and callers |
| --- | --- |
| Authentication | POST /api/v1/auth/login, POST /logout, GET /session; anonymous login and authenticated own-session actions |
| Invitations | POST /api/v1/auth/invitations/accept with action token and password |
| Recovery | POST /api/v1/auth/password/reset-request, POST /reset, POST /change |
| Admin directory | GET/POST /api/v1/staff/admins and GET/PATCH/DELETE /:id; Super Admin only, ADMIN targets |
| Admin lifecycle | POST /:id/invitation, /disable and /enable, with expectedVersion |
| Internal Identity | POST /internal/v1/sessions/introspect; allowed service credential only |
| Catalog | POST /api/v1/admin/categories and PATCH /:id; live authenticated Admin only |
| Other services | GET /api/v1/admin/media/session and /api/v1/admin/inquiries/session; capability checks for future workflows |

Directory lists use bounded pagination. DTO parsers reject unknown fields, including role/status escalation. Safe errors use the existing API error codes. Credentials/action tokens belong in request bodies or cookies, never URLs or ordinary request logs. Action links put tokens in the fragment for the later staff application to consume.

## Verification and handoff

Use actual PostgreSQL in disposable Identity/Catalog databases with the existing schema/grants. Cover initial bootstrap and duplicate/racing bootstrap; Argon2/Unicode verification; login/logout, invalid credentials, expiry and password changes; invitation/reset expiry, replay and concurrent consumption; resend revocation/failure; account edit/version/enable/disable/delete; email uniqueness and no restoration; complete role/target matrix; missing/wrong Origin/CSRF/service credentials; absence of token/password hashes in API/log/outbox data; rate/concurrency bounds; authenticated gateway-to-Catalog writes; next-request denial after disabling; and public-read availability during Identity outage. Test the SMTP adapter against a local protocol server and inject delivery failures for recovery.

Publish only implemented OpenAPI routes and keep runtime documentation equal to the saved contract. Add setup/bootstrap instructions, provider configuration and secret rotation behavior. Record executed results separately from unexecuted hosted CI/production-provider checks. B4 completes category administration after this package; B5-B8 add media/products/technical content/inquiries.


## Executed acceptance

I1-I7 are complete locally. Build, strict types, formatting, architecture checks/probes, 13 unit tests and 28 integration tests passed. Both five-process workflows passed, including the actual bootstrap CLI and mailbox-to-activation flow, authenticated category writes, live revocation and outage isolation. Account bootstrap/activation/password changes also append minimal account/version events in the same transaction; session operations do not publish credentials. The [operating guide](operations/identity.md) and [validation report](identity-validation.json) provide the handoff.

The local mail adapter, SMTP protocol adapter/TLS rejection, token races and retained-record behavior were exercised using synthetic fixtures. No real company account was seeded and no email was sent to real recipients. Hosted CI, Docker and production provider/TLS/load verification remain deployment checks. B4 is the next implementation package.

