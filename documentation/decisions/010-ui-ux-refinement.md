# 010 — Shared composition and workflow-oriented editors

Date: 2026-10-06. Status: implemented.

## Problem and decision

The working public catalog and staff workflows had weak hierarchy: repeated equal grids, database-like field order, simultaneous translation grids and many equally weighted actions. Refine presentation within the existing token/UI packages and service contracts.

Add shared page headers, labeled form sections, persistent action bars and overflow actions. Keep the existing buttons, fields, keyboard tabs, browser dialog/drawer implementation and Catalog/Media adapters. The public shell uses a 45/55 framed hero, mixed category grid, larger product imagery and aligned technical specifications. Staff editing starts with context, then content, specifications, Media and publication.

## Tradeoffs and preserved behavior

- Language panels stay mounted while hidden, retaining React Hook Form drafts. Arabic validation reopens its panel. Unique tab/panel IDs prevent collisions in nested editors.
- Product basics, Media and publication retain separate mutations and version checks. A unified visual action pattern does not imply an atomic all-section save.
- Staff account overflow selections capture the reviewed account/version before confirmation. Refetches cannot silently change the confirmed version.
- Media is presented by kind, but earlier/later controls operate on the existing global association order. Detachment retains the asset.
- Overflow actions use ordinary buttons/links in a labeled group, with Tab and Escape behavior; no incomplete ARIA menu interaction contract is advertised. Viewport positioning prevents table-scroll clipping.
- Optional overlay classes let staff dialogs/drawers retain their compact density after React portals move them outside the staff shell. They consume the same tokens and components.
- Existing contracts do not supply short descriptions, public specification group labels, global active-product totals or a full public collection/search API. No invented fields, groupings, totals or backend redesign are introduced.

No new dependency, database migration, API contract or backend implementation is required. Lazy private previews, query caching and bounded pagination remain intact. See the [completion report](../implementation/ui-ux-refinement-completed-work.md) for executed verification and limitations.
