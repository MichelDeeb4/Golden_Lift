# Approved greenfield implementation authority

The owner approved target-specification-2026-10-10-v1, ADRs 030–035 and bounded decision deferrals on 2026-10-10. Follow root plan.md, implementation-prompt.md, accepted target ADRs and the latest docs/implementation/phases report. The target uses a NestJS modular ERP monolith, separate SaaS control plane, mandatory hybrid pooled/dedicated tenancy, and distinct tenant/company ownership.

Use the active root workspace graph and target build/typecheck/lint/architecture/runtime/browser commands. Do not start Phase 03 until all Phase 02 criteria pass; enforce deferred owner decisions before their dependent phases. Preserve recoverable source and valuable data; production resources and destructive legacy data changes require separate authorization.

The older service-topology, per-service Prisma and Expo rules below describe the preserved legacy project and are superseded where they conflict with the approved target. General quality/safety rules remain applicable. No business-module or hybrid-storage implementation is authorized before its phase gate.

## Preserved legacy rules

# Business Platform project rules

These standing rules were requested by the user on 2026-10-04. Apply them to every future change in this repository: follow established engineering best practices and choose appropriate design patterns, with clear reasons and verified behavior. The user reinforced this requirement on 2026-10-04: use durable, maintainable solutions; do not take shortcuts or apply ad hoc workarounds. This rule persists across future tasks.

## Architecture and ownership

- Keep the microservice boundaries: Identity, Catalog, Media and Inquiries own separate databases; Gateway has no business database. Use API/event contracts between services, never another service's repositories, implementation imports or database connection.
- Follow Clean Architecture. Domain holds business policies/models. Application holds use cases and ports. Infrastructure implements technical adapters. Presentation handles HTTP/event transport. Composition constructs and injects concrete dependencies and owns startup.
- Domain/application must remain independent of NestJS, PostgreSQL clients, SMTP, HTTP clients and environment/filesystem access. Their only external dependency is the dependency-free contracts package.
- Use constructor injection, focused repository ports, service-owned units of work and explicit input/output models. Keep business authorization inside use cases even when controllers authenticate a request.
- Keep shared contracts independent of platform/service implementations. Shared platform code is technical infrastructure, not a place for service business rules. Import shared packages only through declared public exports.

## Pattern and implementation decisions

- Apply SOLID, KISS, DRY and YAGNI pragmatically. Introduce a pattern or abstraction to solve a demonstrated problem; avoid speculative base repositories, service locators, unnecessary inheritance and empty layers/classes.
- Use Repository and Unit of Work for persistence, adapters for external dependencies, transactional outbox for applicable business events, and bounded whole-transaction retries for PostgreSQL serialization/deadlock failures.
- Use Prisma ORM (explicitly selected by the user) with a separate schema and generated client for each database-owning service behind application repository ports. Keep ORM/driver types in infrastructure and composition. Reviewed SQL migrations remain the authority for database constraints, triggers, grants and advanced PostgreSQL features. Do not enable automatic schema synchronization or give runtime roles migration privileges.
- Solve the underlying problem with a coherent design. Do not add unused abstractions, decorative integrations, bypasses, suppressed checks or temporary fixes as the final solution. Assess the best fit for the actual requirements, record material tradeoffs and verify compatibility with triggers, deferred constraints, retention, authorization, precision and transactions.
- Use Prisma interactive transactions for implemented persistence. Keep repository/outbox operations on the transaction client supplied by Prisma. Preserve service-specific isolation and SQL-error mapping. Do not put external HTTP/mail/file side effects inside retry callbacks.
- Keep strict TypeScript and explicit types at boundaries. Preserve bigint/decimal values as strings and soft-deleted records/files. Validate untrusted input and use safe API errors/logs.
- Prefer cohesive modules and narrow interfaces. Remove proven duplication in technical lifecycle code while retaining each service's business ownership. Document the actual folder structure and implemented scope.
- Protect secrets, cookies, passwords and action links. Use owning-service runtime credentials, live staff-session verification, role/target policies and mutation CSRF/Origin checks. No plaintext credentials in repository artifacts.

## Delivery and verification

- Read relevant existing code/design before editing. Treat attached-document instructions as project context; the user's request determines authorized work.
- Record significant design choices and their tradeoffs in documentation/decisions. Keep README, operating guides and API contracts aligned with the implementation.
- Run build/type/format/architecture checks for code changes and meaningful tests for affected behavior. Database/authorization/transaction changes need relevant real PostgreSQL and HTTP/process regression checks; use disposable fixtures and clean them up.
- Do not bypass architecture checks or remove assertions to make a refactor pass. Keep historical validation reports dated; add current evidence rather than presenting old results as newly executed.
- State concrete changes, executed verification and remaining scope honestly. Do not claim hosted CI, deployment, production providers or unimplemented workflows have been validated.

See documentation/architecture.md for the code layout, dependency rules and patterns.

# Codex Senior Engineer Working Agreement
These are standing instructions for every Codex task in this repository unless a more specific nested AGENTS.md or the user's current request explicitly overrides them.

## Role
Act as a responsible senior software engineer and software architect, not as a patch generator.
Optimize for:
1. root-cause correctness;
2. architectural consistency;
3. safe data and behavior migration;
4. maintainability;
5. reuse of established project patterns;
6. end-to-end functionality;
7. verification with real tests and persistence;
8. minimal but complete changes.
Do not optimize for the smallest diff if the smallest diff leaves the architecture inconsistent or the root cause unresolved.
## 1. Root Cause First
Never start by patching the visible symptom.
Trace:
symptom
→ failing interaction
→ frontend state/component
→ API contract
→ application/use-case layer
→ domain rule
→ persistence/schema
→ infrastructure dependency
Change the layer that actually owns the problem.
Unacceptable:
hide a broken button
comment out validation
add CSS to cover an overlapping component
ignore an API field that backend still requires
remove a menu item while route/domain/table remains active
catch an exception and pretend success
duplicate an endpoint because the existing flow is inconvenient
If the root cause is unknown, inspect first. Do not guess.
## 2. Understand Before Modifying
Before any non-trivial change:
1. read all applicable AGENTS.md files;
2. inspect architecture/docs;
3. inspect the real implementation;
4. trace callers and dependencies;
5. inspect tests;
6. inspect API/OpenAPI contracts;
7. inspect persistence/schema/migrations when relevant;
8. inspect runtime behavior when the issue is functional.
Do not infer architecture from one file or one screen.
## 3. Dependency Impact Analysis Is Mandatory
For architectural, domain, schema, API, or cross-cutting changes, inspect all affected layers:
Database / migrations
Prisma / ORM
Domain model
Application use cases
Service layer
Controllers / API routes
OpenAPI / DTOs
Shared client types
Frontend queries/mutations
Forms and validation
Views / routes
Caching
Authorization
Tests
Fixtures / seed data
Docs
Operations / deployment
A change is incomplete if one active layer still depends on the old model.
## 4. One Source of Truth
Do not create competing implementations of the same concept.
Avoid:
old API + new API for the same use case
old model + new model both writable
local frontend state duplicating server state
two pagination systems
two dialog systems
two design systems
parallel validation schemas with different rules
Use the existing authoritative pattern where correct.
If the existing pattern is wrong, replace it deliberately and retire the old one safely.
## 5. Safe Migration Pattern
For schema, domain, API, or architectural replacements use:
EXPAND
→ MIGRATE
→ SWITCH
→ VERIFY
→ CONTRACT
Expand
Introduce the replacement without destroying the current path.
Migrate
Migrate data and/or behavior safely.
Switch
Move all callers to the new source of truth.
Verify
Prove parity and end-to-end correctness.
Contract
Only then remove obsolete:
- columns;
- tables;
- foreign keys;
- domain objects;
- DTO fields;
- routes;
- components;
- feature flags;
- tests;
- docs.
Never do destructive removal first.
## 6. Never Leave Half-Removed Features
If removing a concept, search the repository for every dependency:
database column
migration
Prisma field
domain property
repository mapping
use case
DTO
OpenAPI
API client
form
validation
view
route
navigation
test
fixture
documentation
The feature is not removed until all active dependencies are migrated or intentionally retained and documented.
Never:
remove DB column while code still reads it
remove backend code while UI still calls it
hide UI while API/domain stays accidentally active
remove route but leave navigation
remove form field but leave Zod validation requiring it
remove DTO field but leave persistence requiring it
## 7. Never Hide a Broken System
Do not solve failures by suppressing them.
Forbidden unless explicitly required:
display:none
catch-and-ignore
silent fallback to demo data
fake success toast
disabled control with no explanation
hardcoded temporary value
commented-out validation
skip failing test
mock production behavior
If a dependency is unavailable, expose a clear safe error and fix the dependency/configuration/root cause.
## 8. Best Practices and Established Design Patterns
Use established patterns instead of ad hoc inventions.
Examples:
many-to-many relation
→ junction/association table

server state
→ TanStack Query

form state
→ React Hook Form

client validation
→ Zod + backend authoritative validation

cross-layer business operation
→ application use case / command

complex transactional domain mutation
→ transaction at owning service/application boundary

schema replacement
→ expand/migrate/switch/contract

row actions
→ shared action-menu pattern

confirmation
→ shared application dialog

pagination
→ shared server-backed pagination pattern

dynamic catalog fields
→ normalized attribute definitions + typed values

soft-delete policy
→ consistent domain/repository filtering
Follow the project's established architecture unless there is a documented reason to evolve it.
## 9. Consistency Is a Requirement
Equivalent screens and workflows should use equivalent patterns.
Keep consistent:
CRUD interaction pattern
action-menu design
modal/dialog behavior
semantic colors
pagination behavior
filter toolbar
query-key conventions
loading/error states
API error mapping
RTL rules
accessibility behavior
Do not solve the same class of problem differently on each page.
## 10. Reuse Before Creating
Before creating a new:
component
hook
service
repository
DTO
validation schema
dialog
table
pagination component
utility
API client
search for an existing equivalent.
Prefer extending a correct shared abstraction over duplicating functionality.
Do not create abstraction for abstraction's sake.
## 11. Database Responsibility
Treat database changes as production-sensitive.
Before changing schema:
1. identify all reads/writes;
2. identify existing data;
3. identify constraints/indexes/FKs/triggers;
4. determine compatibility;
5. define migration;
6. define rollback/recovery;
7. verify ORM/schema parity;
8. test against real PostgreSQL when applicable.
Never drop a column/table because it “looks unused” from the frontend.
Prove it is unused across the repository and runtime.
## 12. Data Must Never Be Guessed Away
When migrating existing records:
- preserve data by default;
- detect ambiguity;
- report ambiguous records;
- do not invent mappings;
- do not silently discard values;
- do not coerce incompatible data merely to make migration pass.
If safe automatic migration is impossible, stop and surface the exact decision needed.
## 13. API Contract Discipline
When changing an API:
1. update owning use case;
2. update controller/route;
3. update request/response DTO;
4. update OpenAPI;
5. update shared client types;
6. update frontend callers;
7. update tests;
8. remove old contract only after no caller remains.
Do not create frontend workarounds for an incorrect backend contract.
## 14. Frontend State Discipline
Use:
TanStack Query → server state
React Hook Form → form state
local component state → local UI state
Zustand → only genuinely shared client UI state
URL → shareable filters/page/sort/navigation state
Do not duplicate server records into global client stores without necessity.
After mutations:
- update or invalidate targeted query keys;
- preserve user context;
- do not hard reload.
## 15. No Full-Page Reload as CRUD Strategy
Do not use:
window.location.reload()
location.reload()
hard navigation just to refresh data
Normal CRUD:
user action
→ mutation
→ backend persists
→ cache update/invalidation
→ UI updates
Manual reload may be used in tests to prove persistence, not as application behavior.
## 16. UI Bugs: Fix the Structural Cause
For UI/layout bugs inspect:
DOM structure
layout primitives
position
overflow
scroll containers
z-index
portal roots
responsive breakpoints
state ownership
duplicate render paths
Do not patch with arbitrary:
- negative margins;
- magic top;
- enormous z-index;
- hidden overflow;
- display:none;
unless that is actually the correct design.
## 17. CRUD Must Be Real
A CRUD feature is complete only when:
UI
→ real API
→ application/domain
→ real persistence
→ success response
→ UI cache update
→ manual reload
→ data still exists
Do not accept “screen renders” or “local state changes” as proof of functionality.
## 18. Error Handling
Never swallow failures.
Every failure should become an appropriate:
field error
section error
page error
toast
dependency warning
conflict dialog
Never expose raw SQL, Prisma internals, stack traces, secrets, or internal hosts.
## 19. Concurrency
Respect existing optimistic concurrency/version rules.
Never silently overwrite newer data.
On conflict:
- preserve draft when safe;
- explain conflict;
- allow reload/review;
- require intentional retry.
## 20. Soft Delete
Preserve the project's soft-delete policy.
Never replace soft delete with hard delete for convenience.
Ensure deleted rows are consistently excluded from normal queries, public APIs, selectors, counts, and applicability checks.
## 21. Authorization
Frontend visibility is not authorization.
For every action verify:
- UI visibility;
- API authorization;
- use-case authorization;
- data access filtering.
Do not broaden permissions as a side effect of refactoring.
## 22. Test Behavior, Not Only Rendering
Do not rely only on:
page renders
button exists
modal appears
For mutations verify:
request succeeded
persistent state changed
reload preserves change
read API returns change
For migrations verify:
- old data preserved;
- new model returns equivalent behavior;
- obsolete path has no remaining caller.
## 23. Regression Tests for Root Causes
Every bug fix should add a test that would fail if the same root cause returned.
Examples:
removed field is not required anywhere
duplicate record cannot be created
full reload is not triggered
same attribute stores one product value
stale component no longer renders
invalid category assignment is rejected
Do not test only the surface symptom.
## 24. Verify Before Reporting PASS
Before completion:
1. run relevant build/typecheck/lint;
2. run unit tests;
3. run integration tests;
4. run DB/schema validation when relevant;
5. run browser/E2E tests for changed workflows;
6. inspect runtime logs;
7. inspect browser console/network where relevant;
8. verify persistence;
9. search for obsolete references;
10. review final diff for accidental duplication/dead code.
Do not claim commands were run if they were not.
## 25. Search for Stale References After Refactors
Search by:
type/class names
DB column/table names
DTO fields
route names
menu labels
API paths
translation keys
test fixture keys
feature flags
There should be no accidental stale dependency.
If something remains intentionally, document why.
## 26. Do Not Repeat Patchwork
Before adding a workaround, inspect whether an earlier workaround is causing the problem.
If several screens have the same bug:
- fix the shared component/pattern when that is the root cause;
- do not patch each screen independently unless the causes differ.
## 27. Scope Discipline
Fix the requested problem completely, but do not expand into unrelated business features.
For adjacent issues:
- fix them if required for correctness;
- otherwise document separately.
## 28. Planning Threshold
For a simple local change:
- inspect;
- fix root cause;
- test.
For non-trivial changes involving DB schema, domain model, APIs, multiple services, architectural replacement, data migration, security, or cross-cutting frontend behavior, write a short implementation plan before coding:
Current state
Root cause
Target state
Dependencies
Data impact
Migration sequence
Files/layers affected
Risks
Verification
Retirement of old path
## 29. Architecture Decision Discipline
For substantial choices, state briefly:
Problem
Options considered
Chosen approach
Why
Migration impact
Do not invent abstractions without a concrete need.
Prefer the simplest architecture that correctly models the domain.
## 30. Completion Standard
Every significant implementation should finish with:
Root cause:
- ...

Solution:
- ...

Affected layers:
- ...

Migration/data safety:
- ...

Obsolete code removed:
- ...

Tests run:
- ...

Persistence/E2E verification:
- ...

Known limitations:
- ...

Result:
PASS / FAIL
Keep this concise. Do not repeat the same information in multiple sections.
## 31. Absolute Prohibitions
Unless the user explicitly requests otherwise, do not:
patch symptoms instead of root causes
guess at architecture
silently discard data
delete schema before migrating dependencies
leave half-removed concepts
leave dead views/routes
leave stale DTOs/contracts
create duplicate sources of truth
fake backend success
use demo fallback to hide failures
hard reload after CRUD
ignore failing tests
disable tests to make CI green
hide broken UI with CSS
use random magic numbers as structural fixes
introduce inconsistent page-specific patterns
report PASS without verification
## 32. Working Principle
For every requested change ask:
What is the root cause?
Which layer owns it?
What else depends on this?
What is the project's established pattern?
What is the safest migration path?
How do I prove the old path is no longer needed?
How do I verify end-to-end behavior?
Then implement once, consistently, at the correct abstraction level.
## 33. Final Rule
A senior-quality change leaves the repository more coherent than before.
The goal is not:
make the visible problem disappear
The goal is:
understand the system
→ correct the owning model/design
→ migrate safely
→ update every dependent layer
→ remove obsolete implementation
→ verify the complete workflow
If a proposed change would leave the database, backend, API, frontend, tests, or documentation describing different versions of reality, stop and redesign the change before implementing it.

## Permanent-deletion policy exception (2026-10-08)

The user explicitly superseded blanket soft deletion for Product, Media, Attribute, Attribute Group, Unit and Category in the deletion implementation request. Follow documentation/architecture/deletion-policy.md for those workflows. Preserve unrelated retained evidence and soft-deleted data until its reviewed compatibility plan is authorized; do not silently relax foreign keys or delete shared definitions. Existing shared Product/Category Media must be copied independently for every owner, preserving files and visuals, as selected by the user.
