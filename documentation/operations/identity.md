# Identity operations and API

B3 Identity is implemented. The [full plan](../identity-implementation-plan.md) defines its scope, security policy, boundaries and acceptance gates. The [validation report](../identity-validation.json) records local results. Category moves/order/deletion, media processing, products, inquiries and the staff application remain later packages.

## Prepare and bootstrap

Run these commands from the repository root. The database setup is described in the [database guide](../../database/README.md).

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\database\manage.ps1 start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action auth:setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-super-admin.ps1 -Email '<your-email>' -DisplayName '<your-name>'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action dev
~~~

Replace the account placeholders with the real operator's details. Bootstrap prompts for a 15-to-128-character password without putting it in command-line history. It uses the Identity runtime login, serializes concurrent bootstrap attempts, and refuses another Super Admin even if a retained record exists. It has no HTTP route. Implementation tests created only synthetic accounts in disposable databases; the installed project database has no operator account created by this work.

On other platforms, inject BOOTSTRAP_EMAIL, BOOTSTRAP_DISPLAY_NAME and BOOTSTRAP_PASSWORD into a one-off process and run node services/identity/dist/composition/bootstrap.js. Do not pass the password as a command argument. This command needs IDENTITY_DATABASE_URL in production, but does not require SMTP or the HTTP-service secrets. An existing deployment should use its own database endpoint and protected secret injection.

The setup command creates .local/service-secrets.json once and keeps it on repeated runs. It contains a CSRF signing key and distinct Catalog/Media/Inquiries credentials. No values are printed. The dev launcher passes explicit environment credentials only to their owning process; local fallback is for development. No command automatically loads .env.example or a .env file: inject actual environment variables or use the ignored generated local configuration.

## Staff HTTP flow

Use the gateway at http://127.0.0.1:3000. The default staff Origin is http://127.0.0.1:8082. Override STAFF_APP_URL and ALLOWED_ORIGINS consistently on the services and gateway if needed. Nonbrowser clients must send the approved Origin on authentication/action-token requests and on every mutation. Browsers add Origin automatically and must include credentials.

1. POST /api/v1/auth/login with email and password. The server sets the HttpOnly cookie and returns account, expiresAt and csrfToken. Store only csrfToken in application memory; browser JavaScript cannot read the session cookie.
2. As Super Admin, POST /api/v1/staff/admins with email and displayName. The role is fixed to ADMIN. The response contains account and delivery, with no action token. SENT means the mail transport accepted the message; it does not guarantee inbox arrival.
3. The invitee takes the token from the invitation link fragment and POSTs token/password to /api/v1/auth/invitations/accept. Activation does not sign in automatically. Log in as the Admin afterwards.
4. As Admin, POST /api/v1/admin/categories with translations. Root creation omits parent fields; child creation supplies parentId and expectedParentVersion. PATCH /api/v1/admin/categories/{id} sends expectedVersion and translations. Arabic text is required. Category writes and their outbox events commit together.
5. GET /api/v1/auth/session refreshes the account/expiry/CSRF view. POST /api/v1/auth/logout revokes the current session and expires its cookie.

Every authenticated mutation sends X-CSRF-Token from the current session and the approved Origin. A login from another browser has a different CSRF token. Browser requests follow this pattern, using email/password supplied by the login form:

~~~javascript
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!response.ok) throw new Error('Login failed');
const session = await response.json();

const invite = await fetch('/api/v1/staff/admins', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': session.csrfToken,
  },
  body: JSON.stringify({ email: adminEmail, displayName: adminName }),
});
~~~

For a separately served staff application, prefix these paths with the configured gateway origin and permit that staff Origin in CORS. Production staff/gateway hosts must share the same site for SameSite=Strict cookies. Staff UI routes now use `/admin` and `/super-admin`; set `STAFF_APP_URL` with an `/admin/` suffix. Action links identify the token by fragment, and the UI or API can consume it. Tokens never belong in API query strings, operational logs or tracked files.

## Admin management and recovery

Only Super Admin can list/detail/invite/edit/disable/enable/delete/resend ADMIN accounts. Admin cannot manage staff; Super Admin cannot manage Catalog/Media/Inquiries content. Both staff roles can manage their own password/session. Role assignment, ordinary Super Admin editing and deleted-account restoration have no route.

GET /api/v1/staff/admins supports limit=1..100 and an opaque nextCursor. The cursor preserves PostgreSQL microsecond timestamps. PATCH /api/v1/staff/admins/{id} accepts email/displayName and expectedVersion. DELETE and POST /{id}/disable, /enable, /invitation require expectedVersion as a decimal string. Reload after a 409. Deletion retains the row and its current normalized email forever.

Email/status/password/deletion changes revoke sessions and open action tokens through the existing database triggers. Display-name edits advance the account version without revoking authorization. Re-enabling never restores old sessions. Re-enabling an account without a password returns it to INVITED; resend its invitation. Editing an invited email revokes the previous link; resend to the updated address. Disabling denies the next protected request, while an already authorized request can finish.

If an invitation response says FAILED, the INVITED account remains committed. Resend using its returned version; a newer invitation invalidates the older link. A process crash during delivery uses the same recovery path. Mail work is bounded in memory, not a durable broker queue. Password-reset requests remain generic 202 acknowledgements; retry a request when delivery does not arrive, and use only the newest link.

POST /api/v1/auth/password/reset-request accepts email. POST /api/v1/auth/password/reset accepts token/password. POST /api/v1/auth/password/change accepts oldPassword/password with session/CSRF/Origin. Reset/change revoke all sessions and open action tokens; log in again. Malformed/expired/consumed action links return 400 without identifying an account. Valid reset requests have a minimum 100 ms response floor and do not wait for SMTP; this reduces timing differences under normal database latency.

Local messages are private JSON files in ignored .local/mailbox, or IDENTITY_MAILBOX_DIRECTORY when explicitly overridden. They intentionally contain recipient addresses and action links. Restrict directory access on Windows using filesystem ACLs; Unix permission modes alone do not set Windows ACLs. This mailbox is separate from request/error logs. Local SMTP tests send only to a loopback test server.

## Configuration and production requirements

Production requires NODE_ENV=production and TLS termination on the public gateway, with private encrypted upstream endpoints. A reverse proxy handles HTTPS; Node HTTP listeners stay inside the private network. Provision the following secrets separately:

| Process | Required inputs |
| --- | --- |
| Gateway | Four HTTPS service URLs and approved ALLOWED_ORIGINS; no runtime database or introspection secrets |
| Identity | Its runtime database URL, HTTPS STAFF_APP_URL, IDENTITY_CSRF_SECRET, IDENTITY_SERVICE_CREDENTIALS JSON with distinct catalog/media/inquiries keys, SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_FROM |
| Catalog | Its runtime database URL, HTTPS IDENTITY_SERVICE_URL and CATALOG_IDENTITY_SERVICE_TOKEN |
| Media | Its runtime database URL, HTTPS IDENTITY_SERVICE_URL and MEDIA_IDENTITY_SERVICE_TOKEN |
| Inquiries | Its runtime database URL, HTTPS IDENTITY_SERVICE_URL and INQUIRIES_IDENTITY_SERVICE_TOKEN |

Security keys must be distinct base64url strings of 43 to 128 characters; generate at least 32 random bytes per key. Catalog/Media/Inquiries use only their own credential. The gateway drops caller-provided role/service authorization headers and never forwards /internal routes. Internal introspection authenticates the caller, verifies the live session and mutation Origin/CSRF, and returns a minimal principal. Each service enforces its own role policy as well.

Production mail uses SMTP, direct TLS on port 465 or mandatory STARTTLS on other ports, with certificate verification. Configure a verified sender and test real-provider acceptance/delivery before deployment. Development defaults to the mailbox. SMTP credentials or a mailbox never fall back automatically in production. Tokens/password hashes stay out of HTTP JSON, outbox data and normal logs.

| Setting | Default | Permitted range |
| --- | ---: | ---: |
| IDENTITY_SESSION_SECONDS | 28800 | 30..86400 |
| IDENTITY_INVITATION_SECONDS | 86400 | 60..604800 |
| IDENTITY_RESET_SECONDS | 1800 | 60..7200 |
| IDENTITY_PASSWORD_CONCURRENCY | 4 | 1..16 |

Password hashing uses Node 24.21 Argon2id with 19 MiB, two passes, one lane and random salts. Benchmark the deployed machine before changing policy or expanding replicas. Per-process limits allow 120 authentication attempts per connection IP per minute, 10 login attempts per digested email, five reset requests per digested email, and 10 action-token/password-change attempts per connection IP. Buckets use a bounded 10,000-key map; pending mail has a 100-item cap. Behind the gateway the connection IP is shared: set trusted edge/distributed abuse controls before production scale rather than trusting arbitrary forwarded headers.

Changing the CSRF secret makes existing CSRF values fail; GET current-session returns a new value after rollout. Rotating a caller credential requires coordinated Identity/caller deployment; the current adapter does not accept overlapping keys. SMTP credentials rotate independently. Keep reverse-proxy access/error logs redacted as well; application logging guarantees do not configure external proxy logs.

## Validation and remaining packages

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action test:integration
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action smoke
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend.ps1 -Action smoke:identity
~~~

The Identity process check runs the actual bootstrap CLI and five service entrypoints, using disposable Identity/Catalog databases and a temporary private mailbox. It exercises invitations, activation, role/CSRF checks, category writes, live disable/revocation and Identity-outage behavior. It checks logs for fixture credentials/tokens and removes the fixture databases/messages. Media/Inquiries use their installed runtime databases for readiness and perform no business writes in this check. Database roles/schemas remain the existing reviewed implementation.

Hosted CI, Docker execution, production SMTP, HTTPS/reverse-proxy deployment and distributed load/abuse testing were not executed locally. B4 next completes category administration, including deep trees, moves, ordering and branch-deletion preview/retirement. Media/product/inquiry workflows and staff/public interfaces remain the subsequent packages in the [backend plan](../backend-implementation-plan.md).

