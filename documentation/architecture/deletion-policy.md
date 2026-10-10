# Business Platform deletion policy

Approved target policy, 2026-10-08. This policy supersedes blanket soft deletion for the entities below. See the implementation report for actual rollout status.

| Entity | Final behavior |
| --- | --- |
| Product | Permanently delete Product, owned values/translations/metadata and exclusive Product Media; preserve Category, Attributes, Groups and Units. |
| Media | Permanently delete original, every derivative/generation/staging object, metadata and owning gallery/cover references. Remove from Product means permanent deletion. |
| Attribute | Permanently delete definition, all typed Product values, translations/options and Group memberships; preserve Products, Groups, Categories and Units. |
| Attribute Group | Permanently delete Group and assignments/memberships; preserve Attributes; delete Product values only where no remaining Category Group supplies that Attribute. |
| Unit | Permanently delete only if no Attribute or other retained FK holder refers to it; never silently null references. |
| Category | Any Product anywhere in the recursive subtree blocks deletion; otherwise permanently delete subtree, owned translations/relations/configuration and exclusive Category Media. Preserve reusable definitions. |

Owned data may be removed with its owner. Referenced/shared business definitions remain. Blocking dependencies require an explicit move, change or prior deletion. Generic cascading is not business policy.

Each workflow has an explicit impact and deletion use case. Preview returns exact impact, entity version and dependency revision. Execution revalidates in a serializable owning-service transaction. ADMIN content authority remains enforced in use cases and authenticated/CSRF-protected transports; SUPER_ADMIN retains its separate account-management scope.

Distributed cleanup uses durable operational state and existing B5 outbox/inbox transport. Catalog owns business references and deletion intent; Media owns its metadata and physical storage. Neither service writes the other's database. The owner becomes unavailable on durable acceptance; Catalog finalizes only after Media confirms cleanup. Operational records remain for idempotency/recovery; they do not retain deleted business entities.

Existing shared assets must become independent, verified copies per Product/Category holder, as selected by the user. Never delete shared source bytes while a surviving holder still depends on them. Unrelated Identity/Inquiries, technical documentation and operational evidence retain their existing policies unless a separately reviewed change requires otherwise.
