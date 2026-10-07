\set ON_ERROR_STOP on
-- Fresh databases only. Existing databases must use reviewed expansion/backfill/cutover.
\ir 22_catalog_admin_fresh.sql
\ir 23_category_schema_expand.sql
\ir 24_category_schema_cutover.sql
