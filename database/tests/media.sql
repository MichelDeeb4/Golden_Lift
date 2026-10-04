\set ON_ERROR_STOP on
BEGIN;
INSERT INTO media.assets(id,media_kind,original_name,storage_bucket,storage_key)
VALUES('b2000000-0000-4000-8000-000000000001','IMAGE','synthetic.jpg','test-private','synthetic/image');
DO $$ BEGIN
  BEGIN
    UPDATE media.assets SET status='READY' WHERE id='b2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: READY without validation metadata';
  EXCEPTION WHEN check_violation THEN NULL; END;
END; $$;
UPDATE media.assets SET status='READY',detected_mime_type='image/jpeg',byte_size=1024,sha256=decode(repeat('33',32),'hex') WHERE id='b2000000-0000-4000-8000-000000000001';
INSERT INTO media.asset_variants(asset_id,variant_key,mime_type,storage_bucket,storage_key,byte_size)
VALUES('b2000000-0000-4000-8000-000000000001','image_640','image/jpeg','test-private','synthetic/image_640',512);
INSERT INTO media.processing_jobs(id,asset_id,job_type,status,locked_until,lease_token)
VALUES('b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','IMAGE_VARIANTS','RUNNING',clock_timestamp()+interval '1 minute','b2000000-0000-4000-8000-000000000003');
DO $$ DECLARE affected integer; BEGIN
  UPDATE media.processing_jobs SET status='SUCCEEDED' WHERE id='b2000000-0000-4000-8000-000000000002' AND lease_token='b2000000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'TEST FAILED: stale worker fencing token'; END IF;
  BEGIN
    UPDATE media.assets SET status='PROCESSING' WHERE id='b2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: READY regression';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE media.assets SET storage_key='other' WHERE id='b2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: changed original storage key';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE media.assets SET deleted_at=clock_timestamp() WHERE id='b2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: retirement without Catalog event';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    TRUNCATE media.processing_jobs;
    RAISE EXCEPTION 'TEST FAILED: runtime TRUNCATE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
UPDATE media.assets SET deleted_at=clock_timestamp(),retirement_event_id='b2000000-0000-4000-8000-000000000005' WHERE id='b2000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  BEGIN
    UPDATE media.assets SET deleted_at=NULL WHERE id='b2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: media restoration';
  EXCEPTION WHEN check_violation THEN NULL; END;
END; $$;
ROLLBACK;
\echo 'Media runtime checks passed.'
