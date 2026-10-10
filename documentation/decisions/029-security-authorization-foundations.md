# Security and authorization foundations

Date: 2026-10-10. Status: Accepted for existing security constraints. Tenant/company controls: Proposed, unimplemented.

## Problem

Global roles and host-only sessions protect current staff workflows but do not provide tenant/company isolation. UI visibility, RLS alone or broad platform-admin access cannot substitute for owning-use-case permissions.

## Decision and alternatives

Preserve live Identity verification, non-hierarchical roles, Origin/CSRF, host-only secure cookies, private scanning/fenced Media and safe contracts/errors. Propose live tenant/company membership/lifecycle/capability checks plus explicitly scoped persistence/events/jobs/state/bytes. Platform administration does not grant content access. Central staff same-origin API/binary ingress and verified public domains are recommended; broad cookie Domain, arbitrary Host and trusted client tenant headers are rejected.

## Consequences

Define suspension/in-flight and signed-link residual windows; stronger immediate revocation needs additional coordination. Treat RLS context setters and privileged operations as trusted. Test real non-owner roles and wrong/missing scope, not owner-role success. Support impersonation/retention/residency require separate requirements.

## Migration impact

No auth rewrite or security policy implementation in Phase 01. Version contracts and backfill ownership before switching scoped use cases, workers and web state. [Security](../../docs/architecture/security-principles.md), [Phase 3 tests](../../docs/architecture/multi-tenancy.md).
