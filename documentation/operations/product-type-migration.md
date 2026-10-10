# Product Type retirement

Updated: 2026-10-08. Product Type is historical migration evidence, not runtime classification. Products use one live leaf category. See [decision 020](../decisions/020-final-category-relationships.md) and the [earlier cutover procedure](catalog-migration.md).

For an existing pre-cutover database, stop writers, make an owning-database backup and rehearse on an isolated restore. Run the existing `npm run db:category` inventory/propose/expand/backfill/validate/cutover commands. Review the exact inventoried type/product/category/group/attribute mapping. Stop on ambiguous mappings or changed inventory. The user-approved `length` → existing `Dimensions` mapping applies only to the earlier inventoried local records; it does not authorize guesses elsewhere. SQL 23 adds relationships; SQL 24 switches authority only after relationship and typed-value parity is established.

After category authority is active and the category-only application is ready, retire the physical binding:

```powershell
npm run db:category -- retire-binding --confirm-database business_platform_catalog --output .local/retirement-evidence.json
```

Use the actual database name from the selected private configuration. `BUSINESS_PLATFORM_DATABASE_CONFIG_FILE` selects a disposable/rehearsal profile. The command requires the exact database name and a workspace `.local` evidence destination. It uses the Catalog owning role, a serializable transaction and the owning write gate. It validates category integrity, archives bindings including soft-deleted products, applies SQL 26, and compares exact product/value/Media/relationship hashes plus binding/archive parity before commit. Failure rolls back all DDL and data. No cross-service database is touched.

SQL 26 drops `products.product_type_id` with RESTRICT. It retains immutable owner-only legacy tables and `retired_product_bindings`; runtime grants exclude them. The dependent `live_products` view retains an always-NULL compatibility column, with no persistence dependency or application use. Prisma models, service contracts, schema resolution, Gateway routes and OpenAPI have no Product Type workflow. Historical SQL and migration tests intentionally retain legacy fixtures to prove conversion and retention.

Fresh category databases use SQL 25, which includes expansion, cutover and retirement in one serializable installation transaction. Do not replay fresh SQL on existing data. Do not re-run backfill/cutover after retirement. Inventory remains read-only and can read archived bindings after retirement.

The 2026-10-08 local execution created a 416,483-byte custom Catalog backup, restored an isolated rehearsal database, and passed both rehearsal and normal retirement parity. The rehearsal database was removed. Private backup and detailed hashes are in `.local/final-retirement`; credentials and raw catalog evidence are not repository artifacts. Earlier mapping/cutover validation remains dated historical evidence.

Recovery requires the verified pre-retirement backup and a coordinated application rollback. Do not recreate bindings using inferred category mappings or reset staff accounts. Production deployment/provider acceptance is separate from this local execution.
