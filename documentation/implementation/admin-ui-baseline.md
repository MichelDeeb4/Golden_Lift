# Admin UI baseline and implementation plan

Date: 2026-10-10. Preserve the current public-catalog work already in the working tree.

Current state: one role-guarded StaffShell, shared buttons/fields/menus/dialogs/headers/pagination and existing Category/Product workspaces. CRUD and reviewed deletion/relationship/version workflows are implemented. Catalog and Super Admin permissions remain separate. Attribute/Group/Unit tables already avoid orphan inspectors. Native browser confirmation is not used for normal actions.

Root causes: styles.css and workspace.css compete over shell, tables, Media cards and responsive sizing. Broad section selectors add repeated borders/margins to unrelated content. The label flex rule exists, but normal buttons omit the gl-button-label class; only loading buttons receive it, so ordinary icons/text stack. Shared size defaults are 36/44/52 instead of 32/40/44, icons have no shared sizing contract, and page overrides shrink hit areas. Navigation lacks consistent icon boxes and groups specifications with Catalog. Controls are 48px and table vertical padding produces excessive row height. Fixed minimum editor/detail heights create empty space. Media tiles use conflicting forced image heights.

Target: one Golden Lift Admin language using existing palette/fonts and shared primitives. Shared size/icon/layout tokens; 40px controls; semantic variants; compact tables/status; clear header/context; role-specific grouped icon navigation; calm surfaces; structured forms/workspaces; one normal document scroll; responsive drawer/table scrolling and logical RTL. Existing live APIs, bounded requests, CSRF, version/schema checks, dirty guards, permanent deletion policy and targeted invalidation stay authoritative.

Sequence: audit all routes/components/contracts/tests; refine tokens and shared controls; consolidate shell/collection/form styles into styles.css and editor/dashboard styles into workspace.css; refine Category navigation and Media cards; update route content where shared patterns are missing; verify persistence and behavior through disposable fixtures, all five viewports and three locales; review/replay screenshots; update guides and timestamped evidence. No schema, data or business-policy migration. Retire conflicting selectors and decorative/unsupported metadata; retain supported keyset vs numbered pagination semantics.

Risks: shared primitive changes can affect visitor layout; action-menu clipping in horizontally scrolling tables; modal sticky/footer scroll and dirty focus restoration; RTL icon alignment; sidebar role leaks; missing backend metadata must not be fabricated. Verify service/frontend builds/types, formatting, architecture, frontend units, real HTTP/PG regressions and public/Admin browser flows. Production providers/load/deployment and formal accessibility certification are outside local acceptance.

## Route consistency matrix (audit)

| Route | Header | Filters/data | Actions/pagination | Editor/feedback | Responsive/RTL |
| --- | --- | --- | --- | --- | --- |
| Admin landing | Shared header | Bounded operational feeds | Real creation/navigation | Loading/error/empty | Audit all widths/locales |
| Categories/detail | Shared header | Recursive master/detail tree | Overflow; branch loading | Reviewed move/delete; metadata modal | Drawer/tree indentation |
| Products/new/detail | Shared header | Server filter table | Overflow; keysets | Minimal-create modal; section workspace | Rail/summary drawer |
| Attributes/detail | Shared header | Typed filter table | Overflow; numbered | Reviewed edit/create; inspector/options | Intentional table scroll |
| Attribute Groups/detail | Shared header | Filter table | Overflow; numbered | Relationships/reviewed metadata | Shared collection pattern |
| Units/detail | Shared header | Filter table | Overflow; numbered | Create/reviewed metadata | Shared collection pattern |
| Media/detail | Shared header | Server kind/status/name | Overflow; keysets | Upload/inspector drawers | Ratio tiles and accessible actions |
| Super Admin accounts/detail | Shared header | Authorized directory | Overflow; keysets | Invite/edit/lifecycle confirmation | Separate authorized navigation |
| Account | Shared header | Session/profile/password | Explicit saves/logout | Field errors/dirty guard | Sectioned responsive form |
| Login/invitation/reset | Auth heading | Identity forms | Real auth flows | Safe errors/labels | Compact responsive layout |


## Read metadata extension plan

The requested Unit usage and staff update columns require additive read metadata. Unit collection responses will batch counts of non-deleted Attribute definitions by the current page's Unit codes, following existing Group metadata ownership. Identity will expose its existing exact updated_at projection through StaffAccount DTOs. Shared schemas, OpenAPI, UI columns and real PostgreSQL/HTTP assertions change together. No table/column migration, cross-service database access or mutation policy change. Build fixtures after switching all callers; restart normal local services after verification to avoid stale response contracts.


## Final route consistency coverage

Every major route above is exercised at five English widths and Arabic/Sorani desktop/mobile widths by frontend.admin-ui.test.ts. Collections retain one header, shared controls, one ordinary document scroll and bounded horizontal tables. Existing retained suites cover reviewed edits, dirty close/navigation, conflicts, server paging, Category placement, Media upload, permanent deletion and reload persistence. Local auth, outage and CSRF regressions are also exercised through owning services. Current baseline review and replay results are recorded in the completion report and dated evidence.
