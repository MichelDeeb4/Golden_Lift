# Proposed tenant isolation

Date: 2026-10-10. No tenant columns, memberships or RLS policies were implemented. These are future controls and Phase 3 acceptance requirements.

## Trusted context

Use explicit tenant ownership in each owning service DB and company scope on company-bound records. Global identity/platform tables use narrow separate authority. Company ID must belong to the resolved tenant and the actor's permitted company set. Public access maps a verified host/domain to tenant and storefront company/catalog; arbitrary Host or x-tenant-id is never authority.

Authenticate session, resolve trusted tenant selection, verify live membership/lifecycle/company permissions, then capture immutable tenant/company/actor/authorization-version/storage-assignment context. Unknown, missing, suspended, malformed or unauthorized scope fails closed; never default to the legacy company. Owning use cases authorize objects/modules in addition to transport authentication. Start with live authority checks and define already-authorized in-flight semantics and bounded signed-link availability.

Context ends with the operation. AsyncLocalStorage may carry tracing later, but cannot replace explicit scope and transactions. Events are untrusted until producer/schema/signature/scope/aggregate ownership checks succeed.

## Prisma and pooled connections

The future UoW starts a Prisma interactive transaction. Its first parameterized operation sets transaction-local scope on that connection. All repositories, counts, cursors, projections, outbox and raw SQL use that transaction client. Each retry recreates local context and applies the defined authorization recheck policy. Root readers and raw pg storage-lock paths need equivalent scoped transactions; setting context on a pool before a Prisma transaction is unsafe.

Local settings end at commit/rollback. Never use session SET, tenant search_path, assumed connection affinity or a request-local object as proof of database context. Preserve isolation, deferred constraints and bounded timeouts. External HTTP/mail/files stay outside retry callbacks. Missing context denies access. Global queries/worker discovery use explicit narrow authority. See [Prisma transactions](https://www.prisma.io/docs/orm/fundamentals/transactions) and [PostgreSQL local configuration](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET).

## RLS and integrity

Scope SELECT/UPDATE/DELETE predicates and INSERT/UPDATE checks. Review grants, owner-context views, every SECURITY DEFINER function, search_path, trigger scans and singleton write gate. Runtime credentials remain non-owner/non-superuser/NOBYPASSRLS with no migration privileges. Evaluate FORCE RLS and safe view/function execution; they cannot neutralize a superuser, BYPASSRLS or unsafe definer.

Tenant-inclusive keys/FKs are mandatory. Company associations also enforce company equality, or explicitly reference authorized tenant-owned definitions. Uniqueness matches ownership; safe conflict mapping avoids existence leaks. PostgreSQL documents privileged/owner bypass and referential-check bypass. [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html). RLS is defense in depth under trusted application context; company/object authorization remains necessary.

## Jobs, events, state and bytes

Strict v1 envelopes lack scope; adding fields requires versioned contracts. Drain or translate only ownership-proven legacy records; preserve scoped inbox/outbox/idempotency. Worker discovery may expose narrow lease metadata under reviewed authority; payload execution captures tenant/company/assignment and rechecks lifecycle/fence before publish/cleanup. No broad BYPASSRLS worker is proposed.

Query/cache/cursor/draft/history/idempotency keys include tenant, applicable company and actor/permission scope. Switching cancels work; mutation results apply only to captured scope. Media keys/manifests/grants/usage/uploads/jobs/delivery bind tenant+company+owner. Preserve old bytes/key maps until copy/hash parity. Separate tenant quotas/fairness from privileged platform capacity totals. Signed URLs retain bounded residual access unless proxy enforcement supplies immediate revocation.

## Phase 3 isolation tests

| Area               | Required negative, concurrency and recovery evidence                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authority          | Two tenants, two companies within one tenant, multiple/single memberships, forged headers/hosts/IDs, platform admin without content membership, suspension/revocation and authority outage |
| SQL runtime roles  | Missing/wrong context reads/writes/counts/joins/raw SQL; scoped unique/FK failures; functions/views/triggers; no privileged test masking                                                   |
| Pools/transactions | Alternating scopes on one connection, concurrent requests, rollback/commit failure/retry/cancellation; root readers and storage fences; no leaked context                                  |
| Async              | Wrong-scope signed events, legacy replay, duplicate delivery, dead letters, stale leases/assignments, scoped discovery and cleanup                                                         |
| Web                | Switch company/tenant during queries/mutations/uploads; stale callbacks/drafts/history/cursors/grants/multi-tab sessions; no private state retained                                        |
| Media              | Wrong owner/host/grant, retained sources, byte isolation, independent copies, physical cleanup retries, quota fairness and expiry                                                          |
| Recovery           | Fresh/upgrade parity, ambiguous backfill refusal, retained evidence, all-service/object restore, dedicated assignment cutover fencing                                                      |

A second tenant/company must not activate before all applicable gates pass. Current single-company tests do not establish isolation.
