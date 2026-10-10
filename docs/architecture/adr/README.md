# Architecture decision index

Date: 2026-10-10. This task reuses the established documentation/decisions authority and numbering. The requested ADR-001 through ADR-006 names below are topic aliases, not new competing canonical IDs.

| Task topic                         | Canonical record                                                                  | Status / implemented scope                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ADR-001: neutral identity          | [024](../../../documentation/decisions/024-neutral-platform-identity.md)          | Accepted; source/workspace/local service identity already implemented before this task |
| ADR-002: tenant isolation          | [025](../../../documentation/decisions/025-tenant-isolation-storage.md)           | Proposed; no tenant columns/RLS/storage router                                         |
| ADR-003: tenant/company separation | [026](../../../documentation/decisions/026-tenant-legal-company-separation.md)    | Proposed; no organizational schema                                                     |
| ADR-004: service/module direction  | [027](../../../documentation/decisions/027-service-module-direction.md)           | Accepted current-boundary constraint; future placement remains proposed                |
| ADR-005: DB ownership/integration  | [028](../../../documentation/decisions/028-database-ownership-integration.md)     | Accepted existing rule; no ownership migration                                         |
| ADR-006: security foundations      | [029](../../../documentation/decisions/029-security-authorization-foundations.md) | Accepted current controls; future scoped design proposed and unimplemented             |

The older tenancy audit remains historical rationale. New tenant/legal-company proposals revise its simplification without rewriting that snapshot or changing previous implemented decisions.
