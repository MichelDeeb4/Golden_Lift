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
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA :"service_schema", ops FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA :"service_schema", ops REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
\if :is_catalog
REVOKE ALL ON catalog.write_gate FROM :"runtime_role";
GRANT EXECUTE ON FUNCTION catalog.soft_delete_branch(uuid,bigint),
    catalog.soft_delete_technical_sheet(uuid,bigint),
    catalog.retire_media_asset(uuid,text,bigint) TO :"runtime_role";
\endif
COMMIT;
