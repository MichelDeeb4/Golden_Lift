# Security principles

Date: 2026-10-10. Existing controls and proposed foundations are distinct.

## Existing controls

Opaque digest-backed staff sessions, Argon2id, session-bound CSRF, allowlisted Origin checks and host-only HttpOnly/SameSite cookies are implemented. Production secure cookie uses the __Host prefix. Owning services perform live Identity verification and use-case role policies; SUPER_ADMIN does not inherit ADMIN content authority. Gateway drops untrusted authority headers and excludes internal introspection/coordination routes. Private storage, mandatory scanning, sealing, processing fences and bounded signed delivery protect Media. Exact values, safe errors, strict contracts, own runtime credentials and SQL constraints protect integrity. See [Identity context](../../services/identity/src/presentation/http/context.ts), [contracts](../../packages/contracts/src/core.ts) and [Media policy](../../services/media/src/domain/media-policy.ts).

Four live runtime roles are non-owner/non-superuser/NOBYPASSRLS with no create-role/create-database privilege. Zero installed RLS policies were observed. This is a secure service boundary, not tenant isolation.

## Proposed foundations

Authenticate user -> validate tenant membership/lifecycle -> validate company/object capability -> enforce entitlement/activation -> execute scoped persistence. Enforce this inside owning use cases, not only frontend/controller. Platform administration does not confer content access. Break-glass/impersonation is deferred; if requested it needs time bounds, audit and explicit policy.

Resolve public tenant/company only from verified domains; onboarding proves ownership and TLS. Central staff API/binary ingress retains host-only cookies. Never broaden cookie Domain or accept arbitrary origins/hosts for custom-domain convenience. Fail closed on authorization dependency failure. Initially reject new operations after observed suspension and document pre-authorized in-flight completion; immediate zero-window cutoff requires coordinated service fences.

RLS narrows correctly scoped SQL; shared application credentials that can set context remain trusted. Review privileged SQL, policies, views, composite FKs and pooled connections as specified in [tenancy](multi-tenancy.md). RLS is not an independent credential barrier or a substitute for company permissions.

Bind events/jobs/Media/caches/cursors/drafts to captured scope and permission versions. Restrict worker discovery to lease metadata. Separate per-tenant quota/fairness from protected platform totals. Signed storage URLs remain available until expiry unless a delivery proxy enforces revocation. Preserve hashes, byte copies and cleanup state through retries.

## Audit and operations

Record actor, tenant/company, operation, authorization/assignment version, request/event IDs and outcome without secrets, passwords, cookies, action links or raw SQL. Retention policy is unspecified and needs product/legal requirements before design. Authorization state must be authoritative; projections have versioning and defined outage/staleness behavior. No speculative cache/broker/security framework is introduced.

The in-process login limiter is bounded but per-replica. Horizontal scaling requires a measured platform abuse budget and deployment enforcement. Production provider/TLS/sandbox/load acceptance is separate from local fixture tests. Phase 3 must use real restricted credentials and two tenants plus two companies, not owner-role tests that bypass isolation.
