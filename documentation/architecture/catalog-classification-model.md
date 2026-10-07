# Category-driven catalog classification

Status: **implementation in progress**, 2026-10-07. The normal project still runs the previous Product Type workflows. [Decision 015](../decisions/015-category-driven-catalog.md) defines the replacement; the following describes the implemented migration foundation and the intended runtime cutover.

```mermaid
erDiagram
  CATEGORY ||--o{ CATEGORY : children
  CATEGORY ||--o{ PRODUCT : leaf_owns
  CATEGORY ||--o{ CATEGORY_ATTRIBUTE_GROUP : assigns
  ATTRIBUTE_GROUP ||--o{ CATEGORY_ATTRIBUTE_GROUP : reused_by
  ATTRIBUTE_GROUP ||--o{ ATTRIBUTE_GROUP_ATTRIBUTE : contains
  ATTRIBUTE ||--o{ ATTRIBUTE_GROUP_ATTRIBUTE : reused_in
  PRODUCT ||--o{ PRODUCT_ATTRIBUTE_VALUE : stores
  ATTRIBUTE ||--o{ PRODUCT_ATTRIBUTE_VALUE : defines
```

Only a live leaf can own products or group placements. A reusable group can appear in several categories; a reusable attribute can appear in several groups. The existing typed value tables retain the unique live `(product_id, definition_id)` key. No Product Type substitute or JSON specification blob is introduced.

SQL expansion 23 introduces ordered category/group and group/attribute joins and the `category_effective_attributes` view. First category-group order, then member order, then UUID ties determine presentation. Repeated attributes resolve once at their first group. Requiredness combines with OR. Disclosure, searchable, filterable and comparable permissions combine with AND, including global definition privacy and filterability. Numeric bounds, units, multilingual text and choices remain definition-owned.

The Catalog-owned `GET /api/v1/admin/categories/{id}/schema?locale=en` endpoint supplies both effective configuration and generated form fields in one bounded repeatable-read Prisma snapshot. It rejects incomplete migration stages. The application use case enforces ADMIN authorization; the controller uses the existing live session authenticator. Gateway forwards this explicit route. SUPER_ADMIN retains staff administration permissions and cannot read content configuration. Group and effective-field collections are bounded at 500; overflow is rejected rather than silently truncated.

SQL cutover 24 has been exercised on disposable databases. It changes eligibility, publication integrity, privacy and reverse schema dependencies together. Inactive drafts can omit a cover and required values. Published products require a verified image cover, valid required category fields and explicit resolution of retained nonapplicable values. Changing category can retain values in an inactive product; nonapplicable values are hidden from public delivery and cannot be edited as applicable fields. They are never silently deleted.

The cutover retires legacy type tables as immutable owner-only migration evidence, closes their writes, revokes runtime access and removes the old service stage sentinel. Old binaries therefore reject dynamic operations after cutover. This is a coordinated release requirement: do not apply cutover 24 to the normal project while its application still depends on Product Type.

Still required: replace Product Type repositories/use cases/contracts/routes/selectors, implement reviewed relationship mutations and category changes, update publication/draft DTOs and Prisma bindings, complete the recursive tree and multi-select workflows, and integrate public contextual navigation and Media presentation. The new read endpoint and migrations alone do not complete that scope.
