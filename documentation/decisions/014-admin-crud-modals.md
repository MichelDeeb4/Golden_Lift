# 014 — Focused Admin CRUD modals and scoped cache refresh

Date: 2026-10-07.

Keep Catalog/Identity/Media ownership, existing contracts, reviewed changes, exact version/schema preconditions and soft deletion. Focused configuration and category metadata forms become accessible native-dialog overlays. The full product editor, category navigation, product-type assignments and Media library remain workspaces. Product creation uses a focused modal, with the verified cover and required dynamic values mandated by the existing Catalog contract; it then navigates through the client router to the editor.

Creation drafts are independent of selected-record drafts. Shared attribute fields retain a single implementation of type-specific presentation. Modal closing warns for dirty drafts and preserves input; pending submissions cannot be dismissed. Editors capture the version at opening, retain conflicts and explicitly reload the latest metadata. Reviewed impact confirmation remains a separate nested dialog because its signed preview/precondition is an existing business workflow.

TanStack Query retains the existing `staff` namespace and owning-resource keys. Mutation refresh is limited to affected resource/dependency families: configuration/schema/form/product data; category/tree/product placement data; product/category counts; Media grid/previews/usage/catalog eligibility; or Identity account/session data. It does not invalidate unrelated staff providers. Backend-confirmed feedback is held as UI-only state in the staff provider so it survives closing overlays and navigating to the product editor. Preview requests do not produce success toasts.

Existing internal staff anchors are intercepted by the staff provider and dispatched through the client router, preserving modifier-click/download behavior and existing unsaved-navigation warnings. Configuration selection stays local without changing filters or pagination. Product creation carries the list return context to the editor for deletion. Return navigation validates the origin and product-list pathname.

Configuration contracts currently expose bounded cursor pages, not global text/type/visibility search, usage totals or updated timestamps. Filters explicitly apply to the loaded page and are stored in URL parameters. Missing counts/timestamps are not invented. No duplicate CRUD APIs, new server-state store or database migration is introduced.
