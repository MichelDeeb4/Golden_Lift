# Capacity and operational objectives

Date: 2026-10-10. Proposed model; no production capacity or SLO has been approved or measured.

## Parameters and resource budget

Owner inputs are launch/three-year tenant count, active dedicated fraction, companies/tenant, concurrent users, peak requests and transactions per second, row/object volume and growth, large-report frequency, availability, p95/p99 latency, RPO/RTO, region/provider budget and maintenance window. They remain null in [decision state](phase-01-decisions.json); tests cannot treat null as approval.

For one PostgreSQL server, budget maximum simultaneous connections as:
C = API_replicas × active_ERP_pools_per_replica × connections_per_pool + worker_replicas × active_worker_pools × worker_connections + control_plane_connections + fleet_and_backup_connections + reserved_headroom.
For several servers, evaluate per physical server using actual assignment placement. Dedicated databases on the same server share its connection/memory/IO budget. Enforce global caps across processes, not merely per-pool defaults. Budget baseline memory, query work_mem concurrency, object bytes, backup amplification, WAL/replication and index growth separately.

A synthetic test fixture (2 API replicas, 3 active pools each, 4 connections/pool, 1 worker × 2 pools × 2 connections, 6 control, 4 operations, 10 headroom) needs 48 connections. This is arithmetic test data, not an approved configuration or capacity promise. Load tests vary active routes, skewed noisy tenant load, queue saturation, idle eviction, long transactions, retries, replica scaling and credential rotation; assert bounded connections, explicit backpressure and fairness.

## Decision recommendations

Approve numeric targets after launch scope and hosting budget are known. Initial operational recommendation is managed PostgreSQL/OIDC/S3 where budget permits, controlled maintenance/freeze for tenant transfer, admission fail-closed and conservative negative-stock denial. No vendor or jurisdiction is selected. Availability topology must match the accepted failure domains and on-call team; a second application replica alone does not provide database disaster recovery.

Recovery evidence must timestamp declared loss boundary, backup point, restore start, verification and resumed service; compare measured data loss/downtime to approved RPO/RTO. Capacity evidence includes hardware/provider configuration, fixture sizes, concurrency, warm/cold behavior, pool/lock/query metrics and p95/p99 latency. Unavailable hosted/provider drills remain BLOCKED.

Proposed alerts cover admission/dependency failure, migration drift, route mismatch, pool saturation, oldest outbox/job age, DLQ, backup age, restore failure and stock/ledger reconciliation discrepancies. Thresholds derive from approved budgets and tests; they remain open rather than fabricated numeric guarantees.
