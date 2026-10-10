# 023 — Admin interface consistency

Date: 2026-10-10

## Problem

Admin shell, workspace and collection selectors competed for section spacing, table density and Media sizing. Normal shared buttons omitted the existing flex-label class, stacking icons and text. This affected every consumer of the primitive.

## Decision

Keep the existing shared UI components, live API contracts, query ownership, reviewed mutations and authorization. Apply the label class in every button state and define control, icon, table and shell dimensions in the tokens package. Admin styles own shell, collections, forms and Media; workspace styles own editors and dashboard composition; Category tree styles own recursive navigation. Remove overlapping broad section and forced Media rules.

A separate Admin component library would duplicate established controls and focus behavior. Per-page button patches would leave the faulty shared primitive active. Neither solves the demonstrated ownership problem.

## Compatibility and data impact

There is no schema migration or business-policy change. Existing numbered and keyset pagination, version/schema conflicts, CSRF/session verification, dirty guards and permanent deletion remain authoritative. The existing read contracts add bounded Unit Attribute counts and exact staff updated timestamps from their owning databases. Actual account role and Unit symbol are displayed. No mutation policy changes.

Shared controls also serve the visitor site, so public browser checks accompany Admin verification. Fixture services use isolated ports and disposable databases, leaving normal local development services running. Visual evidence and acceptance are recorded in the completion report after verification.


## Read metadata tradeoffs

Unit counts aggregate live Attribute references only for the current page's Unit codes, following Group metadata. A query per row or deletion-impact calls would create needless request/transaction work. Counts stay decimal strings. Identity extends its existing PostgreSQL timestamp projection to updated_at; converting through JavaScript Date would lose microseconds. Both reads stay in their owning repository/transaction context and require no schema migration. Shared DTO/client schemas and the authoritative OpenAPI document switch together.
