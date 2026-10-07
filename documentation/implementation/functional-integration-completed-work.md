# Golden Lift Functional Integration Status:

Date: 2026-10-07. Scope: real visitor integration, existing staff CRUD, native local Media and interaction polish. See the [baseline](functional-integration-baseline.md), [decision 012](../decisions/012-functional-integration.md) and [local development guide](../operations/local-development.md). Earlier milestone reports remain historical.

## Runtime audit:

- Gateway: stateless entry point on 3000; public collection forwarding and updated OpenAPI 0.7.0.
- Identity: real sessions, roles, action tokens and staff lifecycle; separate owning database, port 3001.
- Catalog: actual PostgreSQL/Prisma configuration, product/category mutations and private-safe public projection, port 3002.
- Media: protected B5 control/binary delivery on 3003, actual native worker, private filesystem storage and signed durable event relays.
- Inquiries: existing readiness/database foundation on 3004; business submission workflows are outside this phase.
- Frontend: website and web Admin/Super Admin on 8081; one public/staff API configuration and API-default visitor data.
- PostgreSQL: normal developer data retained; read-only parity passed for 66 models, 664 columns, 73 foreign keys and installed constraints/indexes/triggers. Real mutation tests use disposable databases.
- RabbitMQ: unavailable on this host; not represented as accepted. The explicitly named `native-local-http` development profile uses loopback-only signed consumers and existing durable outboxes. Production transport remains RabbitMQ.
- ClamAV: actual 1.5.4 scanner with downloaded signatures; real INSTREAM verification persisted against sealed input hashes.
- FFmpeg: actual FFmpeg/FFprobe 9.0.2; canonical H.264 playback and poster generated. Browser-recorded full-range MP4 now explicitly normalizes to limited-range yuv420p before validation.
- Poppler: actual 26.09.0 pdfinfo/pdftoppm inspection and raster preview; no fake READY state in native acceptance.

## Authentication:

- Real cookie login/bootstrap/logout and role routing passed. Live owning-service authorization preserves ADMIN/SUPER_ADMIN separation, CSRF and approved Origin checks.
- Invitations, single-use tokens, recovery, password changes, disable/enable, session revocation and retained deletion passed. Mail capture is test-only; production SMTP is not claimed.
- Identity/Gateway outage checks preserve login input, end loading and fail closed. No sensitive session token is stored in browser state or repository artifacts.

## Category CRUD:

- Actual root/recursive navigation, creation, translations, edits, sibling order, reviewed moves and preview/confirmed branch deletion persist through Catalog/PostgreSQL.
- Public category covers are projected only for eligible local READY unblocked image references; Media still makes a fresh delivery decision. Existing invariants, expected versions and branch policies remain authoritative.

## Product Type CRUD:

- Real types, translations, group placements, assignments and required/public/filterable rules remain connected to the existing authorized APIs.
- Schema/type-change impact review, version/revision checks and lifecycle policies are retained. No frontend-only success or destructive value replacement was introduced.

## Attribute CRUD:

- NUMBER, BOOLEAN, TEXT and CHOICE remain schema-driven definitions. Exact decimal strings, zero, false, unset, translated labels/help and type-specific constraints are preserved.
- Browser acceptance creates NUMBER with all three translations, a canonical unit, bounds and public/filterable policies, assigns it, persists 0.000001 and reads it publicly. No hardcoded capacity/speed/motor fields were added.

## Attribute Groups / Options / Units:

- Real translated unit and group creation survives reload and is used by an assigned product schema.
- Three CHOICE options are created and translated, reordered through reviewed changes, assigned, selected and verified after product reload/database read.
- Deprecating the chosen option preserves the existing value and prohibits new selection. Existing unit/group/definition mutation and deletion policies remain covered by PostgreSQL regressions.

## Product CRUD:

- Creation, reload/edit, translations, leaf category/type selection, dynamic values, schema/type-change review, independent Media/publication saves and soft deletion use actual HTTP and service-owned transactions.
- SQL requires a READY image cover even for inactive creation. Select/upload that image before the initial save; the coverless sequence suggested in the prompt was not implemented by weakening the existing invariant.
- Conflicts preserve drafts and require reviewed current versions/revisions. Confirmed mutations invalidate staff and public catalog caches.

## Media Upload:

- Image: browser parts → completion → real ClamAV/Sharp → VERIFIED READY → Catalog registration → private preview → association/public derivative passed.
- Video: actual browser MP4 → scanning/FFprobe → FFmpeg canonical transcode/poster → VERIFIED READY → Admin/public playback passed.
- PDF: actual PDF bytes → scanning/Poppler inspection/preview → VERIFIED READY → Admin original access/association → denied and permitted public policy checks passed.
- Formats, size ceilings and scanner prerequisite come from B5 capabilities. Unsupported/oversized/scanner-unavailable inputs and processing/poll failures produce safe feedback. Closing/reopening upload retains resumable in-memory transfer state; persisted parts remain backend-owned.

## Media Attachment:

- Catalog remains image/video/PDF association authority. Ordering, actual drag/drop and accessible earlier/later controls, cover selection/replacement, detachment and usage checks retain their contracts.
- Detachment preserves shared bytes. Unready, blocked and retired references are rejected by the existing policy; blocked image covers are also rejected during reference validation.
- Public projection contains eligible image/video metadata and allowed technical-source documents, never storage keys or private URLs. Media authorization remains fresh at delivery.

## Publication:

- Actual activation, featured/order changes, reload and public visibility passed. Inactive/deleted products and blocked covers are excluded by the public collection/detail policy.
- Required Arabic/schema/category/cover checks remain backend and SQL authorities. Basics, associations and publication retain independent explicit save/version boundaries.

## Public API Integration:

- Added bounded `GET /api/v1/products`: page 1–1000, pageSize 1–100, exact category/type scope, deterministic featured/name order, localized PostgreSQL name/description/model/public searchable-text search and up to 10 dynamic filters.
- NUMBER ranges compare exact NUMERIC values; BOOLEAN false is preserved; TEXT and CHOICE use current public/filterable assignment/definition policy. Private attributes cannot become filters or search leaks.
- Facets are scoped to eligible owners, with up to 100 definitions and first 100 active options. Media projection is bounded to 100 eligible associations, always including the cover; documents are bounded to 100. These are collection bounds, not fabricated global totals.
- Live detail renders category/type, localized content, model, exact public specifications, cover/gallery, video and allowed PDF actions. API adapter and Gateway/OpenAPI use the same contract.
- Search/filter/sort/category/page state belongs to URLs. Pagination survives locale preference bootstrap/reload; malformed filter URLs show an explicit clearable error.
- Ordinary product PDF attachment does not grant public original permission. Existing technical-source `download_enabled` policy gates download. Acceptance seeds that existing policy only in disposable fixtures, verifies both outcomes and clicks the public document action; no technical-sheet editor is claimed.

## Demo mode:

- `EXPO_PUBLIC_APP_DATA_MODE=api` is the default in the shared frontend configuration. Explicit `demo` remains labeled and useful for isolated visitor visual tests.
- Staff always uses real APIs. API errors never switch to demo products, Media or specifications. Final normal export/runtime is restored to API mode after demo visual testing.

## Interaction effects:

- Existing token-based buttons, links/cards, fields/selects, tabs, sidebar/table/Media states and menus now have restrained transitions and clear affordances. No new visual dependency was added.
- Overflow menus support arrows/Home/End, Escape and trigger focus restoration. Drawers/modals have short motion and focus containment; no required action depends on hover.

## Hover/focus/pressed states:

- Primary/icon button hover/pressed/disabled/open states, field focus/error, selected options/tabs, navigation accents, card image/arrow movement and Media/table feedback preserve layout.
- Browser checks prove keyboard menu navigation, stable trigger geometry, visible field focus and reduced-motion transition/transform removal. Existing loading-width and modal/select tests are retained.

## RTL:

- Arabic and Sorani staff/public workflows retain direction, fonts, logical shell placement, translation-field direction and isolated technical values. Three-language definitions/options are persisted, not screenshots alone.

## Responsive:

- Live public image/specification/video workflows are checked at 1440, 1024, 768 and 390px with no document overflow.
- Staff navigation/summary focus and scrolling are checked on tablet/mobile. At 768 and 390px the actual Media picker selects a READY image, Save reaches a real successful mutation, and reload retains the editor state.
- Review captures: [public desktop](../assets/functional-integration/public-product-1440.png), [public mobile](../assets/functional-integration/public-product-390.png), [staff Media](../assets/functional-integration/admin-product-media.png), [staff mobile](../assets/functional-integration/admin-product-editor-mobile.png).

## Tests executed:

- `npm.cmd run check`: build/types/format, 205 source-file architecture check, 14 enforcement probes, four Prisma schemas and 37 backend unit tests passed.
- `node scripts/test.mjs integration` on the disposable PostgreSQL profile: 92 tests passed, no failures/skips.
- `npm.cmd run test:frontend`: 8 tests passed, including positive real HTTP collection/filter/Media-owner mapping and failure without fixtures.
- `npm.cmd run test:admin` with `GL_MEDIA_NATIVE_FIXTURE=true`: 14 tests passed with actual scanner/processors and signed durable event consumers, no failed/skipped/flaky cases.
- Separate deterministic staff browser run: 14 tests and 17 screenshot comparisons passed without updates. Explicit demo visitor run: 5 tests and 7 screenshot comparisons passed without updates. Native and deterministic staff runs exercise the same 14 workflows and are not counted twice in the primary total.
- Final primary acceptance: **156 tests** (37 backend unit, 92 PostgreSQL integration, 8 frontend unit, 14 native browser, 5 visitor browser) and **24 visual comparisons**. Final clean API export, type/lint/format/architecture/Prisma/diff checks passed. [Dated validation evidence](../validation/functional-integration-2026-10-07T09-11-19-370Z.json).
- `node scripts/smoke.mjs` passed five independent processes/Gateway routing/readiness/dependency isolation; `node scripts/verify-orm.mjs` passed normal installed schema parity; diff checks passed.
- Initial issues included fixture pool ownership, canonical video color range, ambiguous new selectors, pagination resetting during locale bootstrap and Expo reusing cached bundled environment modes. They were corrected without deleting business assertions or bypassing integrity/architecture checks. Export/start use the supported cache-clearing option. Doctor now reads actual running scanner PING/VERSION rather than probing a portable binary without its configured signature path.

## Real E2E workflows executed:

- Cookie authentication/role separation; category creation/edit/order/move/deletion; type/schema changes; NUMBER/unit/group and CHOICE options; product values/reload; image/video/PDF uploads; private previews/bytes; ordering/detachment; publication; real public image/spec/video/PDF/filter reads; narrow/mobile saves; staff invitation/password/lifecycle.
- Actual Catalog, Media, Identity and Gateway outages show errors, end loading and avoid demo substitution. Main workflow pages have no unhandled rejection, React key warning or page error. Expected anonymous-session 401s and explicit negative-policy/outage requests are assertions, not ignored failures. Tool color/DevTools notices are benign local runner warnings.

## Database persistence verified:

- Browser saves are followed by reload/API reads. Product values and associations are also read from the owning Catalog database. Native asset verification/selected variants are read from the owning Media database before fixture cleanup.
- Decimal 0.000001, unit metadata, translated option identity, publication state and associations survive reload. Real integration regressions retain transaction/grant/authorization/retention/concurrency coverage.
- Normal developer databases/staff/secrets are retained. No SQL migration or schema change is introduced by this phase.

## Known limitations:

- Local native acceptance is Windows/private filesystem/signed HTTP, not RabbitMQ, cloud S3, production SMTP or verified Linux sandbox/cgroup acceptance. No hosted CI/deployment is claimed.
- Technical-sheet editors remain deferred. Product-attached PDFs remain private unless an existing allowed technical-source policy applies.
- READY cover is required at initial creation; saves remain section-specific and Media order global across kinds.
- Public category product scope is exact, not an invented recursive all-descendant collection. Facets/associations/documents have documented bounds.
- Company photography/facts, public specification group labels, separate short-description fields and global dashboard totals are not invented.
- Browser verification is local Edge/Windows, with WCAG 2.2 AA a target; no full assistive-technology audit, cross-browser certification or device-performance benchmark is claimed.

## Acceptance:

**PASS — final local functional implementation acceptance.** All primary tests and separate visual comparisons passed, subject to the documented provider/contract limitations. No production deployment or external design/accessibility sign-off is claimed.

The owned disposable PostgreSQL cluster and its fixture databases were stopped and removed. The normal project is running with `npm.cmd start`: the website on 8081 and all five readiness endpoints on 3000–3004 returned 200; all four database checks, native tool probes, scanner PING/VERSION and both signed event listeners passed. Normal API-default home/categories/products/login browser checks found no demo notice, page error, failed public API request or unexpected alert. Existing staff accounts, secrets and developer data remain intact. Daily commands are `npm.cmd start` and `npm.cmd run doctor`; first-time native setup is documented in [local development](../operations/local-development.md).
