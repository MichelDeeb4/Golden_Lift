# 002: Staff Identity and live service authorization

Date: 2026-10-03. Status: implemented and verified locally.

Identity owns staff accounts, sessions and single-use action tokens in its existing database. Anonymous visitors need no account. Super Admin manages ADMIN accounts; ADMIN manages content/inquiries. Roles form separate capabilities rather than an inheritance hierarchy. Bootstrap is an operator CLI with a database advisory lock, never an HTTP endpoint.

Passwords use the pinned Node 24.21 Argon2id adapter and PHC encoding, initially 19 MiB/two passes/one lane. Random 32-byte session/action tokens are stored as SHA-256 digests. HTTP uses an HttpOnly cookie and Identity-signed, session-bound CSRF value; production uses Secure/__Host-/SameSite=Strict. Approved Origins protect login and action-token consumption as well as authenticated mutations.

Each business service authenticates its own internal introspection request with a distinct credential and checks its own role policy. Identity reads current account/session state on every request. There is no positive authorization cache. This makes disable/deletion/credential revocation effective on the next protected request, with an availability dependency on Identity. Anonymous Catalog reads remain independent. Authorization already granted to an in-flight operation cannot be recalled across databases.

Identity transactions lock accounts before action tokens, consume tokens atomically, and retain the existing credential-revocation triggers. Account business changes append minimal events transactionally. Outbox events contain an account ID/version, never email, password hash or raw tokens. Sessions/action tokens stay private.

Mail sends only after commit. Nodemailer 10.0.14 implements SMTP with required production TLS/certificate verification. Development uses an ignored private mailbox. Invitation delivery failures return a recoverable account/version; resend replaces the link. Reset requests return the same acknowledgement and schedule mail asynchronously with a minimum response floor. Pending delivery is bounded in memory; process-crash recovery uses a fresh request/resend rather than recovering raw tokens from storage.

The existing architecture checker continues to prohibit infrastructure/framework imports in domain/application code and imports between service implementations. [Identity operations](../operations/identity.md), [the full plan](../identity-implementation-plan.md), [OpenAPI](../api/openapi.json) and [executed checks](../identity-validation.json) document the implementation and remaining deployment gates.
