# Admin scrolling and pagination baseline

Date: 2026-10-08. Captured before source edits with real Identity/Gateway/Catalog services and disposable PostgreSQL: 63 attributes and 26 groups. Normal project writers were paused; normal data was untouched.

## Confirmed cause

Both `/admin/attributes` and `/admin/attribute-groups` render `.gl-master-detail.gl-configuration-list` as a single-column grid. Its table is still an entire sticky `.gl-master-list` (`top:100px`), followed by the old `.gl-detail-canvas`. At the document bottom, the sticky list overlaps the next grid row. The apparent floating dark line is the detail canvas's **2px solid rgb(125,133,139) top border**; “Choose — Attributes/Attribute groups” is its ordinary paragraph. Neither is independently fixed/sticky. Removing global borders or changing z-index would hide the symptom without repairing the layout.

Computed top-state values: document/body use primary vertical scrolling; body overflow-x hidden/overflow-y auto. Admin/top/content have no transforms or containment. Command bar is sticky at top 0, z-index 100, height 68px. Attributes list is sticky top 100, z-index auto, overflow visible, height 2067px; its table/header are static. Empty detail canvas is static, min-height 520px, with the offending border and caption. Groups independently show the same structure (document height 3203px versus 3377px for Attributes). On mobile the old master list adds max-height 260px/overflow auto, a second vertical scrolling area.

The primary document scroll and existing command bar/sidebar remain appropriate. Configuration collections need a normal-flow table, an optional selected-record details panel, no empty master/detail canvas, and a horizontal-only table wrapper with unconstrained vertical height. Product editor rails, Category tree branches and modal/drawer scroll are intentional separate contexts and must remain scoped.

## Pagination audit

| View | Existing server mode | UI defect |
| --- | --- | --- |
| Attributes/groups/units | resource-bound ID/code cursor, max 100 | fixed 25, Next only, local page filters, no total or URL page |
| Products | filter-bound ID/manual-order cursor, max 100 | fixed 25, Next and first-page reset, URL filters |
| Media | ID cursor with kind/status, max 100 | Next derived from last returned row even on final page; local filename filter |
| Super Admin accounts | created-at microsecond/ID cursor, max 100 | fixed 25, Next only, local cursor |
| Categories | hierarchical branch cursors | intentional bounded lazy loading, not an offset table |

The implementation will retain cursor APIs for existing clients and cursor-driven Products/Media/accounts, add filtered bounded numbered pages for configuration collections, and share accessible controls/URL state. Counts and filters must be owning-service queries, never an all-record client download.

## Before evidence

- Attributes: [top](../assets/admin-scroll-pagination/before/attributes-top.png), [middle](../assets/admin-scroll-pagination/before/attributes-mid.png), [overlap at bottom](../assets/admin-scroll-pagination/before/attributes-bottom.png).
- Groups: [top](../assets/admin-scroll-pagination/before/attribute-groups-top.png), [middle](../assets/admin-scroll-pagination/before/attribute-groups-mid.png), [overlap at bottom](../assets/admin-scroll-pagination/before/attribute-groups-bottom.png).

Full selector/style measurements are retained in the [dated baseline evidence](../validation/admin-scroll-pagination-baseline-2026-10-08.json); no credentials are included in this report or screenshots.
