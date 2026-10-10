\set ON_ERROR_STOP on
ALTER TABLE media.assets ADD COLUMN deletion_pending boolean NOT NULL DEFAULT false;
CREATE TABLE ops.deletion_operations (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL CHECK(entity_type='MEDIA'),
  entity_id text NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL CHECK(status IN ('MEDIA_CLEANUP','COMPLETED','RETRYABLE')),
  failure_code text,
  retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count>=0),
  completed_at timestamptz,
  asset_ids uuid[] NOT NULL DEFAULT '{}',
  owner_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE TRIGGER deletion_operations_no_delete BEFORE DELETE OR TRUNCATE ON ops.deletion_operations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['assets','asset_variants','processing_jobs','upload_sessions'] LOOP
    EXECUTE format('DROP TRIGGER no_physical_delete ON media.%I',name);
  END LOOP;
END; $$;
