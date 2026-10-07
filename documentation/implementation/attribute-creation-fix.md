# Attribute creation fix

Date: 2026-10-07.

The reported generic error concealed Catalog rejections (HTTP 422 in the local service log). The original submitted values were not available, so the exact rejected field is not asserted here.

The attribute editor now selects canonical units from the existing, paginated Units API instead of accepting arbitrary unit text. Unit codes remain the submitted identifiers; saving without a unit remains supported. Changing from Text to Number, Boolean or Choice now sends the required default text-length metadata rather than a hidden Text draft value. Entered type-specific drafts remain available when switching back.

The staff API adapter retains bounded application validation messages for HTTP 400/422, and the interface displays them as escaped text. Authentication, conflict and server failures retain their existing safe feedback. Rejected requests keep the draft available for correction. No backend policies, SQL or existing data were changed.

Executed verification: `npm.cmd run check` passed (build, types, format, architecture, Prisma and 37 backend unit tests); `npm.cmd run test:frontend` passed all 8 tests; `npm.cmd run storefront:build` passed. Two focused browser tests passed with no skipped, unexpected or flaky results and no report-level errors, using real services and disposable PostgreSQL databases. These exercise type switching, explanatory validation feedback, retained drafts, creation, and persisted canonical-unit assignment. The PowerShell redirected browser invocation reported a nonzero shell result alongside a native stderr warning; Playwright's JSON and final summary record both tests passing. `git diff --check` passed.

The task-owned disposable cluster was removed. The normal project was restarted with its existing accounts and database retained. All five service readiness checks returned HTTP 200; the website and scanner were ready. [Dated evidence](../validation/attribute-creation-fix-2026-10-07.json).
