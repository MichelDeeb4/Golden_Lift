# Admin CRUD modal fix baseline

Date: 2026-10-07. Starting commit: `80a8a6c`.

Configuration Create is hidden when a detail is selected. Attribute/group/unit/type creation and metadata editing use inline canvases. Category create/edit is inline, while moves and deletion already use reviewed overlays. Product creation navigates to a large editor instead of a focused modal. Most staff anchors trigger document navigation. Successful mutations invalidate the entire staff query namespace, including unrelated Identity/Media queries. Existing APIs already support the requested owning-service CRUD, impact reviews, version preconditions and soft deletion.

Retain the full product editor, Media grid/upload drawer, category tree and type assignments as workspaces. Introduce focused modal forms, permanent resource-specific Create actions, client navigation and dependency-scoped invalidation. Preserve current contracts: no numeric precision-setting field, fabricated usage/timestamps, unsupported state fields or new batch APIs. Verify real HTTP/PostgreSQL persistence, document continuity through mutations, conflicts, draft retention, role separation, responsive behavior and RTL.
