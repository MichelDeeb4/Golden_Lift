# Local hybrid database verification

Run npm ci --ignore-scripts --no-audit --no-fund; npm run build; npm run test:database. Docker must be running. The harness creates a uniquely named PostgreSQL 18.6 container, binds a random loopback port, initializes distinct control/pooled/dedicated databases and cleans only its name/label-verified container. It accepts no production connection string. Generated Prisma adapter code stays ignored and is regenerated from the checked-in mapping; reviewed SQL owns schema, grants and RLS.

Migration recovery: record operation FAILED; retain resources and receipts; correct unapplied SQL; retry the same idempotency key. Never edit an applied checksum or issue an automatic destructive down migration. A drifted assignment must remain unavailable. Runtime readiness uses a real restricted login and transaction-local tenant context, not only an administrator SELECT. Provisioning ends READY, never grants business admission; Phase 04 owns activation.

Credentials are supplied by an operational secret resolver, represented in registry rows only by reference. Runtime roles have no ownership/migration/role-management privilege. Dedicated database CONNECT grants are per-login, not shared runtime-group grants. Rotation drains leased clients, retires the old pool, and rejects older credential versions. Connection limits and profile history have hard bounds; timeout, queue saturation and cancellation return failures. Test limits do not establish deployable hosting, SLOs or recovery policy.

No valuable legacy data is imported or deleted. Source snapshots and Git history remain preserved. Dedicated/pooled transfer and full backup restoration are future Phase 04/07 responsibilities, not proved by this migration test.
