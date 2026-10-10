# Phase 01 executable acceptance specifications

These artifacts are Phase 01 design and executable checks, not an implemented hybrid foundation.

Run from repository root:

```powershell
node --test tests/architecture/phase-01-specification.test.mjs
node tests/architecture/verify-phase-01.mjs specification
node tests/architecture/verify-phase-01.mjs gate
node tests/architecture/verify-phase-01.mjs runtime
node tests/tenant-isolation/hybrid-rls.acceptance.mjs
```

The first two validate the design. Gate/runtime and the SQL probe return exit 2 (BLOCKED) until approval/evidence or real disposable target fixtures exist. PowerShell wrappers must propagate $LASTEXITCODE. No skipped test counts as security acceptance.

[Machine matrix](phase-01-acceptance.json) records each requirement, assigned phase, fixtures, setup/actions/assertions, negative/fault case, cleanup and real evidence kind. Later phases implement scenario-specific API/browser/worker/provider tests as their corresponding code becomes available. Phase 08 requires every foundation scenario through phase 08, not just the SQL probes. Phase 12 requires all release scenarios. No target business implementation is introduced here.

## SQL probe fixture contract

The PostgreSQL probe reads a private local JSON configuration supplied as its first argument. It requires disposable=true, fixtureVersion=1, an explicit marker, and tenants A/B/C. Each tenant has id (UUID), mode, companies (at least two UUIDs), runtimeRole and connectionString. Connections must target loopback databases named bp_target_test_*; A/B share a database and C uses another. This guard prevents accidental use against the existing local user databases. Later hosted test harnesses require their own explicitly authorized fixture controls.

Phase 03/04 will implement disposable fixture creation and real target migrations. The fixture exposes test_support.fixture_metadata(key,value) with key=disposable and matching marker, plus test_support.isolation_records(tenant_id,id,company_id,label). The probe requires nonowner runtime roles, enabled and forced RLS, actual seeded rows and transaction-local app.tenant_id context. It executes positive own-row reads/inserts and negative cross-tenant writes/updates, missing scope, rollback reuse and dedicated wrong-context queries; all mutation probes roll back. This fixture table is test support, not the business schema or a substitute for scanning every tenant-owned table.

The fixture configuration contains credentials and stays ignored under .local. Do not commit it. Missing configuration is BLOCKED, never a mock PASS.

## Runtime receipts and review

Each actual executed scenario provides scenarioId, mode, tenants [A,B,C], evidenceKind matching the matrix, status PASS, exitCode 0, mockOnly false, checkedAt, command, exact release identifier and artifacts [{path,sha256}]. The verifier checks completeness, duplicate/missing mode coverage, fixture coverage, release match, actual artifact existence and bytes. Receipts and hashes do not authenticate the test author or prove the underlying command was truthful; owner/reviewer inspection and CI execution are required. They are evidence bookkeeping, not a replacement for actual tests.

Acceptance never rests on diagrams, old reports, successful compilation or mock-only results. Actual roles/catalogs, HTTP identities, browser behavior, durable workers, provider files, transfer snapshots and recovery metrics must be tested independently. The [phase report](../implementation/phases/phase-01.md) and [decision state](phase-01-decisions.json) distinguish current PASS design checks, BLOCKED gate/runtime prerequisites and NOT STARTED future implementation.

Runtime receipt validation optionally takes a final through-phase number: node tests/architecture/verify-phase-01.mjs runtime <receipts.json> <release> 8 checks all foundation scenarios through Phase 08. Default is Phase 12/full release. This does not bypass previous phase or owner gates.
