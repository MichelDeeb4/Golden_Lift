\set ON_ERROR_STOP on
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- Fresh databases only. Existing databases must use reviewed expansion/backfill/cutover.
\ir 22_catalog_admin_fresh.sql
\ir 23_category_schema_expand.sql
\ir 24_category_schema_cutover.sql
\ir 26_retire_product_binding.sql
\ir 27_catalog_deletion_expand.sql

\ir 29_catalog_media_ownership.sql
