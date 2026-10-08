# Golden Lift — Admin actions, dialogs and filters baseline

Date: 2026-10-08. This phase begins on top of the uncommitted scroll/pagination implementation. Its backend pagination work is retained; it is not a new backend redesign in this phase.

Source inspection found configuration and account rows with both a visible Edit and an overflow trigger. Configuration selection rendered a second record panel below pagination. Configuration filters stacked on wide screens. Shared overlays used a plain multiplication-character close control. Several editor-close, local-selection and staff-link navigation paths called `window.confirm`.

Rendered before captures use the prior completed API-mode export and disposable real HTTP/PostgreSQL fixtures. See [Groups](../assets/admin-actions-dialogs-filters/before/attribute-groups-top.png) and [Attributes](../assets/admin-actions-dialogs-filters/before/attributes-top.png). No normal catalog records or staff accounts were changed for these captures.

Acceptance will require a single row action trigger; icon and semantic action states; explicit configuration overlays without a selected-record footer; responsive shared filters; branded unsaved and destructive confirmations; and current browser, type/build/format/architecture evidence. Historical reports do not establish acceptance of these changes.
