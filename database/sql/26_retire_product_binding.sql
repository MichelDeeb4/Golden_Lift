\set ON_ERROR_STOP on
-- Owning-role migration, after reviewed category cutover. Run atomically with writers stopped.
SELECT catalog.lock_write();
SELECT catalog.assert_valid_category_catalog();

-- Preserve bindings including soft-deleted products as immutable migration evidence.
CREATE TABLE catalog.retired_product_bindings (
  product_id uuid PRIMARY KEY,
  legacy_type_id uuid,
  archived_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO catalog.retired_product_bindings(product_id,legacy_type_id)
SELECT id,product_type_id FROM catalog.products;
CREATE TRIGGER immutable_retired_bindings BEFORE INSERT OR UPDATE OR DELETE
ON catalog.retired_product_bindings FOR EACH STATEMENT
EXECUTE FUNCTION catalog.guard_retired_type_configuration();

-- Dependent retained/public usage views keep their OIDs and grants. The compatibility
-- slot is always NULL and does not reference product persistence or the evidence table.
DO $$ DECLARE columns text; BEGIN
  SELECT string_agg(CASE WHEN attname='product_type_id' THEN 'NULL::uuid AS product_type_id'
    ELSE format('p.%I',attname) END,',' ORDER BY attnum) INTO columns
  FROM pg_attribute WHERE attrelid='catalog.products'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE 'CREATE OR REPLACE VIEW catalog.live_products AS SELECT ' || columns ||
    ' FROM catalog.products p JOIN catalog.live_categories c ON c.id=p.category_id WHERE p.deleted_at IS NULL';
END; $$;
DROP TRIGGER retired_product_binding ON catalog.products;
DROP FUNCTION catalog.guard_retired_product_binding();
ALTER TABLE catalog.products DROP COLUMN product_type_id RESTRICT;
SELECT catalog.assert_valid_category_catalog();
