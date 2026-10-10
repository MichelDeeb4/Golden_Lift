# Foundation contracts and failure semantics

Date: 2026-10-10. Proposed Phase 01 contract design, not implemented endpoints or tables.

## Authoritative control-plane data

| Record                | Required fields / constraints                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity association  | id, oidc_issuer, oidc_subject; unique issuer/subject; status and session/security version                                                                      |
| Tenant                | id, lifecycle, lifecycle_version, subscription reference, approved policy reference                                                                            |
| Tenant membership     | tenant_id, identity_id, status, permission_version; unique tenant/identity; explicit admin permissions                                                         |
| Company grant         | tenant_id, company_id, identity_id, permission set, version, validated Organization revision; membership dependency                                            |
| Storage assignment    | id, tenant_id, mode pooled/dedicated, trusted database reference, route_generation, compatible schema range; exactly one admitted assignment per active tenant |
| Database fleet record | id, mode, credential reference/version, migration version/checksums, readiness/failure and observed capacity                                                   |
| Workflow              | id, type, tenant_id, idempotency key/request hash, state, expected generations, checkpoint/resource receipts, error/attempt                                    |
| Entitlement           | tenant_id, capability, effective state/version and approved limits; live owning-use-case enforcement                                                           |
| Privileged audit      | actor/action/target/tenant/company, decision/permission version, correlation, result and immutable occurrence timestamp                                        |

Membership/grant and assignment changes have optimistic versions and durable outbox/reconciliation. There are no ERP company FKs in the control database. Company grant validation calls Organization's authenticated ownership query; access checks still require active owned company locally. Control-plane runtime grants do not authorize arbitrary cross-tenant ERP data.

## Admission and routing contract

Internal POST /internal/v1/admissions accepts an authenticated audience-bound service principal and verified end-user session reference, requested tenant/company hints and operation capability. It returns an opaque admission handle or a strictly validated context: identityId, tenantId, authorizedCompanyIds, permissions, membershipVersion, lifecycleVersion, routingGeneration, admissionId, expiresAt and audience. Sensitive credentials are never returned to browsers. The verifier rejects unsupported issuer/audience, missing membership, inactive lifecycle, stale permission version and incompatible schema.

Internal storage resolution binds admissionId, tenantId and routingGeneration and returns assignmentId, mode, databaseReference, credentialReference/version and schema compatibility. Only authorized runtime infrastructure dereferences the secret. Public REST input cannot override these fields. Admission and route lookup are separate reads of authoritative state with version validation; local ERP gates prevent a stale successful lookup from committing during freeze/cutover.

Company operations use one explicitly selected company or a reviewed permission set for authorized intercompany/reporting. Tenant-shared commands require a separate master-data permission, not a fabricated company ID. The transaction context carries tenant, actor, allowed companies, membership version and generation. Local company/resource validation and RLS constraints remain mandatory.

Error contract: code, safe message, correlationId and optional retryAfter; no connection URLs, secrets, SQL, foreign tenant IDs or unauthorized resource-existence clues. FORBIDDEN/NOT_FOUND behavior is consistent for unauthorized resource probes. ROUTING_STALE or DEPENDENCY_UNAVAILABLE triggers fresh admission; it never retries on a caller-selected database.

## ERP persistence and asynchronous records

Every tenant-owned table has tenant_id; company-owned rows add company_id. The complete ownership key is present in relationships. Outbox, inbox, audit, jobs, idempotency and file metadata are part of the tenant recovery graph. Any future exception needs explicit ownership classification and isolation proof.

Outbox: tenant_id, message_id, company_id where company-owned, aggregate_id/version, schema_version, event_type, occurred_at, payload, publication state and lease token/deadline. Inbox: tenant_id, consumer_name, message_id unique, processed_at and result/source receipt. Idempotency: tenant_id, company/scope, operation, key, request_hash, result and committed version. Job: tenant_id, company/scope, job_id/type, durable state, attempt, generation-bound lease token/deadline, resource references and retry/dead-letter state.

File metadata: tenant_id, company/scope, resource_id, classification, key/content version, byte length/hash, scan status, lifecycle and generation-bound publisher receipts. S3 signed upload expiration cannot be recalled by a registry row change; freeze drains or waits for accepted capabilities and prevents metadata/final-byte publication through a fenced workflow. Staging bytes are quarantined and excluded from admitted business delivery until validated.

ERP target event envelopes are distinct from legacy EventEnvelope v1. Define published per-event schemas before implementation. Unknown schema versions and missing tenant/company context are rejected; dead-letter/reconciliation is explicit rather than an unscoped fallback.

## Operational commands and transitions

Provision(tenantId, requestId, policyVersion) returns workflowId/state; retry returns the same resource receipts. Suspend/activate/transfer require expected lifecycle/assignment versions and privileged audit. Transfer(sourceAssignment, expectedGeneration, destinationMode=dedicated) uses durable frozen snapshot/copy/verify/CAS/activate checkpoints. Restore requires approved recoveryPoint, backup/object manifests and a destination readiness review; cleanup requires separate acceptance and retention authority.

Fleet migrations record the canonical checksum/version and per-database status before readiness. Schema mismatch rejects business admission. Credential rotation records new version, drains old leased pools and revokes old credentials after validated handover; immediate compromise handling may close sessions under an explicitly authorized incident procedure.

No operational command implies atomic control-plane + ERP + object-provider commit. Each returns durable progress and bounded safe errors; workers reconcile observed resources with expected receipts after interruption.

[Acceptance scenarios](phase-01-acceptance.json) specify actual PostgreSQL/API/browser/worker failure tests for these contracts. Phase-specific implementation must produce reviewed OpenAPI/schema artifacts and executable tests rather than treating this document as implemented behavior.
