# 009: Catalog administration through existing service boundaries

Date: 2026-10-06. Status: accepted implementation direction.

The user explicitly approved adding the missing Catalog APIs and delivering the full dashboard. The existing headless backend could create/edit products, but did not expose collection reads, publication, complete media associations or product deletion. The frontend cannot derive these policies from database fields or Media usage.

The staff application is a separate route composition inside the existing Expo Router web workspace. It reuses shared fonts, localization, tokens, controls and the API package rather than duplicating another application and design system. Its session API and TanStack Query cache are independent of the public demo data source. Admin reads always use real APIs. This remains a web interface; native Admin apps are outside scope.

Catalog owns focused product management ports/use cases and a Prisma adapter. All writes use explicit serializable interactive transactions, optimistic versions, bounded whole-transaction retries and atomic outbox events. Publication is an additive `is_active` column; existing products remain active. Inactive products remain visible to staff and retain references that prevent asset retirement, while public product/media projections reject inactive owners. Product-associated files are retained after detachment or deletion; Media retirement remains an independent reference-protected action.

Product basics, media and publication are explicit independently versioned saves. Successful section saves advance the editor version while retaining other sections' local input. Schema changes and product type changes require a backend impact preview and explicit application of the reviewed payload. No autosave or silent conflict overwrite is introduced. Inactive products must still satisfy existing database integrity requirements; incomplete retained drafts are not invented.

Staff authentication uses HttpOnly cookies, live Identity verification, memory-only CSRF tokens and approved Origin checks. Credentialed CORS permits only the configured origins; no wildcard is added. Upload parts use only the explicitly configured Media origin and returned upload capability. Private preview URLs remain temporary view state, never catalog record data.

Action tokens are captured by a root-owned, bounded memory context before replacing the router location with a canonical path. This preserves the token across route replacement while preventing the router from restoring the original fragment; consumption/navigation clears the context. Session invalidation has one redirect owner, excludes public Identity action pages and prevents duplicate redirects. Confirmation dialogs freeze the reviewed command/version; configuration reviews additionally freeze the precondition and schema revision. One provider aggregates dirty editors to avoid multiple navigation confirmations. Preview refreshes are bounded after image failures, with an explicit retry action.

Browser fixtures use disposable owning databases and actual Identity/Gateway/Catalog/Media HTTP. Their explicit synthetic Media verification adapter tests lifecycle and delivery with real private files. It does not certify ClamAV, codecs, RabbitMQ, cloud storage or Linux isolation. Those B5 external acceptance gates remain open.
