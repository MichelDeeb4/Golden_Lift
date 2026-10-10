\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  BEGIN
    UPDATE catalog.write_gate SET revision=revision+1;
    RAISE EXCEPTION 'TEST FAILED: direct gate access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM catalog.lock_write();
    RAISE EXCEPTION 'TEST FAILED: direct privileged function';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE catalog.categories CASCADE;
    RAISE EXCEPTION 'TEST FAILED: runtime TRUNCATE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    EXECUTE 'SET session_replication_role=replica';
    RAISE EXCEPTION 'TEST FAILED: runtime can disable triggers';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    EXECUTE 'SET ROLE business_platform_catalog_owner';
    RAISE EXCEPTION 'TEST FAILED: runtime can become owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO catalog.categories DEFAULT VALUES;
    RAISE EXCEPTION 'TEST FAILED: nonserializable write accepted';
  EXCEPTION WHEN SQLSTATE '25000' THEN NULL; END;
END; $$;
ROLLBACK;
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO catalog.categories(id) VALUES('b4000000-0000-4000-8000-000000000001');
INSERT INTO catalog.category_translations(category_id,locale,name) VALUES('b4000000-0000-4000-8000-000000000001','ar','اختبار الصلاحيات');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $$ DECLARE affected integer; BEGIN
  UPDATE catalog.categories SET sort_order=2048 WHERE id='b4000000-0000-4000-8000-000000000001' AND version=1;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'TEST FAILED: expected version edit'; END IF;
  UPDATE catalog.categories SET sort_order=3072 WHERE id='b4000000-0000-4000-8000-000000000001' AND version=1;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'TEST FAILED: stale edit overwritten'; END IF;
END; $$;
SELECT catalog.soft_delete_branch('b4000000-0000-4000-8000-000000000001',2);
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
\echo 'Catalog runtime privilege and optimistic version checks passed.'
