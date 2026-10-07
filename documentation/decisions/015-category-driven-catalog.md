# 015 — Leaf categories own product specification schemas

Date: 2026-10-07. Supersedes the classification choice in decision 006 for the new phase. See the [baseline](../implementation/catalog-model-and-ux-fix-baseline.md).

Remove Product Type from runtime workflows. A product belongs to exactly one leaf category. Reusable groups are assigned to leaf categories through an ordered join; reusable attributes belong to groups through another ordered join. Values retain their existing typed tables and product/definition uniqueness. There is no replacement classification entity or schema reconstructed in the browser.

Catalog provides one effective-category-schema resolver through application ports and its owning Prisma infrastructure. Resolve category-group order first, then member order; an attribute appears once at its first applicable group. Duplicate membership reads the same product value. Requiredness combines with OR; disclosure/search/filter/comparison combine conservatively across memberships and retain global definition restrictions. Group assignment removal invalidates only attributes no longer reachable through any remaining group.

Keep existing membership requiredness/disclosure flags as constraints on the joins to preserve prior effective policies. They are not a new classification layer. Global definitions still own kind, units, supported constraints, options and privacy. Public specifications and Admin controls consume the same deduplicated effective schema.

Normal Category-only creation produces an inactive draft. Drafts may lack a cover or complete required specifications; publishing requires the existing verified image cover and complete valid required values. Saved values still must have valid type, bounds, options and schema applicability. Category changes use reviewed source/destination schema comparisons, preserve shared values, retain no-longer-applicable values and require explicit resolution before publication; they never silently delete data.

Reusable relationship changes and metadata changes remain owning-service transactions with captured versions, bounded impact previews and signed preconditions. Schema revisions propagate through category/group/attribute reverse dependencies. Keep live ADMIN verification, non-hierarchical SUPER_ADMIN separation, CSRF/Origin, retained soft deletion, technical semantic locks and atomic outbox behavior.

Migration is staged and mapping-driven. The user explicitly approved mapping the existing ungrouped `length` attribute to `Dimensions`; that reviewed mapping applies only to the inventoried normal Catalog records. Reject other ambiguous category/type or reusable-group mappings and changed inventories. Verify data parity on disposable databases before normal cutover. Preserve retired legacy configuration as migration evidence without exposing old Product Type routes/selectors.

Use bounded lazy category-tree child queries, searchable/paginated selectors, shared modal/table/row-action primitives and scoped TanStack invalidation. Preserve expansion, selected nodes, filters and drafts. Visitor gallery uses a single image/video viewer with explicit media-kind cues, while PDFs remain separately permission-controlled documents. Neighbor/related/context navigation is Catalog-owned and deterministically ordered, rather than inferred from the first loaded product page.
