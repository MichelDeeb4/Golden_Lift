\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL SERIALIZABLE;

INSERT INTO catalog.media_asset_refs(id,media_kind,source_version,ready_at) VALUES
('c1000000-0000-4000-8000-000000000001','IMAGE',1,clock_timestamp()),
('c1000000-0000-4000-8000-000000000002','VIDEO',1,clock_timestamp());
INSERT INTO catalog.categories(id,parent_id) VALUES
('c2000000-0000-4000-8000-000000000001',NULL),
('c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001'),
('c2000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000002'),
('c2000000-0000-4000-8000-000000000004',NULL);
INSERT INTO catalog.category_translations(category_id,locale,name) SELECT id,'ar','اختبار شجرة' FROM catalog.categories WHERE id::text LIKE 'c2000000%';
INSERT INTO catalog.products(id,category_id,cover_media_id,current_model_code_id) VALUES
('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001'),
('c3000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000002',NULL);
INSERT INTO catalog.product_translations(product_id,locale,name) SELECT id,'ar','منتج اختبار' FROM catalog.products WHERE id::text LIKE 'c3000000%';
INSERT INTO catalog.product_media(id,product_id,asset_id) VALUES
('c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001'),
('c4000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001');
INSERT INTO catalog.product_code_reservations(id,product_id,code) VALUES('c5000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','TREE-TEST-OLD');
INSERT INTO catalog.units(code,symbol,dimension) VALUES('tree_mm','mm','length');
INSERT INTO catalog.specification_definitions(id,code,value_type,unit_code,minimum_value,maximum_value) VALUES
('c6000000-0000-4000-8000-000000000001','tree_width','NUMBER','tree_mm',100,3000),
('c6000000-0000-4000-8000-000000000002','tree_finish','CHOICE',NULL,NULL,NULL),
('c6000000-0000-4000-8000-000000000003','tree_text','TEXT',NULL,NULL,NULL);
INSERT INTO catalog.specification_translations(definition_id,locale,label) SELECT id,'ar','صفة اختبار' FROM catalog.specification_definitions WHERE id::text LIKE 'c6000000%';
INSERT INTO catalog.category_specifications(category_id,definition_id) SELECT 'c2000000-0000-4000-8000-000000000003',id FROM catalog.specification_definitions WHERE id::text LIKE 'c6000000%';
INSERT INTO catalog.specification_options(id,definition_id,code) VALUES
('c7000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002','silver'),
('c7000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000002','gold');
INSERT INTO catalog.specification_option_translations(option_id,locale,label) SELECT id,'ar','لون اختبار' FROM catalog.specification_options WHERE id::text LIKE 'c7000000%';
INSERT INTO catalog.product_specification_values(id,product_id,definition_id,value_type,number_value) VALUES
('c8000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','NUMBER',1000),
('c8000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002','CHOICE',NULL),
('c8000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003','TEXT',NULL);
INSERT INTO catalog.product_specification_choices(value_id,definition_id,option_id) VALUES('c8000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000002','c7000000-0000-4000-8000-000000000001');
INSERT INTO catalog.product_specification_texts(value_id,locale,text_value) VALUES('c8000000-0000-4000-8000-000000000003','ar','نص اختبار');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $$ BEGIN
  BEGIN
    UPDATE catalog.categories SET parent_id='c2000000-0000-4000-8000-000000000003' WHERE id='c2000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: multi-node cycle';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.product_media SET asset_id='c1000000-0000-4000-8000-000000000002' WHERE id='c4000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: VIDEO cover';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.products SET cover_media_id='c4000000-0000-4000-8000-000000000002' WHERE id='c3000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: another product cover';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.product_translations SET deleted_at=clock_timestamp() WHERE product_id='c3000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: missing Arabic product name';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.product_specification_values SET number_value=50 WHERE id='c8000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: numeric lower bound';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.category_specifications SET deleted_at=clock_timestamp() WHERE definition_id='c6000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: removed applicability';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO catalog.product_specification_choices(value_id,definition_id,option_id) VALUES('c8000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000002','c7000000-0000-4000-8000-000000000002');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: single choice accepted two options';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.product_specification_texts SET deleted_at=clock_timestamp() WHERE value_id='c8000000-0000-4000-8000-000000000003';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: text fallback missing';
  EXCEPTION WHEN check_violation THEN NULL; END;
END; $$;
-- Move the middle branch under another root; IDs, assignments and products persist.
UPDATE catalog.categories SET parent_id='c2000000-0000-4000-8000-000000000004' WHERE id='c2000000-0000-4000-8000-000000000002' AND version=1;
INSERT INTO catalog.product_code_reservations(id,product_id,code) VALUES('c5000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','TREE-TEST-NEW');
UPDATE catalog.products SET current_model_code_id='c5000000-0000-4000-8000-000000000002' WHERE id='c3000000-0000-4000-8000-000000000001' AND version=1;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM catalog.live_products WHERE id='c3000000-0000-4000-8000-000000000001' AND category_id='c2000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'TEST FAILED: branch move changed product identity'; END IF;
  BEGIN
    INSERT INTO catalog.product_code_reservations(product_id,code) VALUES('c3000000-0000-4000-8000-000000000002',' tree-test-old ');
    RAISE EXCEPTION 'TEST FAILED: replaced model code reused';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END; $$;
SELECT catalog.soft_delete_branch('c2000000-0000-4000-8000-000000000004',1);
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM catalog.live_products WHERE id::text LIKE 'c3000000%') THEN RAISE EXCEPTION 'TEST FAILED: branch deletion leaked descendants'; END IF;
  IF NOT EXISTS(SELECT 1 FROM catalog.media_asset_refs WHERE id='c1000000-0000-4000-8000-000000000001' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'TEST FAILED: shared image was deleted'; END IF;
END; $$;
ROLLBACK;
\echo 'Deep tree, branch moves, cover ownership and typed specification checks passed.'
