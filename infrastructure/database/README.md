# Target database engineering harness

Phase 02 supplies a disposable PostgreSQL lifecycle harness and immutable SQL lineage manifest checker. It does not provision tenant/control databases or implement an ERP schema. Phase 03 owns those implementations and must first satisfy the owner-approved capacity/hosting deadlines.

Phase 03 will create two explicitly separate streams: control-plane SQL and one canonical ERP SQL stream reused unchanged by pooled and dedicated databases. SQL filenames must follow sequential 0001_description.sql numbering. Applied checksums cannot change; failed migration recovery must be implemented and tested in Phase 03. No pretend empty schema migration is present.

Run npm run test:database with Docker running. The test creates a randomly named, labeled, loopback-only PostgreSQL container, verifies repeatable SQL and commit/rollback, then removes only that test-owned container. It never reads legacy database connection settings. No application ORM selection has been certified.
