# Golden Lift Admin interface refinement — 2026-10-10

Acceptance: **PASS for the verified local scope**. Current dated evidence: [verification report](../validation/admin-ui-2026-10-10T10-07-33-389Z.json).

## Root causes and solution

The normal GLButton label omitted its existing flex class; loading buttons had it. The shared primitive now applies that class in both states, aligning icons and text without page offsets. Shared control tokens, semantic variants, labeled 40px icon targets, search adornments and native form semantics supply one source of truth.

Competing broad Admin selectors applied different section margins, table padding and forced Media dimensions. styles.css now owns shell, collections, forms and Media; workspace.css owns focused editors and dashboard composition. Category navigation keeps its dedicated recursive layout. Duplicate section/min-height rules and negative footer offsets are removed. Stale Media help about shared-file detachment and unused retained-deletion copy are retired; current impact dialogs remain authoritative.

## Implemented scope

- Dark grouped sidebar, light contextual command bar, shared page headers and consistent content padding. Mobile uses a two-row command bar and existing navigation drawer. Role filtering remains authoritative.
- Attributes, Groups, Units and Products share compact server-backed filters, table density, semantic status chips, overflow actions and existing pagination. Unit symbols, batched Attribute usage counts, actual staff roles and precise staff update dates are visible. Product Media cells report the known cover association; full gallery inspection stays in the editor. Product editor return navigation preserves a validated collection filter path.
- Product Editor has a compact rail, responsive summary, grouped fields and normal document scrolling. Shared form sections, translation tabs, reviewed edits, validation and sticky overlay actions remain.
- Categories retain master/detail navigation, keyboard disclosure, search, parent/leaf rules and mobile browsing. Media uses bounded 4:3 tiles, visible kinds/status and accessible actions; Video/PDF have type icons.
- Shared dialogs retain focus trapping/restoration, dirty decisions and red close controls. Permanent deletion remains its existing impact/authorization/concurrency workflow, with consistent destructive icon and secondary cancellation. Loading, safe errors, retry and empty-state guidance remain visible. Media, Category tree and relationship selectors use the same shared search adornment and labeled clear action as collections.

## Layers, compatibility and data safety

Changed layers are frontend tokens, shared UI, localization, Admin composition/CSS, owning read mappings, shared DTOs, OpenAPI, PostgreSQL/HTTP/browser regressions and documentation. Read contracts add Unit collection usage counts and exact staff update timestamps, with owning repositories, shared schemas and OpenAPI aligned. No mutation use case, authorization policy, SQL/Prisma schema or data migration changes. Product Type remains retired. Prior public-catalog changes in the working tree are retained. No production data is used in browser fixtures. Disposable databases/services are cleaned up after tests.

Retained browser regressions now use isolated fixture ports 3400/3403/3502/3503 and current permanent-deletion expectations, including physical persistence checks. Reviewed non-deletion mutations retain their impact assertions. Historical captures remain dated; this run writes retained functional captures under .local and current visual baselines beside the new test.

## Verification

Executed checks passed: backend build, full TypeScript checks, formatting, 245-source architecture check, 14 architecture rejection probes and all four Prisma schema validations. Tests passed: 41 backend units, 10 frontend units, 85 real PostgreSQL/HTTP regressions, 46 Admin browser scenarios and three public browser scenarios. The final five-test Admin visual replay compared all 24 reviewed Admin snapshots without updates; the public replay compared seven reviewed snapshots. No failures, skips or flaky results in those final browser runs. See the timestamped evidence above for commands and scopes. The normal web export is restored to API 3000 / Media 3003; the running site at localhost:8081 still returns four selected cards from ten products with loaded images after refresh. The new route suite covers 1440, 1280, 1024, 768 and 390 widths; every major route also runs in Arabic and Sorani at desktop/mobile widths. It checks header hierarchy, horizontal overflow, density, console errors, actual CRUD persistence/reload, focus-safe dirty close, roles and all semantic button sizes/alignment/loading. Recovery checks cover mobile loading, failed HTTP, retry, empty results and reachable modal controls. Existing suites exercise pagination, Category operations, minimal Product creation, schema/relationship edits, conflicts, Media upload and deletion.

## Known limitations

The historical combined frontend.admin.test.ts suite was not executed; the current 46-scenario phase runner is documented separately in the local operations guide. Full ORM verification was not executed; four Prisma schema validations and owning-service real PostgreSQL checks passed. Local fixture image previews are deterministic plain images rather than production photography. Local browser focus/keyboard/contrast checks do not represent formal accessibility certification. Hosted CI, production providers, deployment and load testing are not claimed.

See [decision 023](../decisions/023-admin-interface-consistency.md) and [the preimplementation audit/plan](admin-ui-baseline.md).
