\set ON_ERROR_STOP on
-- Fresh installs only: v1.1 schema, additive expansion, then empty-data cutover.
\ir 02_catalog.sql
\ir 13_dynamic_catalog_expand.sql
\ir 14_dynamic_catalog_cutover.sql
