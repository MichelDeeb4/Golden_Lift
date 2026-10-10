# Security architecture and threat model

Owner approved revision target-specification-2026-10-10-v1 and ADRs 030–035 on 2026-10-10. Earlier proposal labels below record the specification origin; approval and bounded deadlines are recorded in [the decision register](../specifications/phase-01-owner-decisions.md). This approval does not certify implementation.

Date: 2026-10-10. Phase 01 proposed controls; none count as implemented. [ADR 033](../../documentation/decisions/033-oidc-and-company-authorization.md).

## Identity, sessions and permissions

Use OIDC Authorization Code with PKCE through the Next.js BFF; validate trusted issuer, signature/algorithm, audience, expiry, nonce/state and exact registered redirects. Bind identity by issuer/subject; do not automatically merge email accounts. The server stores tokens and session state; browser receives a host-only HttpOnly Secure session cookie. Protect mutations with session-bound CSRF and verified Origin. ERP and platform management have distinct audiences and session authorization. MFA/step-up is mandatory for privileged platform, financial approval and recovery actions; provider and assurance policy await owner choice. [OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html) specifies token authentication and claim validation.

OIDC proves identity; central membership proves tenant admission; company grant and permission prove authorized operation; owning module validates resource ownership in the transaction. Deny by default. Platform admin can manage tenants and grants but cannot implicitly read ERP business data. Support access is explicit, time-bounded, company-scoped, audited and owner-approved; unattended impersonation is not an implicit feature.

Authoritative control-plane reads check membership/session permission version and tenant lifecycle on each new operation initially. ERP validates active company and resource scope locally. Revocation rejects subsequent admission. Proposed in-flight policy: an already admitted bounded transaction may complete while its admission remains valid; transfer/maintenance requires local fences and draining. No zero-window distributed revocation guarantee is claimed. Admission lifetime and transaction deadlines need measured approved limits. Control-plane outage denies new operations; previously cached credentials/routes alone do not grant access.

## Threat and control matrix

| Threat / boundary                                             | Required control                                                                               | Executable acceptance evidence     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| Forged JWT, wrong issuer/audience, replayed code, tenant hint | OIDC validation, state/nonce/PKCE, live trusted membership                                     | AUTH-IDENTITY, AUTH-REVOKE         |
| Same-tenant wrong-company privilege escalation                | Explicit company grants + use-case resource checks + scoped DB context/FKs                     | AUTH-COMPANY                       |
| Missing filter/raw query/bulk/count/join/export               | FORCE RLS, WITH CHECK, scoped transaction; no root readers                                     | ISO-RLS, ISO-QUERY                 |
| Owner/superuser/BYPASSRLS/view/SECURITY DEFINER bypass        | Restricted runtime grants; invoker views; reviewed functions/search_path; catalog inspection   | ISO-ROLES                          |
| Pool/context reuse, retry or leaked connection                | Transaction-local scope, same session, bounded pools and reset/error tests                     | ISO-CONTEXT, DB-POOL               |
| Stale routes, revoked access, outage, transfer worker         | Live admission, local generation gates, scoped worker/file leases                              | AUTH-REVOKE, ROUTE-FENCE, TRANSFER |
| Cache/file/report/search cross-scope leak                     | Tenant/actor/company/permission-version keys, server authorization, safe projections           | CHANNELS                           |
| Duplicate event/job/payment after crash                       | Outbox/inbox/idempotency, provider reconciliation and fencing                                  | WORKER, TX-ATOMIC                  |
| Backup/support export/deletion exposure                       | Separate audited authority, encrypted scoped manifests, isolated recovery                      | RECOVERY                           |
| SQL injection/unsafe extensions                               | Parameterized queries, validated identifiers only for operational DDL, no arbitrary tenant SQL | ISO-QUERY                          |
| Credential/runtime compromise                                 | Least privilege, secrets rotation, dedicated isolation, network/process boundaries             | ISO-ROLES, OPS                     |
| Abuse/resource exhaustion                                     | Tenant quotas, bounded request/pool/job queues, platform abuse budget and measured fairness    | DB-POOL, PERF                      |

RLS is defense under trusted application context; shared runtime compromise can choose another tenant's context. This residual boundary must be stated in customer/security documentation. Dedicated storage narrows database credential exposure; it does not replace application/company authorization.

## Files, caches and other channels

File metadata owns tenant/company/resource classification. Object keys use stable tenant-prefixed IDs and content versions; keys and prefixes are never authorization. Private bucket policy blocks anonymous delivery. Upload grants bind authenticated actor, tenant/company, byte/mime limits, lifecycle and generation; scan/canonicalize before READY. Delivery rechecks authorization and returns bounded signed URLs or proxied bytes. Immediate revocation requires proxy enforcement; a signed URL remains usable until expiry. TTL and retention are owner-approved parameters.

Caches include tenant, company permission scope, actor where private, locale and permission/routing version. Cancel in-flight client requests on tenant/company switch and clear old private drafts/results; mutation handlers retain captured scope and cannot apply results to a new selection. Shared public projections require an explicitly approved publication policy, not reuse of staff DTOs. Reports, generated exports, notifications, search and support tools apply the same scopes. No unauthorized recipient list or global operational counts reach a tenant admin.

Queue/job envelope validation rejects missing/untrusted tenant context. Logs omit credentials, JWTs, cookie values, raw SQL parameters and unnecessary PII; audit includes tenant/company/actor/action/resource/result/correlation and permission/routing version. Audit access is scoped, immutable and retention-controlled. Metrics labels are bounded; tenant identifiers are restricted rather than unbounded high-cardinality labels.

## Privileged operations and data policy

Separate migration/provisioning/backup credentials from business API/worker secrets. Credential rotation invalidates cached clients with graceful leased-session draining and generation checks. TLS is mandatory across external/provider traffic and approved internal trust boundaries; encrypt storage/backups with reviewed key access. Production secrets are not copied into development fixtures.

Financial posting/approval, grant changes, exports, provisioning, transfer and recovery require durable privileged audit. Emergency access uses MFA, explicit purpose, expiry and approval evidence; exact dual-control/support-consent policy awaits owner approval. Deletion is a durable retention-aware workflow, not immediate cascades that discard journals, object versions or audit. Data residency, legal retention, lawful tax handling and privacy export obligations remain open and block production policy approval.

Before Phase 05, Phase 04 sensitive APIs exist only behind a real restricted internal principal with authenticated service identity/allowlists or a closed executable test harness. Mock actors and unauthenticated public routes cannot satisfy isolation gates. Remove temporary admission paths from exposed production routes once OIDC is active.
