\set ON_ERROR_STOP on
-- Catalog-only smoke tests. No fixtures are committed.
-- Run as migration owner after 02_catalog.sql; NOT evidence of prior execution.
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO catalog.product_types(id,code) VALUES('ee000000-0000-4000-8000-000000000001','synthetic-final-fixture');
INSERT INTO catalog.product_type_translations(product_type_id,locale,name) VALUES('ee000000-0000-4000-8000-000000000001','ar','Synthetic fixture type');

INSERT INTO catalog.media_asset_refs(id,media_kind,source_version,ready_at)
VALUES('90000000-0000-4000-8000-000000000001','IMAGE',1,clock_timestamp());
INSERT INTO catalog.categories(id) VALUES('90000000-0000-4000-8000-000000000002');
INSERT INTO catalog.category_translations(category_id,locale,name)
VALUES('90000000-0000-4000-8000-000000000002','ar','Test category');
INSERT INTO catalog.products(id,product_type_id,category_id,cover_media_id,current_model_code_id)
VALUES('90000000-0000-4000-8000-000000000003','ee000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002',
       '90000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000005');
INSERT INTO catalog.product_translations(product_id,locale,name)
VALUES('90000000-0000-4000-8000-000000000003','ar','Test product');
INSERT INTO catalog.product_media(id,product_id,asset_id)
VALUES('90000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001');
INSERT INTO catalog.product_code_reservations(id,product_id,code)
VALUES('90000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000003','TEST-RESERVED-001');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

DO $$
BEGIN
  BEGIN
    INSERT INTO catalog.categories(id,parent_id)
    VALUES('90000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000002');
    INSERT INTO catalog.category_translations(category_id,locale,name)
    VALUES('90000000-0000-4000-8000-000000000006','ar','Invalid child');
    PERFORM catalog.assert_valid_catalog();
    RAISE EXCEPTION 'TEST FAILED: mixed category content accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'Expected rejection: mixed contents'; END;

  BEGIN
    UPDATE catalog.categories SET parent_id=id WHERE id='90000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'TEST FAILED: self-parent accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'Expected rejection: self-parent'; END;

  BEGIN
    UPDATE catalog.product_media SET deleted_at=clock_timestamp()
      WHERE id='90000000-0000-4000-8000-000000000004';
    PERFORM catalog.assert_valid_catalog();
    RAISE EXCEPTION 'TEST FAILED: missing required cover accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'Expected rejection: cover removal'; END;

  BEGIN
    PERFORM catalog.retire_media_asset('90000000-0000-4000-8000-000000000001','IMAGE',1);
    RAISE EXCEPTION 'TEST FAILED: in-use asset retired';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'Expected rejection: in-use asset retirement'; END;

  BEGIN
    DELETE FROM catalog.products WHERE id='90000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'TEST FAILED: hard delete accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'Expected rejection: physical delete'; END;

  BEGIN
    INSERT INTO catalog.product_translations(product_id,locale,name)
    VALUES('90000000-0000-4000-8000-000000000003','ar','Duplicate active translation');
    RAISE EXCEPTION 'TEST FAILED: duplicate active translation accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'Expected rejection: duplicate translation'; END;
END;
$$;

SELECT catalog.soft_delete_branch('90000000-0000-4000-8000-000000000002',1);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM catalog.live_products WHERE id='90000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'TEST FAILED: deleted product still publicly visible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM catalog.products WHERE id='90000000-0000-4000-8000-000000000003' AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'TEST FAILED: soft-deleted record was not retained';
  END IF;
  BEGIN
    UPDATE catalog.products SET deleted_at=NULL WHERE id='90000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'TEST FAILED: restoration accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'Expected rejection: restoration'; END;
  BEGIN
    INSERT INTO catalog.product_code_reservations(product_id,code)
    VALUES('90000000-0000-4000-8000-000000000003',' test-reserved-001 ');
    RAISE EXCEPTION 'TEST FAILED: reserved model code reused';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'Expected rejection: reserved code reuse'; END;
END;
$$;
SELECT catalog.retire_media_asset('90000000-0000-4000-8000-000000000001','IMAGE',1);
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
\echo 'Catalog smoke checks completed; all fixtures rolled back.'
