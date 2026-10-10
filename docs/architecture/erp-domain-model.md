# ERP domain ownership and company sharing

Owner approved revision target-specification-2026-10-10-v1 and ADRs 030–035 on 2026-10-10. Earlier proposal labels below record the specification origin; approval and bounded deadlines are recorded in [the decision register](../specifications/phase-01-owner-decisions.md). This approval does not certify implementation.

Date: 2026-10-10. Phase 01 proposed specification. [ADR 032](../../documentation/decisions/032-erp-ownership-and-transactions.md) records boundaries. No ERP entities have been implemented.

## Ownership matrix

| Context                                       | Aggregate/data authority                                                    | Scope and published operations                                                                         | Phase |
| --------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----- |
| Platform tenants/provisioning/storage-routing | Tenant, assignment, workflow, migration fleet state                         | Control-plane; admit/resolve/fence/provision/transfer                                                  | 03–04 |
| Platform subscriptions/entitlements           | Subscription, plan, effective capabilities                                  | Control-plane; grant/revoke capability; no invoice ledger authority                                    | 07    |
| Identity-access                               | OIDC subject association, memberships, grants, permission/session versions  | Global identity + tenant/company grants; admission/authorize/revoke                                    | 05    |
| Organization                                  | Legal company, branch, operating unit, department, cost center and policy   | Tenant-owned company; company-scoped subordinate entities; validate ownership                          | 06    |
| Business partners                             | Party identity/contact and company account profiles                         | Tenant-shared party + explicit company applicability; AR/AP balances owned by Accounting               | 09    |
| Product catalog                               | Product, variant, units, attributes and applicability                       | Tenant-shared definitions; company activation; no stock balance                                        | 09    |
| Pricing-tax                                   | Price list, tax configuration, effective rates/rules and rounding           | Company-owned fiscal rules/prices; shared immutable reference currencies/units only by explicit policy | 09    |
| Accounting                                    | Chart, ledger, fiscal period, journal, dimensions, AR/AP obligations        | Company-owned; post/reverse/close period; exact balanced entries                                       | 10    |
| Inventory                                     | Warehouse, stock location, movement, reservation, stock count and valuation | Company-owned; receive/issue/reserve/transfer/adjust/value                                             | 10    |
| Purchasing                                    | Vendor order, receipt and purchase invoice workflow                         | Company-owned; approve/receive/invoice/return                                                          | 11    |
| Sales                                         | Customer order, fulfillment and sales invoice workflow                      | Company-owned; approve/fulfill/invoice/return/credit                                                   | 11    |
| Payments-banking                              | Payment instruction, allocation, bank account and statement reconciliation  | Company-owned; authorize/settle/reconcile; Accounting posts journals                                   | 11    |
| Reporting                                     | Authorized projections and export jobs                                      | Derived tenant/company scope; no source-table ownership override                                       | 12    |
| Integrations                                  | External endpoint credentials, mappings and delivery receipts               | Tenant/company-scoped adapters; versioned inbound commands/outbound events                             | 12    |

Organization owns the company and branch identity. Inventory alone owns warehouses and detailed locations, referencing Organization's company/branch keys through published contracts and ownership-safe constraints. Plan Phase 06's warehouse wording means ownership contracts at that phase; stock entities/movements are Phase 10 per the master prompt.

## Identity and organization distinctions

A user is identified by (OIDC issuer, subject), not email. Tenant membership grants admission, not all-company authority. Company membership defines permitted company IDs/actions. Company belongs to one tenant; branches belong to a company; departments and operating units follow declared company policy. Cost centers are company financial dimensions. Warehouses and locations are stock ownership structures, never substitutes for legal companies or tenants.

The control plane stores authoritative memberships referencing ERP company IDs, with authenticated company validation and versioned reconciliation. ERP checks the selected company is active and owned by the tenant in the transaction. No cross-database foreign key is assumed. Delete/deactivate company is coordinated with grant revocation and financial/stock blockers; failure is reconciled while access remains denied.

## Sharing rules and constraints

Tenant-shared party/product identity is visible only with its explicit master-data permission. A company profile/activation links (tenant_id, company_id, master_id) to both legal company and shared master using same-tenant keys. Stock and financial documents require that activation. Sharing identity does not share balances, prices, taxes, payment terms or document sequence. Company users lacking master-data editing capability cannot alter another company's applicability or tenant-shared definitions.

Currencies and unit reference codes can be platform immutable templates copied/versioned for use; writable business definitions remain tenant-owned. Company tax jurisdiction, fiscal calendar, chart, base currency, prices and bank accounts are company-owned. Cross-company reporting requires a permission for every included company, filters each fact accordingly and exposes no unauthorized totals. Consolidation/currency elimination rules are a separate explicit release requirement, not inferred from multi-company support.

Composite constraints enforce tenant and company graph equality; parent companies cannot be moved across tenants. A branch/location cannot be relinked across companies once referenced by stock/financial history. Intercompany transactions create separately balanced company journals and explicit paired company documents with one authorized correlation; they are never a cross-company stock mutation pretending ownership stayed constant.

## Aggregate invariants and state models

Master records: DRAFT → ACTIVE → INACTIVE/RETIRED. Existing usage blocks destructive deletion; applicability changes require impact checks. Products/variants have stable IDs and exact units/quantity precision. Attribute customization is bounded typed metadata, no per-tenant business-schema forks or arbitrary SQL. Lot/serial and unit conversion requirements need owner release scope; unsupported behavior must be rejected.

Accounting journals: DRAFT → APPROVED (where required) → POSTED. POSTED cannot be edited/deleted; reversal is a linked new balanced journal in an open period. Every line has one company, valid account/dimensions and exact debit/credit; posting balances in functional currency under approved rounding. Fiscal calendars/closed periods and duplicate source posting are guarded in DB and use cases. Currency precision, FX source and jurisdiction rounding are owner decisions. Recommended exact storage uses numeric decimal representations with reviewed bounds; binary floating point is forbidden for money or stock quantities.

Inventory: movements are immutable, attributable to one company/product/location and business source; signed quantities drive stock projections. Reservations consume available stock under locks; counts/adjustments require permission and reason. Warehouse transfer within a company pairs issue/receipt atomically. Cross-company movement is an intercompany business workflow, not a location change. Recommended initial negative stock policy is deny; valuation choice (weighted average or FIFO), backdating and lot/serial scope require approval before Phase 10.

Orders: DRAFT → APPROVED → PARTIALLY_FULFILLED/RECEIVED → FULFILLED/RECEIVED → CLOSED; explicit cancellation only before irreversible effects or through compensating documents. Invoices use DRAFT → APPROVED → POSTED → PARTIALLY_SETTLED → SETTLED; voiding posted invoices requires credit/reversal. Returns and refunds reference the original quantities/amounts and cannot exceed authorized outstanding totals. Purchasing/Sales own document progression; Accounting owns liability/receivable and journal posting; Inventory owns physical/valuation changes.

Payments: DRAFT → AUTHORIZED → SUBMITTED → CONFIRMED/FAILED/UNKNOWN. External uncertainty never triggers blind repeat payment. Reconcile by provider reference and idempotency; business settlement and Accounting posting are atomic after verified confirmation. Bank statement matching preserves immutable source evidence.

## Future boundaries

Manufacturing consumes products and publishes authorized stock/ledger orchestration; POS consumes Sales/Payments contracts; HR/payroll publishes authorized journals; assets/projects use Accounting dimensions and product/partner contracts; CRM links parties but cannot rewrite orders. Integrations cannot import domain internals or bypass company admission. These are extension boundaries, not delivered modules.
