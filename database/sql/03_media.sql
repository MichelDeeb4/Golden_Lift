\set ON_ERROR_STOP on
-- Run ONLY against golden_lift_media, as a migration owner.
\ir 00_common.sql
CREATE SCHEMA media;
REVOKE ALL ON SCHEMA media FROM PUBLIC;

-- Authoritative files and readiness; binaries remain in private object storage.
CREATE TABLE media.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_kind text NOT NULL CHECK (media_kind IN ('IMAGE','VIDEO','PDF')),
  status text NOT NULL DEFAULT 'UPLOADING' CHECK (status IN ('UPLOADING','PROCESSING','READY','FAILED')),
  original_name text NOT NULL,
  storage_bucket text NOT NULL,
  storage_key text NOT NULL,
  detected_mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size > 0),
  sha256 bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
  width_px integer CHECK (width_px IS NULL OR width_px > 0),
  height_px integer CHECK (height_px IS NULL OR height_px > 0),
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  retirement_event_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (storage_bucket, storage_key),
  CHECK (status <> 'READY' OR (detected_mime_type IS NOT NULL AND byte_size IS NOT NULL AND sha256 IS NOT NULL)),
  CHECK (deleted_at IS NULL OR retirement_event_id IS NOT NULL)
);
CREATE INDEX media_assets_library_live_idx ON media.assets (media_kind, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX media_assets_state_live_idx ON media.assets (status, created_at, id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON media.assets FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON media.assets FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Image sizes, video renditions/posters/manifests, and PDF previews.
CREATE TABLE media.asset_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES media.assets(id) ON DELETE RESTRICT,
  variant_key text NOT NULL CHECK (length(btrim(variant_key)) > 0),
  mime_type text NOT NULL,
  storage_bucket text NOT NULL,
  storage_key text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width_px integer CHECK (width_px IS NULL OR width_px > 0),
  height_px integer CHECK (height_px IS NULL OR height_px > 0),
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (storage_bucket, storage_key)
);
CREATE UNIQUE INDEX asset_variant_live_uq ON media.asset_variants (asset_id, variant_key) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON media.asset_variants FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON media.asset_variants FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Resumable/expiring upload state.
CREATE TABLE media.upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES media.assets(id) ON DELETE RESTRICT,
  uploader_staff_id uuid NOT NULL,
  provider_upload_id text,
  expected_byte_size bigint CHECK (expected_byte_size IS NULL OR expected_byte_size > 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','EXPIRED','FAILED')),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX upload_open_asset_uq ON media.upload_sessions (asset_id) WHERE deleted_at IS NULL AND status = 'OPEN';
CREATE INDEX upload_expiry_idx ON media.upload_sessions (expires_at, id) WHERE deleted_at IS NULL AND status = 'OPEN';
CREATE TRIGGER a_update_guard BEFORE UPDATE ON media.upload_sessions FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON media.upload_sessions FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Background validation/transcoding work with retry and lease state.
CREATE TABLE media.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES media.assets(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('VALIDATE','IMAGE_VARIANTS','VIDEO_TRANSCODE','PDF_PREVIEW')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_until timestamptz,
  lease_token uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX processing_active_job_uq ON media.processing_jobs (asset_id, job_type) WHERE deleted_at IS NULL AND status IN ('QUEUED','RUNNING');
CREATE INDEX processing_ready_queue_idx ON media.processing_jobs (next_attempt_at, created_at, id) WHERE deleted_at IS NULL AND status = 'QUEUED';
CREATE INDEX processing_stale_lease_idx ON media.processing_jobs (locked_until, id) WHERE deleted_at IS NULL AND status = 'RUNNING';
CREATE TRIGGER a_update_guard BEFORE UPDATE ON media.processing_jobs FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON media.processing_jobs FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

CREATE FUNCTION media.protect_asset_semantics() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.media_kind IS DISTINCT FROM OLD.media_kind
     OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
     OR NEW.storage_key IS DISTINCT FROM OLD.storage_key THEN
    RAISE EXCEPTION 'Asset kind and original storage identity are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'READY' AND NEW.status <> 'READY' THEN
    RAISE EXCEPTION 'An attached-ready asset cannot regress to a processing state' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER asset_semantics BEFORE UPDATE ON media.assets
FOR EACH ROW EXECUTE FUNCTION media.protect_asset_semantics();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA media FROM PUBLIC;

