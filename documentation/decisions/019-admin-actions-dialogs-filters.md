# 019 — Shared Admin actions, dialogs and filter composition

Date: 2026-10-08. Status: Implemented; validation is recorded in the phase completion report.

Use the existing UI package and icon package for shared menu items, semantic buttons, Close controls, confirmation dialogs and filter composition. Action icons are explicit metadata, independent of translated text. Add success/warning variants using existing semantic tokens. Keep destructive actions visually separated at the end of menus.

Configuration editing stays in the existing reviewed-change modal. Selection and CHOICE option management use an explicit drawer rather than rendering a second record workspace under the list. Create is mounted independently so an empty collection or closed inspector cannot hide its dialog. Deletion continues to obtain owning-service impact/preconditions before committing against the captured version. No new persistence or API contract is needed.

Unsaved decisions are asynchronous. The staff provider owns a single pending decision and resolves duplicate requests as Stay. Close/Escape resolves Stay; Leave explicitly authorizes the captured continuation. Actual browser reload/close keeps `beforeunload`. Staff link navigation prevents the original event before asking, then resumes only after Leave. The mounted staff shell registers a Back guard at the existing custom staff-router boundary, before state changes; replay dispatch is permitted once. Preserve same-route query history and mounted list workspaces.

The installed Expo web linking adapter restores browser Back with `resetRoot`, bypassing that router action guard. A scoped browser-history adapter therefore tags entries with an opaque mount identifier and numeric position while preserving Expo's state. An early application listener restores the current entry before prompting, keeping the form mounted; Stay retains it, and Leave traverses to the captured destination once. The listener must install before Expo's linking effects, which can synchronously unmount the editor. Back/Forward history is retained rather than adding a synthetic extra entry. History wrappers and the active guard are restored on unmount; the application listener becomes inert. Unknown/cross-document entries retain normal unload handling. Browser tests cover this separate path.

Filters use supported server contracts; no account search/status filter is fabricated. The account toolbar shows actual page/count information. Existing pagination owns page-size/count/range controls. Public collection pagination remains separate.

Staff account editing uses the existing Identity PATCH in a focused modal. Capture the account/version when opening it; preserve input on conflicts rather than silently adopting a background version. Reload latest is an explicit discard decision followed by the owning-service GET. No new Identity contract or persistence layer is introduced.

Tradeoffs: configuration details require an explicit overlay, retaining collection context with fewer always-visible controls. Existing schema preview/commit and independent save boundaries remain intact. A native browser's reload warning cannot be branded, and is deliberately restricted to leaving/reloading the actual document.
