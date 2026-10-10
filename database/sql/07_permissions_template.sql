\set ON_ERROR_STOP on
-- Apply as the service database owner. Supply identifier variables with -v.
-- Example: -v database_name=golden_lift_catalog -v service_schema=catalog
--          -v owner_role=golden_lift_catalog_owner -v runtime_role=golden_lift_catalog_runtime -v is_catalog=true
-- Credentials are provisioned separately; this script contains none.
BEGIN;
SET ROLE :"owner_role";
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO :"runtime_role";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA :"service_schema", ops TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA :"service_schema" TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON ops.outbox_events TO :"runtime_role";
GRANT SELECT, INSERT ON ops.inbox_messages TO :"runtime_role";
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA :"service_schema", ops FROM :"runtime_role";
SELECT to_regclass('ops.deletion_operations') IS NOT NULL AS deletion_expanded \gset
\if :deletion_expanded
GRANT SELECT,INSERT,UPDATE ON ops.deletion_operations TO :"runtime_role";
\if :is_catalog
GRANT EXECUTE ON FUNCTION catalog.retained_deletion_dependencies(text,uuid) TO :"runtime_role";
GRANT DELETE ON catalog.products,catalog.product_translations,catalog.product_code_reservations,
catalog.product_media,catalog.product_media_translations,catalog.product_specification_values,
catalog.product_specification_texts,catalog.product_specification_choices,catalog.product_technical_sheets,
catalog.product_technical_configurations,catalog.categories,catalog.category_translations,
catalog.category_specifications,catalog.category_technical_sheets,catalog.category_attribute_groups,
catalog.attribute_group_attributes,catalog.specification_definitions,catalog.specification_translations,
catalog.specification_options,catalog.specification_option_translations,catalog.specification_groups,
catalog.specification_group_translations,catalog.units,catalog.unit_translations,catalog.media_asset_refs TO :"runtime_role";
\else
GRANT DELETE ON media.assets,media.asset_variants,media.processing_jobs,media.upload_sessions TO :"runtime_role";
\endif
\endif
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA :"service_schema", ops FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA :"service_schema", ops REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
\if :is_catalog
REVOKE ALL ON catalog.write_gate FROM :"runtime_role";
GRANT EXECUTE ON FUNCTION catalog.soft_delete_branch(uuid,bigint),
    catalog.soft_delete_technical_sheet(uuid,bigint),
    catalog.retire_media_asset(uuid,text,bigint) TO :"runtime_role";
-- Retired type configuration remains migration-owner evidence, never runtime data.
SELECT to_regprocedure('catalog.assert_valid_category_catalog()') IS NOT NULL AS category_classification \gset
\if :category_classification
REVOKE ALL ON catalog.product_types,catalog.product_type_translations,
    catalog.product_type_groups,catalog.product_type_specifications FROM :"runtime_role";
SELECT to_regclass('catalog.retired_product_bindings') IS NOT NULL AS bindings_retired \gset
\if :bindings_retired
REVOKE ALL ON catalog.retired_product_bindings FROM :"runtime_role";
\endif
\endif
\endif
COMMIT;
