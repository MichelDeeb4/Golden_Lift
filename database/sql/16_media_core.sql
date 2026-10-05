-- B5 additive Media upgrade. Apply with psql --single-transaction as Media owner.
ALTER TABLE media.assets
  ADD COLUMN security_state text NOT NULL DEFAULT 'UNVERIFIED' CHECK (security_state IN ('UNVERIFIED','VERIFIED','BLOCKED','REJECTED')),
  ADD COLUMN input_version text,
  ADD COLUMN pipeline_version text,
  ADD COLUMN verification jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(verification)='object'),
  ADD COLUMN failure_code text;
ALTER TABLE media.asset_variants ADD COLUMN sha256 bytea CHECK (sha256 IS NULL OR octet_length(sha256)=32),
  ADD COLUMN generation uuid, ADD COLUMN object_version text;
-- Profile aliases may reference the same immutable result when no upscaling makes bounds coincide.
ALTER TABLE media.asset_variants DROP CONSTRAINT asset_variants_storage_bucket_storage_key_key;
CREATE INDEX asset_variants_storage_identity_idx ON media.asset_variants(storage_bucket,storage_key);
CREATE TRIGGER variant_identity BEFORE UPDATE ON media.asset_variants FOR EACH ROW
  EXECUTE FUNCTION ops.immutable_fields('asset_id','variant_key','mime_type','storage_bucket','storage_key','byte_size','sha256','generation','object_version','width_px','height_px','duration_ms');
ALTER TABLE media.asset_variants ADD CONSTRAINT variant_generation_key CHECK
  (generation IS NULL OR storage_key LIKE 'outputs/'||asset_id::text||'/'||generation::text||'/%');
ALTER TABLE media.upload_sessions
  ADD COLUMN idempotency_key text,
  ADD COLUMN request_hash text CHECK (request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN declared_sha256 text CHECK (declared_sha256 IS NULL OR declared_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN purpose text CHECK (purpose IN ('CATALOG','TECHNICAL_SOURCE')),
  ADD COLUMN parts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parts)='object'),
  ADD COLUMN sealing_token uuid;
ALTER TABLE media.upload_sessions ADD COLUMN reserved_byte_size bigint NOT NULL DEFAULT 0 CHECK (reserved_byte_size>=0);
ALTER TABLE media.processing_jobs ADD COLUMN attempt_history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attempt_history)='array');
ALTER TABLE media.upload_sessions DROP CONSTRAINT upload_sessions_status_check;
ALTER TABLE media.upload_sessions ADD CONSTRAINT upload_sessions_status_check
  CHECK (status IN ('OPEN','SEALING','COMPLETED','EXPIRED','FAILED','CANCELLED'));
CREATE UNIQUE INDEX upload_idempotency_uq ON media.upload_sessions(uploader_staff_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE FUNCTION media.protect_verified_input() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.security_state IN ('BLOCKED','REJECTED') AND NEW.security_state IS DISTINCT FROM OLD.security_state THEN
    RAISE EXCEPTION 'Security denial cannot be cleared without a reviewed revalidation workflow' USING ERRCODE='23514';
  END IF;
  IF OLD.sha256 IS NOT NULL AND (NEW.sha256 IS DISTINCT FROM OLD.sha256 OR
    NEW.byte_size IS DISTINCT FROM OLD.byte_size OR NEW.input_version IS DISTINCT FROM OLD.input_version) THEN
    RAISE EXCEPTION 'Sealed input is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.pipeline_version IS NOT NULL AND NEW.status='READY' AND
    (NEW.security_state NOT IN ('VERIFIED','BLOCKED') OR NOT NEW.verification ? 'scanner') THEN
    RAISE EXCEPTION 'B5 readiness requires verification evidence' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER verified_input BEFORE UPDATE ON media.assets FOR EACH ROW EXECUTE FUNCTION media.protect_verified_input();
CREATE FUNCTION media.validate_outputs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a media.assets%ROWTYPE; required text[];
BEGIN
  SELECT * INTO a FROM media.assets WHERE id=CASE WHEN TG_TABLE_NAME='assets'
    THEN (to_jsonb(NEW)->>'id')::uuid ELSE (to_jsonb(NEW)->>'asset_id')::uuid END;
  IF a.pipeline_version IS NULL OR a.status<>'READY' OR a.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
  required := CASE a.media_kind WHEN 'IMAGE' THEN ARRAY['thumbnail','card','detail','large']
    WHEN 'VIDEO' THEN ARRAY['playback','poster'] ELSE ARRAY['preview'] END;
  IF EXISTS(SELECT 1 FROM unnest(required) r WHERE NOT EXISTS(SELECT 1 FROM media.asset_variants v
    WHERE v.asset_id=a.id AND v.variant_key=r AND v.deleted_at IS NULL AND v.sha256 IS NOT NULL AND v.generation IS NOT NULL)) THEN
    RAISE EXCEPTION 'Required verified outputs are missing' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER required_outputs AFTER INSERT OR UPDATE ON media.assets
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION media.validate_outputs();
CREATE CONSTRAINT TRIGGER required_outputs AFTER INSERT OR UPDATE ON media.asset_variants
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION media.validate_outputs();
CREATE TRIGGER upload_identity BEFORE UPDATE ON media.upload_sessions FOR EACH ROW
  EXECUTE FUNCTION ops.immutable_fields('asset_id','uploader_staff_id','expected_byte_size','idempotency_key','request_hash','declared_sha256','purpose');
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA media FROM PUBLIC;
