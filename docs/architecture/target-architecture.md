# Proposed target architecture

Date: 2026-10-10. ERP direction is proposed; the current service boundaries remain accepted and implemented. Phase 01 introduces no service, schema or storage-routing adapter.

## Arrangement options

| Option                                                     | Benefit                                                                              | Cost and repository fit                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Keep existing services                                     | Reuses isolated databases, ports, live Identity, transactions and Media coordination | Multiple processes/pools and eventual consistency; existing ownership works. Recommended starting point                                |
| Consolidate selected functionality into a modular monolith | Simpler operation and possible local transactions                                    | Database/auth/event migration and an exception to standing boundaries require explicit approval. No demonstrated need justifies it now |
| Small coarse services with internal ERP modules            | Avoids a deployment per noun and preserves cohesive transactions                     | Future ERP modules need approved owners; finance must not be silently added to Catalog. Recommended evolution                          |
| Extract services later                                     | Independent scaling/team/security ownership                                          | Contract/data/operations cost; extract only for demonstrated needs                                                                     |

Retain Identity, Catalog, Media, Inquiries and Gateway. Plan future ERP capabilities as cohesive modules within an explicitly approved coarse arrangement. Do not assume each module is a microservice or preassign Accounting to an existing owner merely to avoid a future decision. See [direction ADR](../../documentation/decisions/027-service-module-direction.md).

## Proposed foundation

Identity remains global user/session authority. A focused access/control-plane module should own registry, lifecycle, memberships and trusted domain/storage assignments, subject to Phase 2 review. Organization owns legal companies and organizational relationships; access consumes validated identifiers via contracts. Subscription/entitlement administration is distinct from ERP customer invoicing. New dependencies use public interfaces/events, never another service's database.

Default storage means shared tenant tables with RLS **inside each owning service database**, not one shared database across services. Tenant and company are separate scopes. Tenant-prefixed tables create per-customer DDL/query variants; schema-per-tenant multiplies provisioning/migration and search_path complexity. Dedicated storage strengthens credential isolation but adds pools, migrations, recovery and operations. No specific residency/dedicated-database requirement has been supplied.

## Optional dedicated storage

Proposed assignment: tenant ID -> versioned registry assignment -> per-service storage target and credential reference. Resolve after trusted authorization, capture assignment version, and select a bounded service-owned pool. Never accept a client connection string, database name or schema. Gateway has no business pool; domain/application use scope and ports. A dedicated tenant receives coordinated service-owned targets; database ownership does not change.

Future migration freezes that tenant's writes/jobs, drains processing to an agreed checkpoint, backs up all service data and object manifests, copies exact scoped data/evidence/bytes, verifies ownership/constraints/hashes, switches the authoritative assignment version and rejects stale work. Other tenants retain their assignment. Before new writes rollback can restore the prior assignment; afterward it requires reviewed restore/reconciliation. Old copies remain quarantined until retention/contraction approval. No router or dedicated migration is implemented here.

## Limits

RLS catches missed filters under trusted application context. A compromised shared application credential that can set scope still has broad authority; stronger credential isolation may require dedicated databases. Company authorization is mandatory within a tenant. Runtime feedback, retained evidence, language policy, worker fences and public domains are release gates, not solved by adding a tenant column.
