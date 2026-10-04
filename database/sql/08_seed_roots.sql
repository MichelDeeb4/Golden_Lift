\set ON_ERROR_STOP on
-- Optional initial seed; apply once to an otherwise unseeded Catalog.
-- Arabic labels from the supplied brochure; English labels from accepted requirements.
-- Sorani translations require approved content and otherwise fall back to Arabic.
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO catalog.categories(id,sort_order) VALUES ('10000000-0000-4000-8000-000000000001',1024);
INSERT INTO catalog.category_translations(category_id,locale,name) VALUES ('10000000-0000-4000-8000-000000000001','ar','كبائن المصاعد'), ('10000000-0000-4000-8000-000000000001','en','Elevator cabins');
INSERT INTO catalog.categories(id,sort_order) VALUES ('10000000-0000-4000-8000-000000000002',2048);
INSERT INTO catalog.category_translations(category_id,locale,name) VALUES ('10000000-0000-4000-8000-000000000002','ar','الأبواب'), ('10000000-0000-4000-8000-000000000002','en','Doors');
INSERT INTO catalog.categories(id,sort_order) VALUES ('10000000-0000-4000-8000-000000000003',3072);
INSERT INTO catalog.category_translations(category_id,locale,name) VALUES ('10000000-0000-4000-8000-000000000003','ar','لوحات التحكم'), ('10000000-0000-4000-8000-000000000003','en','Control panels');
INSERT INTO catalog.categories(id,sort_order) VALUES ('10000000-0000-4000-8000-000000000004',4096);
INSERT INTO catalog.category_translations(category_id,locale,name) VALUES ('10000000-0000-4000-8000-000000000004','ar','المحركات'), ('10000000-0000-4000-8000-000000000004','en','Motors');
INSERT INTO catalog.categories(id,sort_order) VALUES ('10000000-0000-4000-8000-000000000005',5120);
INSERT INTO catalog.category_translations(category_id,locale,name) VALUES ('10000000-0000-4000-8000-000000000005','ar','مصاعد المنازل والخدمة'), ('10000000-0000-4000-8000-000000000005','en','Home and service elevators');
INSERT INTO catalog.categories(id,sort_order) VALUES ('10000000-0000-4000-8000-000000000006',6144);
INSERT INTO catalog.category_translations(category_id,locale,name) VALUES ('10000000-0000-4000-8000-000000000006','ar','منصات ومصاعد خاصة'), ('10000000-0000-4000-8000-000000000006','en','Platforms and special elevators');
COMMIT;
