# Transaction and event design

Owner approved revision target-specification-2026-10-10-v1 and ADRs 030–035 on 2026-10-10. Earlier proposal labels below record the specification origin; approval and bounded deadlines are recorded in [the decision register](../specifications/phase-01-owner-decisions.md). This approval does not certify implementation.

Date: 2026-10-10. Phase 01 proposed specification. One tenant ERP database transaction can coordinate module-owned commands; there is no atomic control-plane/ERP or database/provider transaction. [ADR 032](../../documentation/decisions/032-erp-ownership-and-transactions.md).

## Transaction/event matrix

| Workflow                      | Orchestrator and participating owners                                        | Atomic database result                                                   | After-commit effects                     |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| Activate product for company  | Product catalog + Organization validation                                    | Product applicability/version + audit/outbox                             | Cache/index invalidation                 |
| Approve sales order/reserve   | Sales → Inventory reservation port                                           | Order approval, valid company stock reservation, idempotency             | Confirmation event                       |
| Purchase receipt              | Purchasing → Inventory → Accounting                                          | Receipt, movements/valuation, approved accrual journal, source link      | Receipt event/notification               |
| Sales fulfillment             | Sales → Inventory → Accounting                                               | Shipment, stock issue/cost valuation, COGS journal as configured         | Dispatch event                           |
| Post customer/vendor invoice  | Sales/Purchasing → Pricing-tax → Accounting                                  | Frozen tax/price snapshot, balanced journal, AR/AP obligation            | Invoice rendering/delivery               |
| Customer return/vendor return | Sales/Purchasing → Inventory → Accounting                                    | Accepted return, movement/valuation, reversal/credit obligation          | Return notification                      |
| Confirm payment/allocation    | Payments-banking → Accounting                                                | Confirmation receipt, allocation, journal, invoice balance version       | Remittance notification                  |
| Stock count adjustment        | Inventory → Accounting                                                       | Reviewed count, immutable adjustment/valuation/journal                   | Audit and adjustment event               |
| Within-company transfer       | Inventory                                                                    | Matched issue/receipt + location balances                                | Movement event                           |
| Intercompany transaction      | Authorized application orchestration → Sales/Purchasing/Inventory/Accounting | Both company documents and separately balanced journals in one tenant DB | Correlated business events               |
| Tenant provision/transfer     | Platform durable workflow                                                    | Local checkpoints separately in control/source/destination DBs           | Reconciliation; no cross-DB atomic claim |
| External bank payment         | Payments durable workflow + provider adapter                                 | Intent/idempotency/outbox locally; confirmation separately committed     | Provider reconciliation before retry     |

Intercompany permissions must cover both companies. Amounts/currencies and counterpart matching rules require explicit policy; unavailable cross-tenant intercompany is rejected rather than attempting cross-database ACID.

## Unit of work and concurrency

An application orchestrator owns one transaction session containing trusted tenant/company/actor/generation context. It calls each participating module's published command port with that session; adapters retain table ownership. Domain code knows no NestJS, ORM, HTTP or sibling repository. Nested participants cannot start/commit independent transactions. Failure in any participant rolls back business records, ledger/stock, outbox, audit and idempotency receipt.

Acquire tenant gate shared lock and validate local generation first. Lock business roots in deterministic module/key order, then periods, numbering sequences, stock buckets/reservations and posting source keys under a documented order. Every workflow's design must specify its lock set. Use row locks and uniqueness for hot balances and source postings; SERIALIZABLE for invariants spanning query sets when required. Retry the complete transaction on documented serialization/deadlock failures with a bounded deadline and fresh authorization if admission expires. No provider request, object upload or message publish is inside a retry callback.

Idempotency scope is (tenant, company or tenant-shared scope, operation, key). Store canonical request hash and final result atomically with changes. Same key/hash returns the authorized result; different hash returns safe conflict. Concurrent duplicate requests produce one business effect through locking/uniqueness. Uncertain commit is reconciled via receipt, not replayed unconditionally. Exact Decimal/BigInt values cross API boundaries as strings; DB timestamps preserve required precision.

Document numbers are company/document-type/fiscal-period scoped, with uniqueness and locked allocation. Whether legal numbering must be gapless and how void numbers are retained is a jurisdiction decision. No claim of gapless numbering follows from a sequence.

## Ledger and stock integrity

Posting validates open fiscal period, account status/dimensions, company ownership, approved exchange rate and exact zero journal imbalance at configured precision. DB guards reject post mutation and unbalanced final posting state; deferred validation may check whole journal at commit. Journal source uniqueness prevents double posting. Reversal creates inverse entries and source linkage; closed-period correction follows approved accounting policy.

Stock issue locks company/product/location valuation buckets and reservations, checks availability, appends immutable movement and updates projection atomically. Valuation and financial journal commit with the movement where required. Quantities, conversions, unit precision and price/tax rounding are explicit; overflow/truncation rejects instead of silently rounding. Reconciliation compares authoritative movement and journal source references against derived balances; fixing a discrepancy uses an audited adjustment, never rewriting posted history.

Fault tests fail after every module write and immediately before commit. Race tests run concurrent reservations, receipt retries, period closing/posting and competing invoice payments, asserting conservation, one posting and safe conflicts.

## Outbox, inbox and job execution

Events are at-least-once. Append tenant/company-scoped envelope in the business transaction; lease publication with bounded retries, acknowledgement and durable failure state. Consumer inbox unique (tenant, consumer, message_id) commits with local effects. Do not claim exactly-once transport. Notifications, object rendering and search updates are asynchronous and cannot become the business commit.

Workers discover only bounded lease metadata using narrow operational authority, then resolve current tenant assignment and execute payload through scoped admission/transaction. Job leases bind tenant, generation and fencing token; stale workers cannot commit DB changes or publish file effects after transfer/freeze. Context is reset for every tenant and every retry. DLQ stores minimal scoped references, not secrets or arbitrary business payload logs.

Control-plane membership/company projection events include monotonic version; duplicate/out-of-order application cannot restore revoked permissions. Reconciliation checks authoritative state, not blind event delivery. Queues are delivery infrastructure; ERP jobs remain durable database records recoverable across broker outage.

## External effects and operational failure

Payments use provider-supported idempotency and recorded request/reference; UNKNOWN stays pending reconciliation. Emails may duplicate at provider boundary unless provider idempotency exists; disclose that behavior and never duplicate business settlement. S3 uploads use staged keys, byte hashes and authenticated generation-bound manifests; finalize metadata only after validation. Cleanup uses durable tombstones and fences to prevent stale writers resurrecting objects.

Schema incompatibility, dependency timeout, revoked admission, routing mismatch or pool overload returns a safe retryable/unavailable error before unapproved effects. Audit failure for privileged/financial operations rolls back the local operation; telemetry outage is bounded and cannot block all transactions indefinitely. Recovery restores inbox/outbox/idempotency together and reconciles external effects before releasing jobs.
