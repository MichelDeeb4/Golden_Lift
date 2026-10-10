# Greenfield architecture authority

The owner-selected [plan.md](../../plan.md) and [master implementation prompt](../../implementation-prompt.md) now govern the target. The new Phase 01 specification is separate from the historical repository normalization phase below. The owner approved revision target-specification-2026-10-10-v1 and ADRs 030–035 on 2026-10-10. [Phase 02 execution and gate evidence](../implementation/phases/phase-02.md) tracks the authorized greenfield engineering implementation.

| Target specification                                 | Purpose                    |
| ---------------------------------------------------- | -------------------------- |
| [system-architecture.md](system-architecture.md)     | New target Phase 01 design |
| [tenancy-architecture.md](tenancy-architecture.md)   | New target Phase 01 design |
| [erp-domain-model.md](erp-domain-model.md)           | New target Phase 01 design |
| [transaction-design.md](transaction-design.md)       | New target Phase 01 design |
| [security-architecture.md](security-architecture.md) | New target Phase 01 design |
| [engineering-standards.md](engineering-standards.md) | New target Phase 01 design |

[Canonical ADRs](../../documentation/decisions/README.md) · [Acceptance specifications](../specifications/phase-01-acceptance.md) · [Owner decisions](../specifications/phase-01-owner-decisions.md) · [New phase evidence](../implementation/phases/phase-01.md).

---

# Business Platform architecture baseline

Date: 2026-10-10. Phase 01 is repository normalization and architecture analysis. The target is a configurable SaaS ERP platform; the running application remains a single-company Catalog with global staff Identity, Media, Gateway and an Inquiries foundation. Tenant, organization and ERP modules are not implemented.

## Documentation authority

This directory owns the current ERP direction and Phase 01 evidence. The existing [engineering guide](../../documentation/architecture.md) owns implemented layers and patterns; [operating guides](../../documentation/operations/local-development.md) own runnable procedures. ADRs stay in the established documentation/decisions sequence. The [ADR index](adr/README.md) maps the six requested topics to those canonical records, avoiding competing decisions.

The earlier [tenancy audit](multi-tenancy/01-current-architecture-audit.md) remains dated evidence. Its company-equals-tenant assumption and phase numbering do not govern this ERP hierarchy. Here a tenant can contain multiple legal companies. Phase 2 means foundation preparation; Phase 3 means isolation implementation and acceptance. Older source references must be revalidated before implementation.

| Document                                        | Purpose                                                         |
| ----------------------------------------------- | --------------------------------------------------------------- |
| [Current state](current-state.md)               | Confirmed implementation and runtime observations               |
| [Service inventory](service-inventory.md)       | All current services, interfaces, dependencies, tests and risks |
| [Dependency map](dependency-map.md)             | Source direction, runtime integration and transactions          |
| [Target architecture](target-architecture.md)   | Options, recommendation and future storage routing              |
| [Multi-tenancy](multi-tenancy.md)               | Proposed context/RLS and Phase 3 isolation tests                |
| [Organizational model](organizational-model.md) | Tenant, company and narrower organization/access concepts       |
| [Module boundaries](module-boundaries.md)       | Proposed module ownership, contracts and delivery dependencies  |
| [Data ownership](data-ownership.md)             | Current persistence and proposed scope                          |
| [Security principles](security-principles.md)   | Existing controls and future security gates                     |
| [Migration strategy](migration-strategy.md)     | Staged transition, compatibility and recovery                   |
| [Technical debt](technical-debt.md)             | Evidence, impact and remediation                                |
| [Roadmap](roadmap.md)                           | Approval and delivery gates                                     |
| [Phase 01 report](phase-01-report.md)           | Naming matrix, changes, checks and handoff                      |

Accepted records describe existing naming and ownership constraints. Proposed records require review before implementation. Documentation is not a deployed security control.
