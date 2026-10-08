# Golden Lift — Admin actions, dialogs and filters completed work

Date: 2026-10-08. Scope: focused Admin interaction consistency on top of the existing uncommitted scroll/pagination work. See [baseline](admin-actions-dialogs-filters-baseline.md) and [decision 019](../decisions/019-admin-actions-dialogs-filters.md).

## Golden Lift Admin Action / Filter / Dialog Fix Status

Implemented. Final acceptance and exact current execution evidence are recorded below. No backend, database migration or dependency was added for this phase. Earlier uncommitted backend pagination changes remain separate work.

## Row action standard and separate Edit buttons removed

Configuration and staff account rows now have one 40px icon overflow trigger. Their separate Edit controls were removed from JSX. Existing Product and category-tree overflow actions retain their supported workflows. Media cards now expose one secondary overflow alongside their image/name preview link; upload remains the primary page action.

Menus expose menu/menuitem semantics, icons independent of translated labels, a tooltip/accessible trigger label, Arrow keys/Home/End/Escape, trigger focus restoration and RTL positioning. Destructive actions appear at the bottom with a separator.

## Overflow menu contents and icons

| Collection | Supported actions |
| --- | --- |
| Attributes | Edit, View details/options, Deprecate when eligible, Delete |
| Groups / Units | Edit, View details, Delete |
| Products | Edit, category context, public View for active records, Delete |
| Media | View details, Usage, eligible Reprocess and Retire; existing inspector Retry/Block policies retained |
| Staff accounts | Edit modal, View details route, Enable/Disable, invited-account Resend, Delete |
| Category tree | Add child, Edit, Move, earlier/later ordering and reviewed branch Delete |

Pencil, Eye, Link, Move, ordering arrows, CircleCheck/CircleOff, Trash, Archive, Plus, Save, X, Search, FilterX and Upload come from the existing Lucide-backed icon package. No emoji or visual dependency was introduced.

## Semantic button colors and red Close buttons

Create/Save use existing gold primary tokens. Management/Cancel/Clear are neutral. Enable uses the existing success token; Disable/Deprecate use warning; Delete/Retire use destructive. Modals, drawers and toast dismissals share the labeled 40px red X, soft-red hover/pressed and existing focus treatment. Pending controls retain disabled/loading semantics. Retained inspector processing actions use neutral confirmation; blocking uses warning.

## Browser dialogs removed and unsaved-changes dialog

Admin source contains no `window.alert`, `window.confirm` or `window.prompt`. Dirty editor Close, Cancel, local record selection and internal staff-link navigation use an asynchronous application decision: **Unsaved changes**, **Stay**, **Leave without saving**. Close/Escape means Stay. Stay preserves input; explicit discard resets the configuration selection/create draft. Nested CHOICE option drafts participate in inspector-close protection.

Actual document reload/close retains `beforeunload`. Browser Back within the mounted staff history is intercepted before Expo's web linking listener restores the previous root. The current entry is restored while the dialog is pending; Stay retains its URL/input, Leave traverses to the original destination once. Back/Forward history and same-route pagination history remain intact. Unknown entries predating this mounted history remain outside the branded traversal guard; cross-document departures retain normal browser unload handling.

## Delete and lifecycle confirmations

Delete displays the captured entity name, retained-deletion policy and available owning-service impact before commit. The destructive action has a Trash icon; Cancel is neutral; Close is red. Configuration changes retain preview/precondition/version/schema checks. The modal captures its edit version when opened so background record changes cannot silently replace a dirty form's baseline. HTTP conflict feedback preserves input. Staff account Edit uses the existing Identity PATCH with a captured version; an explicit Reload latest decision reviews discarding the draft before adopting current values. Products, staff accounts and Media retain captured versions and owning-service authorization. Category details also place Edit inside their action menu; Add child remains the primary creation action.

## Filter toolbar, desktop/mobile layouts and compact rows per page

Attributes, Groups, Units, Products and Media compose supported controls in shared `GLFilterToolbar`. The region is named Filters, distinct from its Search textbox. At wide widths, search has a larger column, intermediate controls have compact columns and Clear has intrinsic width. Products group search and its explicit submit action. Tablet uses two columns; mobile stacks fields. Server filters reset pagination through the existing URL/history adapter.

Accounts use the shared toolbar for actual page/count context. The API has no directory search/status filtering, so unavailable filters are not fabricated. Existing pagination supplies actual counts and inline desktop row-size selection, with mobile wrapping. No API-side pagination behavior was changed here.

## Orphan / duplicate layout blocks removed

The selected-record block and its `.gl-configuration-details` wrapper were removed from the page source. Normal collections end at pagination. Edit is an explicit modal; View details is an explicit drawer retaining actual option/configuration workflows. Create is mounted independently of a selected record or inspector, including empty lists. This is a component composition change, not a CSS hiding workaround.

## RTL and accessibility

Arabic/Sorani filters stack correctly at 390px without document overflow. Logical flow, direction-aware menu alignment, independent translation input direction, labeled fields, modal containment/restoration and keyboard menu behavior remain. Tests exercise Close, Cancel, Escape, Stay/Leave, browser Back, sidebar navigation, semantic action variants and bounded pagination. Full assistive-technology and cross-browser certification is not claimed.

## Visual review

Before captures preserve the previous API export. Current screenshots use disposable real service data and disable transitional animation for stable review. Review checked single row actions, toolbar geometry, named confirmations, red close controls, compact pagination and mobile RTL. Historical category/product documentation captures were preserved; new workflow captures live under this phase.

Examples: [Groups](../assets/admin-actions-dialogs-filters/after/groups-desktop.png), [menu](../assets/admin-actions-dialogs-filters/after/group-menu.png), [Delete](../assets/admin-actions-dialogs-filters/after/delete-dialog.png), [unsaved decision](../assets/admin-actions-dialogs-filters/after/unsaved-dialog.png), [Arabic mobile](../assets/admin-actions-dialogs-filters/after/attributes-ar-mobile.png), [Sorani mobile](../assets/admin-actions-dialogs-filters/after/attributes-ckb-mobile.png), [Products](../assets/admin-actions-dialogs-filters/after/products-desktop.png), [Media](../assets/admin-actions-dialogs-filters/after/media-desktop.png), [Accounts](../assets/admin-actions-dialogs-filters/after/accounts-desktop.png).

## Tests and actual results

Current command results and test titles belong to the dated validation JSON. Checks include service/package build and 37 backend unit tests, final types/format/architecture/14 enforcement probes/four Prisma schemas, 9 frontend unit tests, API-mode export, 17 action/pagination browser tests and 11 existing category/product/staff workflow browser tests. The visitor regression passed 5 tests and 7 unchanged visual comparisons. In total, 79 distinct tests passed. The four category tests were repeated after the final menu adjustment and are counted once.

The Admin fixtures use actual Gateway/owning-service HTTP and disposable PostgreSQL databases. New assertions verify one row trigger, absence of the old footer panel, icon/semantic controls, modal CRUD, named deletion, no native dialogs, dirty-form decisions, browser Back, CHOICE option creation and stale-version input retention. Existing pagination assertions retain outage recovery, counts, filters, URL/history, no document reload, scrolling, Media final pages and staff directory lifecycle.

Initial failures identified Expo's root-state Back path, an obsolete account-field locator, an ambiguous Search region and old action-menu roles. These were corrected while retaining the behavior assertions. Visual review also caught a duplicate Cancel icon and captures taken during a transition; the icon was corrected and current review captures finish transitions. No failing assertion was removed to pass verification.

## Known limitations

- Account directory search/status filtering and configuration Usage directories are absent from current contracts. Supported details/impact are shown instead of invented APIs.
- Browser traversal protection covers history entries owned by the mounted staff session. Actual reload/close uses native unload protection; external/cross-browser acceptance is not claimed.
- Historical Type-specific tests remain outside current category-derived product workflows. No Product Type feature was reintroduced.
- Provider fixtures do not establish production SMTP, scanner/codec/broker/S3/Linux acceptance. No hosted CI/deployment or fresh full integration-suite run is claimed.
- This phase's backend changes are none. Previous pagination API changes and earlier local-operation work remain uncommitted alongside these UI changes.

## Acceptance

**PASS — final local acceptance.** All 79 distinct tests passed, together with build, types, format, architecture, Prisma and export checks. Seven unchanged visitor visual comparisons passed; staff screenshots were manually reviewed. [Dated validation evidence](../validation/admin-actions-dialogs-filters-2026-10-08T10-26-32-687Z.json).

The task-owned disposable PostgreSQL cluster was removed. The normal project was restarted with `npm.cmd start`: the website on port 8081 and all five service readiness endpoints on ports 3000–3004 returned HTTP 200. Existing accounts, catalog and local configuration were retained.
