# Phase 03 database implementation contract

Revision target-specification-2026-10-10-v1; ADR 034 governs conditional Prisma proof. Phase 02 source 0973610 is certified by hosted run 38065009923.

Implement two separate reviewed SQL migration streams (control / canonical ERP), transactional checksum ledgers and database advisory locking. Control owns registry, assignments and operation/fleet state; ERP owns tenant installation and minimal company identity hooks, with composite keys, restricted runtime grants, private dedicated binding and fail-closed transaction-local context. Organization behavior remains Phase 06. No business/API admission exposed.

Provisioning reserves durable control operations before resource creation, retries verified resources and records failures separately from readiness. Secrets stay outside registry rows. Runtime login has no ownership/migration/role-management capability; each database explicitly grants CONNECT only to its designated login.

Prisma 7.10.0 with its PostgreSQL adapter is a candidate; test generated and raw queries on one interactive transaction PID, rollback/reuse, timeout, concurrency, dedicated binding and restricted-role grants. SQL remains authoritative; no db push/migrate schema generation. The connection manager reserves per-pool capacity inside a global budget, bounds database count, waiter count and acquire time, evicts only idle leases, rejects stale credential versions and shuts down cleanly.

Acceptance code: tests/database-migrations/hybrid-foundation.test.mjs. Scenarios DB-001 parity/repeated provision; DB-002 checksum drift/ahead history; DB-003 transactional failed SQL/retry and concurrent migration locking; DB-004 bounded pools/eviction/backpressure; ISO-CONTEXT PID/SET LOCAL/rollback/timeouts/raw/generated operations; ISO-ROLES real login/ownership/CONNECT/DDL restrictions; TEN-005 composite FK; TEN-007/008 dedicated binding. Test constants are synthetic, not owner-approved NFRs.

Local acceptance limits: at most 2 cached ERP pools, 2 connections per pool (4 reserved), 2 queued requests, bounded acquisition and transaction deadlines. Control/admin test connections are counted separately and reported. Production values remain null. OWNER-SCALE/OWNER-HOSTING must be resolved before Phase 03 PASS; no cloud purchase is necessary for local tests. New SQL is applied only to randomly named, positively labeled disposable fixtures. Failed DDL rolls back; no destructive down migrations; existing source/data stays intact.
