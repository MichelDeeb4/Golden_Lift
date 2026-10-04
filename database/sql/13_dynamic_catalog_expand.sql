\set ON_ERROR_STOP on
-- Reviewed additive expansion over v1.1; run as the Catalog migration owner.
-- No product type or public classification is inferred from existing names.
CREATE TABLE catalog.product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) BETWEEN 1 AND 128),
  schema_revision bigint NOT NULL DEFAULT 1 CHECK (schema_revision > 0),
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE catalog.product_type_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id uuid NOT NULL REFERENCES catalog.product_types(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
  description text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX product_type_translation_live_uq ON catalog.product_type_translations(product_type_id,locale) WHERE deleted_at IS NULL;
CREATE TABLE catalog.specification_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE catalog.specification_group_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES catalog.specification_groups(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
  description text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX specification_group_translation_live_uq ON catalog.specification_group_translations(group_id,locale) WHERE deleted_at IS NULL;
CREATE TABLE catalog.product_type_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id uuid NOT NULL REFERENCES catalog.product_types(id) ON DELETE RESTRICT,
  group_id uuid NOT NULL REFERENCES catalog.specification_groups(id) ON DELETE RESTRICT,
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (product_type_id,id)
);
CREATE UNIQUE INDEX product_type_group_live_uq ON catalog.product_type_groups(product_type_id,group_id) WHERE deleted_at IS NULL;
CREATE INDEX product_type_group_order_live_idx ON catalog.product_type_groups(product_type_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX product_type_group_usage_live_idx ON catalog.product_type_groups(group_id,product_type_id) WHERE deleted_at IS NULL;
CREATE TABLE catalog.product_type_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id uuid NOT NULL REFERENCES catalog.product_types(id) ON DELETE RESTRICT,
  definition_id uuid NOT NULL REFERENCES catalog.specification_definitions(id) ON DELETE RESTRICT,
  type_group_id uuid,
  sort_order bigint NOT NULL DEFAULT 1024,
  is_required boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  is_searchable boolean NOT NULL DEFAULT false,
  is_filterable boolean NOT NULL DEFAULT false,
  is_comparable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (product_type_id,type_group_id) REFERENCES catalog.product_type_groups(product_type_id,id) ON DELETE RESTRICT,
  CHECK (is_public OR NOT (is_searchable OR is_filterable OR is_comparable))
);
CREATE UNIQUE INDEX product_type_specification_live_uq ON catalog.product_type_specifications(product_type_id,definition_id) WHERE deleted_at IS NULL;
CREATE INDEX product_type_specification_order_live_idx ON catalog.product_type_specifications(product_type_id,type_group_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX product_type_specification_usage_live_idx ON catalog.product_type_specifications(definition_id,product_type_id) WHERE deleted_at IS NULL;
CREATE TABLE catalog.unit_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_code text NOT NULL REFERENCES catalog.units(code) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX unit_translation_live_uq ON catalog.unit_translations(unit_code,locale) WHERE deleted_at IS NULL;
ALTER TABLE catalog.products ADD COLUMN product_type_id uuid REFERENCES catalog.product_types(id) ON DELETE RESTRICT;
CREATE OR REPLACE VIEW catalog.live_products AS
SELECT p.* FROM catalog.products p JOIN catalog.live_categories c ON c.id=p.category_id WHERE p.deleted_at IS NULL;
CREATE INDEX products_type_live_idx ON catalog.products(product_type_id,id) WHERE deleted_at IS NULL;
ALTER TABLE catalog.specification_definitions
  ADD COLUMN is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN deprecated_at timestamptz,
  ADD COLUMN text_multiline boolean NOT NULL DEFAULT false,
  ADD COLUMN text_max_length integer NOT NULL DEFAULT 4000 CHECK (text_max_length BETWEEN 1 AND 10000);
ALTER TABLE catalog.specification_options ADD COLUMN deprecated_at timestamptz;
ALTER TABLE catalog.specification_translations ADD COLUMN help_text text;
CREATE TRIGGER product_type_code_immutable BEFORE UPDATE ON catalog.product_types FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('code');
CREATE TRIGGER specification_code_immutable BEFORE UPDATE ON catalog.specification_definitions FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('code');
CREATE TRIGGER group_code_immutable BEFORE UPDATE ON catalog.specification_groups FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('code');
CREATE TRIGGER option_identity_immutable BEFORE UPDATE ON catalog.specification_options FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('definition_id','code');
CREATE TRIGGER type_assignment_identity_immutable BEFORE UPDATE ON catalog.product_type_specifications FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('product_type_id','definition_id');
CREATE TRIGGER type_group_identity_immutable BEFORE UPDATE ON catalog.product_type_groups FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('product_type_id','group_id');
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['product_types','product_type_translations','specification_groups','specification_group_translations','product_type_groups','product_type_specifications','unit_translations'] LOOP
    EXECUTE format('CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update()',name);
    EXECUTE format('CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.%I FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete()',name);
    EXECUTE format('CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.%I FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement()',name);
    EXECUTE format('CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred()',name);
  END LOOP;
END;
$$;
-- Expansion deliberately retains v1.1 eligibility until reviewed mapping/cutover.
