# Choice option creation and interaction improvements

Date: 2026-10-07. See [decision 013](../decisions/013-choice-option-drafts.md).

Option creation previously shared the parent attribute's code state and retained a submitted option code between additions. Duplicate codes could therefore produce a Catalog conflict, which the interface incorrectly described as a changed record/schema. The original failing request was not captured; this report records the demonstrated code-state and feedback defects.

Implemented a dedicated option dialog with an independent code and translated-label draft, clear code guidance, duplicate-code feedback and explicit Save/Cancel. Successful saves clear the option draft; closing/reopening retains unfinished work. Parent attribute edits remain intact. Options no longer show unsupported description fields. New options append using exact bigint sort-order strings. Existing reviewed editing, deprecation and deletion remain unchanged. All new guidance supports English, Arabic and Sorani. No backend or database changes were needed.

Verification: `npm.cmd run check` passed build, type, format, architecture, Prisma and 37 backend unit checks; `npm.cmd run test:frontend` passed 8 tests; storefront export passed. Two real-service/PostgreSQL browser tests passed with zero skipped, unexpected or flaky results and no report errors. The expanded regression covers consecutive additions, empty next-option code, duplicate rejection, draft retention across closing/reopening, parent draft preservation and reviewed editing/deletion. The existing three-choice/unit/group assignment workflow also passed. Initial browser failures were ambiguous selectors after adding a second option; selectors were scoped to the exact option and parent State region, preserving the assertions.

The isolated cluster was removed and normal project startup was restored with existing data and accounts retained. All five API readiness checks returned HTTP 200; the website and scanner were ready. [Dated validation evidence](../validation/choice-option-fix-2026-10-07.json). These results are specific to this fix; earlier milestone reports remain historical.
