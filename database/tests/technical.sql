\set ON_ERROR_STOP on
-- Synthetic evidence and dimensions; all fixtures roll back.
BEGIN ISOLATION LEVEL SERIALIZABLE;
CREATE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',msg; END IF; END; $$;
CREATE FUNCTION pg_temp.expect_error(query text,code text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE query;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=code THEN RETURN; END IF;
    RAISE EXCEPTION 'TEST FAILED: expected %, got %: %',code,SQLSTATE,SQLERRM;
  END;
  RAISE EXCEPTION 'TEST FAILED: query accepted: %',query;
END; $$;

INSERT INTO catalog.media_asset_refs(id,media_kind,source_version,ready_at) VALUES
('a1000000-0000-4000-8000-000000000001','PDF',1,clock_timestamp()),
('a1000000-0000-4000-8000-000000000002','IMAGE',1,clock_timestamp());
INSERT INTO catalog.categories(id) VALUES('a2000000-0000-4000-8000-000000000001');
INSERT INTO catalog.category_translations(category_id,locale,name) VALUES('a2000000-0000-4000-8000-000000000001','ar','فئة اختبار');
INSERT INTO catalog.products(id,category_id,cover_media_id) VALUES('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001');
INSERT INTO catalog.product_translations(product_id,locale,name) VALUES('a3000000-0000-4000-8000-000000000001','ar','منتج اختبار');
INSERT INTO catalog.product_media(id,product_id,asset_id) VALUES('a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
INSERT INTO catalog.units(code,symbol,dimension) VALUES('test_mm','mm','length');
INSERT INTO catalog.specification_definitions(id,code,value_type,unit_code,minimum_value,maximum_value) VALUES
('a5000000-0000-4000-8000-000000000001','test_width','NUMBER','test_mm',0,5000),
('a5000000-0000-4000-8000-000000000002','test_depth','NUMBER','test_mm',0,5000);
INSERT INTO catalog.specification_translations(definition_id,locale,label) VALUES
('a5000000-0000-4000-8000-000000000001','ar','العرض'),('a5000000-0000-4000-8000-000000000002','ar','العمق');
INSERT INTO catalog.technical_sheets(id,sheet_key) VALUES
('a6000000-0000-4000-8000-000000000001','test_sheet'),('a6000000-0000-4000-8000-000000000002','test_sheet_other');
INSERT INTO catalog.technical_sheet_translations(sheet_id,locale,title) VALUES
('a6000000-0000-4000-8000-000000000001','ar','مرجع اختبار'),('a6000000-0000-4000-8000-000000000002','ar','مرجع آخر');
INSERT INTO catalog.technical_sections(id,sheet_id,section_key) VALUES('a7000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','cabin');
INSERT INTO catalog.technical_section_translations(section_id,locale,title) VALUES('a7000000-0000-4000-8000-000000000001','ar','الكابينة');
INSERT INTO catalog.technical_configurations(id,sheet_id,configuration_key,capacity_kg) VALUES
('a8000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','office',630),
('a8000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000001','residential',630);
INSERT INTO catalog.technical_configuration_translations(configuration_id,locale,label) VALUES
('a8000000-0000-4000-8000-000000000001','ar','مكاتب'),('a8000000-0000-4000-8000-000000000002','ar','سكن');
INSERT INTO catalog.technical_conditions(id,sheet_id,condition_key,condition_kind,speed_mps) VALUES
('a9000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','speed_1','EXACT_SPEED',1),
('a9000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000001','unspecified','UNQUALIFIED',NULL);
INSERT INTO catalog.technical_condition_translations(condition_id,locale,label) VALUES
('a9000000-0000-4000-8000-000000000001','ar','1 م/ث'),('a9000000-0000-4000-8000-000000000002','ar','غير محدد');
INSERT INTO catalog.technical_sheet_sources(id,sheet_id,asset_id,source_label,page_from,page_to) VALUES
('aa000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Synthetic PDF',1,2),
('aa000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Shared synthetic PDF',1,2);
INSERT INTO catalog.technical_source_observations(id,sheet_id,source_id,page_number,table_label,row_label,column_label,raw_value_text,requires_clarification) VALUES
('ab000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',1,'test','width','office','1000',false),
('ab000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',1,'test','depth','office','',false),
('ab000000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',2,'test','width','residential','1200?',true);
INSERT INTO catalog.technical_measurements(id,sheet_id,configuration_id,condition_id,section_id,definition_id,number_value,source_observation_id) VALUES
('ac000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',1000,'ab000000-0000-4000-8000-000000000001');
INSERT INTO catalog.technical_measurements(id,sheet_id,configuration_id,condition_id,section_id,definition_id,number_value,entry_basis) VALUES
('ac000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002',2000,'Synthetic company entry');
INSERT INTO catalog.category_technical_sheets(category_id,sheet_id) VALUES('a2000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001');
INSERT INTO catalog.product_technical_sheets(id,product_id,sheet_id) VALUES('ad000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001');
INSERT INTO catalog.technical_notes(id,sheet_id,configuration_id,condition_id) VALUES('ae000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001');
INSERT INTO catalog.technical_note_translations(note_id,locale,body) VALUES('ae000000-0000-4000-8000-000000000001','ar','ملاحظة اختبار');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

DO $$ BEGIN
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM catalog.active_asset_usage WHERE asset_id='a1000000-0000-4000-8000-000000000001'),'private source protects asset');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM catalog.public_asset_usage WHERE asset_id='a1000000-0000-4000-8000-000000000001'),'private PDF cannot be delivered');
  PERFORM pg_temp.expect_error($q$UPDATE catalog.technical_source_observations SET raw_value_text='1100' WHERE id='ab000000-0000-4000-8000-000000000001'$q$,'23514');
  PERFORM pg_temp.expect_error($q$UPDATE catalog.technical_conditions SET speed_mps=2 WHERE id='a9000000-0000-4000-8000-000000000001'$q$,'23514');
  PERFORM pg_temp.expect_error($q$UPDATE catalog.specification_definitions SET unit_code=NULL WHERE id='a5000000-0000-4000-8000-000000000001'$q$,'23514');
  PERFORM pg_temp.expect_error($q$UPDATE catalog.technical_measurements SET number_value='NaN' WHERE id='ac000000-0000-4000-8000-000000000001'$q$,'23514');
  PERFORM pg_temp.expect_error($q$DELETE FROM catalog.technical_measurements$q$,'23514');
  PERFORM pg_temp.expect_error($q$TRUNCATE catalog.technical_source_observations CASCADE$q$,'23514');
  PERFORM pg_temp.expect_error($q$SELECT catalog.retire_media_asset('a1000000-0000-4000-8000-000000000001','PDF',1)$q$,'23514');
  PERFORM pg_temp.expect_error($q$INSERT INTO catalog.technical_measurements(sheet_id,configuration_id,condition_id,section_id,definition_id,number_value,entry_basis) VALUES('a6000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',20,'test')$q$,'23503');
  BEGIN
    UPDATE catalog.technical_measurements SET number_value=6000 WHERE id='ac000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: bounds';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.technical_measurements SET source_observation_id='ab000000-0000-4000-8000-000000000003' WHERE id='ac000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: unresolved evidence';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.technical_measurements SET source_observation_id='ab000000-0000-4000-8000-000000000002',number_value=0 WHERE id='ac000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: empty source became zero';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.technical_source_observations SET page_number=9 WHERE id='ab000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: source page mutability';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO catalog.technical_source_observations(sheet_id,source_id,page_number,table_label,row_label,column_label,raw_value_text)
    VALUES('a6000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',3,'test','test','test','4');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: source page range';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.technical_measurements SET qualifier='MINIMUM' WHERE id='ac000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: mutable qualifier';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO catalog.technical_measurements(sheet_id,configuration_id,condition_id,section_id,definition_id,qualifier,number_value,entry_basis)
    VALUES('a6000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','MINIMUM',1100,'synthetic');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: minimum greater than exact';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.product_technical_sheets SET relation_kind='PRODUCT_SPECIFICATION' WHERE id='ad000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: no selections';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO catalog.product_technical_configurations(sheet_id,product_sheet_id,configuration_id)
    VALUES('a6000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: REFERENCE with selections';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE catalog.technical_sheet_translations SET deleted_at=clock_timestamp() WHERE sheet_id='a6000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'TEST FAILED: removed Arabic fallback';
  EXCEPTION WHEN check_violation THEN NULL; END;
END; $$;

-- Valid mode switch, selection changes and clarification happen atomically.
UPDATE catalog.products SET sort_order=sort_order WHERE id='a3000000-0000-4000-8000-000000000001' AND version=1;
UPDATE catalog.technical_sheets SET sheet_key=sheet_key WHERE id='a6000000-0000-4000-8000-000000000001' AND version=1;
UPDATE catalog.product_technical_sheets SET relation_kind='PRODUCT_SPECIFICATION' WHERE id='ad000000-0000-4000-8000-000000000001';
INSERT INTO catalog.product_technical_configurations(sheet_id,product_sheet_id,configuration_id) VALUES
('a6000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001'),
('a6000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002');
UPDATE catalog.technical_sheet_sources SET download_enabled=true WHERE id='aa000000-0000-4000-8000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
\ir fixtures/v1.1/11_technical_queries.sql
DO $$ BEGIN
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM catalog.public_asset_usage WHERE asset_id='a1000000-0000-4000-8000-000000000001'),'explicit download enabled');
  PERFORM pg_temp.assert_true(NOT EXISTS(
    SELECT 1 FROM catalog.live_product_technical_sheets l JOIN catalog.product_technical_configurations x ON x.product_sheet_id=l.id
    JOIN catalog.technical_configurations c ON c.id=x.configuration_id JOIN catalog.technical_conditions k ON k.sheet_id=c.sheet_id
    WHERE l.relation_kind='PRODUCT_SPECIFICATION' AND l.deleted_at IS NULL AND x.deleted_at IS NULL
      AND c.deleted_at IS NULL AND k.deleted_at IS NULL AND k.condition_kind='EXACT_SPEED' AND k.speed_mps=1
      AND EXISTS(SELECT 1 FROM catalog.technical_measurements m WHERE m.configuration_id=c.id AND m.condition_id=k.id AND m.definition_id='a5000000-0000-4000-8000-000000000001' AND m.number_value=1000 AND m.deleted_at IS NULL)
      AND EXISTS(SELECT 1 FROM catalog.technical_measurements m WHERE m.configuration_id=c.id AND m.condition_id=k.id AND m.definition_id='a5000000-0000-4000-8000-000000000002' AND m.number_value=2000 AND m.deleted_at IS NULL)
  ),'cannot combine different configurations in a numeric product filter');
END; $$;

DO $test$ DECLARE row_data record; rows_seen integer:=0; BEGIN
  FOR row_data IN EXECUTE $q$EXECUTE product_technical_card('a3000000-0000-4000-8000-000000000001','en')$q$ LOOP
    rows_seen:=rows_seen+1;
    PERFORM pg_temp.assert_true(row_data.sheet_title=(SELECT title FROM catalog.technical_sheet_translations WHERE sheet_id=row_data.sheet_id AND locale='ar' AND deleted_at IS NULL),'actual query uses Arabic title fallback');
    PERFORM pg_temp.assert_true(NOT (to_jsonb(row_data) ? 'source_observation_id') AND NOT (to_jsonb(row_data) ? 'entry_basis'),'actual public query excludes private evidence');
    IF row_data.configuration_id='a8000000-0000-4000-8000-000000000001'::uuid THEN
      PERFORM pg_temp.assert_true(jsonb_array_length(row_data.notes)=1,'actual query includes matching configuration/condition note');
    ELSE
      PERFORM pg_temp.assert_true(jsonb_array_length(row_data.notes)=0,'actual query excludes notes scoped to another configuration');
    END IF;
  END LOOP;
  PERFORM pg_temp.assert_true(rows_seen=2,'actual query renders both selected configurations');
  rows_seen:=0;
  FOR row_data IN EXECUTE $q$EXECUTE product_technical_filter(630,1,'a5000000-0000-4000-8000-000000000001',1000,'a5000000-0000-4000-8000-000000000002',2000)$q$ LOOP rows_seen:=rows_seen+1; END LOOP;
  PERFORM pg_temp.assert_true(rows_seen=0,'actual numeric filter cannot mix configurations');
  FOR row_data IN EXECUTE $q$EXECUTE product_technical_filter(630,1,'a5000000-0000-4000-8000-000000000001',1000,'a5000000-0000-4000-8000-000000000001',1000)$q$ LOOP rows_seen:=rows_seen+1; END LOOP;
  PERFORM pg_temp.assert_true(rows_seen=1,'actual numeric filter matches one selected configuration');
END; $test$;
SAVEPOINT narrow_selection;
UPDATE catalog.product_technical_configurations SET deleted_at=clock_timestamp() WHERE configuration_id='a8000000-0000-4000-8000-000000000002';
UPDATE catalog.products SET sort_order=sort_order WHERE id='a3000000-0000-4000-8000-000000000001' AND version=2;
UPDATE catalog.technical_sheets SET sheet_key=sheet_key WHERE id='a6000000-0000-4000-8000-000000000001' AND version=2;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $test$ DECLARE row_data record; rows_seen integer:=0; BEGIN
  FOR row_data IN EXECUTE $q$EXECUTE product_technical_card('a3000000-0000-4000-8000-000000000001','en')$q$ LOOP
    rows_seen:=rows_seen+1;
    PERFORM pg_temp.assert_true(row_data.configuration_id='a8000000-0000-4000-8000-000000000001'::uuid,'unselected configuration is excluded');
  END LOOP;
  PERFORM pg_temp.assert_true(rows_seen=1,'narrowed product selection returns only one configuration');
  rows_seen:=0;
  FOR row_data IN EXECUTE $q$EXECUTE category_technical_card('a2000000-0000-4000-8000-000000000001','ckb')$q$ LOOP rows_seen:=rows_seen+1; END LOOP;
  PERFORM pg_temp.assert_true(rows_seen=2,'category reference retains both configurations');
END; $test$;
ROLLBACK TO narrow_selection;
SAVEPOINT generic_reference;
UPDATE catalog.product_technical_configurations SET deleted_at=clock_timestamp() WHERE product_sheet_id='ad000000-0000-4000-8000-000000000001';
UPDATE catalog.product_technical_sheets SET relation_kind='REFERENCE' WHERE id='ad000000-0000-4000-8000-000000000001';
UPDATE catalog.products SET sort_order=sort_order WHERE id='a3000000-0000-4000-8000-000000000001' AND version=2;
UPDATE catalog.technical_sheets SET sheet_key=sheet_key WHERE id='a6000000-0000-4000-8000-000000000001' AND version=2;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $test$ DECLARE row_data record; rows_seen integer:=0; BEGIN
  FOR row_data IN EXECUTE $q$EXECUTE product_technical_filter(630,1,'a5000000-0000-4000-8000-000000000001',1000,'a5000000-0000-4000-8000-000000000001',1000)$q$ LOOP rows_seen:=rows_seen+1; END LOOP;
  PERFORM pg_temp.assert_true(rows_seen=0,'generic reference cannot satisfy a numerical product filter');
END; $test$;
ROLLBACK TO generic_reference;
EXECUTE product_technical_card('a3000000-0000-4000-8000-000000000001','en');
EXECUTE category_technical_card('a2000000-0000-4000-8000-000000000001','ckb');
EXECUTE product_technical_filter(630,1,'a5000000-0000-4000-8000-000000000001',1000,'a5000000-0000-4000-8000-000000000002',2000);
DEALLOCATE ALL;
SELECT catalog.soft_delete_branch('a2000000-0000-4000-8000-000000000001',1);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $$ BEGIN
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM catalog.product_technical_sheets WHERE deleted_at IS NULL),'branch deletion removes product links');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM catalog.product_technical_configurations WHERE deleted_at IS NULL),'branch deletion removes selections');
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM catalog.technical_sheets WHERE id='a6000000-0000-4000-8000-000000000001' AND deleted_at IS NULL),'branch deletion retains shared sheet');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM catalog.public_asset_usage WHERE asset_id='a1000000-0000-4000-8000-000000000001'),'unlinked sheet is not public');
END; $$;
SELECT catalog.soft_delete_technical_sheet('a6000000-0000-4000-8000-000000000001',2);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $$ BEGIN
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM catalog.media_asset_refs WHERE id='a1000000-0000-4000-8000-000000000001' AND deleted_at IS NULL),'sheet deletion retains source asset');
  PERFORM pg_temp.expect_error($q$SELECT catalog.retire_media_asset('a1000000-0000-4000-8000-000000000001','PDF',1)$q$,'23514');
  PERFORM pg_temp.expect_error($q$UPDATE catalog.technical_sheets SET deleted_at=NULL WHERE id='a6000000-0000-4000-8000-000000000001'$q$,'23514');
END; $$;
SELECT catalog.soft_delete_technical_sheet('a6000000-0000-4000-8000-000000000002',1);
SELECT catalog.retire_media_asset('a1000000-0000-4000-8000-000000000001','PDF',1);
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
\echo 'Technical integrity, source privacy, applicability and deletion checks passed; fixtures rolled back.'


