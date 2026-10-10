# 020 — Category relationships and reviewed product placement

Date: 2026-10-08. Extends decisions 015 and 017.

Catalog owns ordered category/group and group/attribute joins. Attribute and group editors mutate the same group/attribute rows. Creation writes an owner, translations and initial relationships in one Prisma interactive transaction; failure rolls everything back. Existing owners use a preview/commit command with captured versions and a scope-bound impact fingerprint. Affected categories/products and effective schemas participate in that fingerprint, so concurrent changes require review again. Authorization remains inside application use cases.

Resolve unique attributes in category group order, then group member order. The first placement supplies the editable input; all group placement IDs remain metadata. Requiredness uses OR and disclosure capabilities use AND, preserving migrated privacy policies. Product values remain normalized typed rows with live product/definition uniqueness. Membership detachment retains attributes and stored values. Published products cannot become invalid; inactive drafts retain non-applicable values and cannot newly assign those values.

Product placement follows the same review pattern, comparing source and target schemas and identifying shared/new/removed fields. Commit retains every stored value. Published moves that would violate the destination schema are blocked until the product is unpublished and reviewed. Publication requires explicit resolution of non-applicable values, rather than deleting them implicitly.

Interactive bounds are 500 selected relationships, 100 affected categories and 1,000 affected products. Larger changes fail explicitly and require partitioned, coordinated review. New attributes default to optional, public membership subject to global definition privacy/filterability. Existing per-membership policy flags are retained. Arbitrary policy editing is not introduced as a replacement classification layer.

Category group selection and Group attribute selection are ordered. Attribute group selection is an unordered membership set; additions append the attribute within each selected Group without rewriting other member order. Product submissions accept up to 500 typed mutations, matching the form bound. Retained non-applicable values appear separately with explicit removal followed by Save; unrelated saves omit them and preserve stored rows.

Physical legacy bindings are archived before SQL 26 removes the product column. Legacy configuration and binding evidence remain immutable and inaccessible to runtime credentials. The existing `live_products` view retains a NULL compatibility slot to preserve dependent view OIDs/grants; this slot is never read by Prisma or API contracts and has no binding dependency. Dropping every dependent view merely to remove that inert slot would broaden the migration risk without changing product storage or behavior.

Visitor ancestors and neighbors come from Catalog, using eligible products in the same category and deterministic manual order/UUID ties. Related products use the category filter. Images and videos share the selected viewer; videos have a poster/play badge, while document permissions remain independent.
