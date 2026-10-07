# Decision 012 — Live catalog integration and native local Media

Date: 2026-10-07. Status: implemented locally; provider deployment acceptance remains separate.

The public website previously defaulted to demo data and lacked a collection API. Normal runs now select API mode through one frontend configuration shared by staff and visitors. Explicit demo mode remains useful for isolated visual fixtures. Failed API calls never substitute fixtures.

Expo's transform cache reused the preceding API-mode bundle when an explicit demo export changed environment values. Export and development commands now use the supported `--clear` option so the selected bundled mode/origins are reproducible. This costs a fresh transform at startup/export and prevents a stale mode from concealing the requested runtime behavior.

Catalog owns bounded public collection queries, PostgreSQL search and generic dynamic filters. Gateway forwards the contract and owns no database. Parameterized queries enforce active product/category ancestry, a current READY unblocked image cover, active type, public definition/assignment policy and localized fallback. Numeric comparisons preserve numeric(20,6) strings; false is a real Boolean value. Ordering is deterministic. Public filters are schema-derived; there are no hardcoded engineering fields or search infrastructure dependencies. Collection projection and policy reads use the existing service-owned Prisma transaction. Transport parsing stays in presentation; canonical decimal validation belongs to the application/domain boundary.

Catalog projects eligible image/video associations and permitted technical-source documents, never storage keys or private URLs. Media performs fresh authorization at delivery. An ordinary product PDF association does not grant public original access: the existing technical-source `download_enabled` policy remains authoritative. Technical-sheet administration is still deferred. Disposable fixtures explicitly seed that existing policy to verify both denied and permitted delivery; this is not a new staff editor.

The existing SQL requires a READY image cover even for inactive creation. Creation therefore selects or uploads an image before saving the inactive product. Weakening this invariant to match a coverless sequence would require a separate database/domain decision and was not done. Basics, associations and publication retain their explicit independent save/version boundaries.

Portable Windows tools are pinned and hash-verified into ignored `.local/tools`. The named `native-local-http` development profile runs real ClamAV, Sharp, FFmpeg/FFprobe and Poppler with private retained filesystem storage. It uses existing durable outboxes and signed, loopback-only HTTP consumers, confirming events only after successful consumer application. It is rejected in production. This makes local native workflows reproducible without introducing broker infrastructure into business layers; it does not establish RabbitMQ acceptance. Production still uses the existing RabbitMQ/S3/Linux isolation profile and its deployment gates.

Browser-recorded full-range MP4 exposed a native canonical-output failure. Transcoding now explicitly normalizes to limited-range yuv420p before validating the resulting H.264 stream. Validation remains enforced rather than accepting noncanonical output.

Staff mutations invalidate staff and public query caches after confirmed responses. Drafts and optimistic concurrency remain intact. Interaction effects use existing tokens, semantic controls, stable layout and reduced-motion overrides; no visual dependency was added. Tests exercise actual HTTP/PostgreSQL persistence and native processing, with separate synthetic fixtures retained for deterministic visual comparisons.
