\set ON_ERROR_STOP on
-- Catalog v1.1 additive migration. Run once with psql --single-transaction.

CREATE TABLE catalog.technical_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_key text NOT NULL UNIQUE CHECK (length(btrim(sheet_key)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_sheets
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_sheets
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_sheets
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_key');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_sheets
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_sheets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_sheet_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  summary text,
  applicability_note text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX technical_sheet_translations_live_uq ON catalog.technical_sheet_translations (sheet_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_sheet_translations
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_sheet_translations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_sheet_translations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id','locale');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_sheet_translations
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_sheet_translations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_sheet_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT,
  source_label text NOT NULL CHECK (length(btrim(source_label)) > 0),
  page_from integer NOT NULL CHECK (page_from > 0),
  page_to integer NOT NULL CHECK (page_to >= page_from),
  download_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (sheet_id,id)
);
CREATE INDEX technical_sources_sheet_idx ON catalog.technical_sheet_sources (sheet_id,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_sources_asset_idx ON catalog.technical_sheet_sources (asset_id,sheet_id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_sheet_sources
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_sheet_sources
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_sheet_sources
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id','asset_id','page_from','page_to');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_sheet_sources
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_sheet_sources
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_source_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL,
  page_number integer NOT NULL CHECK (page_number > 0),
  table_label text NOT NULL,
  row_label text NOT NULL,
  column_label text NOT NULL,
  source_symbol text,
  source_unit_text text,
  raw_value_text text NOT NULL,
  raw_condition_text text,
  raw_note_text text,
  requires_clarification boolean NOT NULL DEFAULT false,
  resolution_note text CHECK (resolution_note IS NULL OR length(btrim(resolution_note)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (sheet_id,id),
  FOREIGN KEY (sheet_id,source_id) REFERENCES catalog.technical_sheet_sources (sheet_id,id) ON DELETE RESTRICT
);
CREATE INDEX technical_observations_source_idx ON catalog.technical_source_observations (source_id,page_number,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_observations_sheet_idx ON catalog.technical_source_observations (sheet_id,id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_source_observations
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_source_observations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_source_observations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id','source_id','page_number','table_label','row_label','column_label','source_symbol','source_unit_text','raw_value_text','raw_condition_text','raw_note_text');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_source_observations
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_source_observations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  section_key text NOT NULL CHECK (length(btrim(section_key)) > 0),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (sheet_id,id)
);
CREATE UNIQUE INDEX technical_sections_live_uq ON catalog.technical_sections (sheet_id,section_key) WHERE deleted_at IS NULL;
CREATE INDEX technical_sections_order_idx ON catalog.technical_sections (sheet_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_sections
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_sections
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_sections
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id','section_key');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_sections
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_sections
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_section_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES catalog.technical_sections(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX technical_section_translations_live_uq ON catalog.technical_section_translations (section_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_section_translations
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_section_translations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_section_translations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('section_id','locale');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_section_translations
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_section_translations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  configuration_key text NOT NULL CHECK (length(btrim(configuration_key)) > 0),
  capacity_kg numeric(20,6) CHECK (capacity_kg IS NULL OR (capacity_kg > 0 AND capacity_kg NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))),
  passenger_count integer CHECK (passenger_count IS NULL OR passenger_count > 0),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (sheet_id,id)
);
CREATE UNIQUE INDEX technical_configurations_live_uq ON catalog.technical_configurations (sheet_id,configuration_key) WHERE deleted_at IS NULL;
CREATE INDEX technical_configurations_order_idx ON catalog.technical_configurations (sheet_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_capacity_lookup_idx ON catalog.technical_configurations (capacity_kg,sheet_id,id) WHERE deleted_at IS NULL AND capacity_kg IS NOT NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_configurations
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_configurations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_configurations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id','configuration_key');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_configurations
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_configurations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_configuration_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_id uuid NOT NULL REFERENCES catalog.technical_configurations(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  applicability_note text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX technical_configuration_translations_live_uq ON catalog.technical_configuration_translations (configuration_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_configuration_translations
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_configuration_translations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_configuration_translations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('configuration_id','locale');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_configuration_translations
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_configuration_translations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  condition_key text NOT NULL CHECK (length(btrim(condition_key)) > 0),
  condition_kind text NOT NULL CHECK (condition_kind IN ('UNQUALIFIED','EXACT_SPEED','OTHER')),
  speed_mps numeric(20,6),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (sheet_id,id),
  CHECK ((condition_kind = 'EXACT_SPEED' AND speed_mps IS NOT NULL AND speed_mps > 0 AND speed_mps NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) OR (condition_kind <> 'EXACT_SPEED' AND speed_mps IS NULL))
);
CREATE UNIQUE INDEX technical_conditions_live_uq ON catalog.technical_conditions (sheet_id,condition_key) WHERE deleted_at IS NULL;
CREATE INDEX technical_conditions_order_idx ON catalog.technical_conditions (sheet_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_speed_lookup_idx ON catalog.technical_conditions (speed_mps,sheet_id,id) WHERE deleted_at IS NULL AND condition_kind = 'EXACT_SPEED';
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_conditions
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_conditions
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_conditions
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id','condition_key','condition_kind','speed_mps');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_conditions
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_conditions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_condition_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id uuid NOT NULL REFERENCES catalog.technical_conditions(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  detail text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX technical_condition_translations_live_uq ON catalog.technical_condition_translations (condition_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_condition_translations
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_condition_translations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_condition_translations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('condition_id','locale');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_condition_translations
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_condition_translations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  configuration_id uuid NOT NULL,
  condition_id uuid NOT NULL,
  section_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  value_type text NOT NULL DEFAULT 'NUMBER' CHECK (value_type = 'NUMBER'),
  qualifier text NOT NULL DEFAULT 'EXACT' CHECK (qualifier IN ('EXACT','MINIMUM','MAXIMUM')),
  value_state text NOT NULL DEFAULT 'KNOWN' CHECK (value_state IN ('KNOWN','NOT_SPECIFIED','NOT_APPLICABLE')),
  number_value numeric(20,6),
  source_observation_id uuid,
  entry_basis text CHECK (entry_basis IS NULL OR length(btrim(entry_basis)) > 0),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (sheet_id,id),
  FOREIGN KEY (sheet_id,configuration_id) REFERENCES catalog.technical_configurations (sheet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (sheet_id,condition_id) REFERENCES catalog.technical_conditions (sheet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (sheet_id,section_id) REFERENCES catalog.technical_sections (sheet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (definition_id,value_type) REFERENCES catalog.specification_definitions (id,value_type) ON DELETE RESTRICT,
  FOREIGN KEY (sheet_id,source_observation_id) REFERENCES catalog.technical_source_observations (sheet_id,id) ON DELETE RESTRICT,
  CHECK ((value_state = 'KNOWN' AND number_value IS NOT NULL AND number_value NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) OR (value_state <> 'KNOWN' AND number_value IS NULL)),
  CHECK (source_observation_id IS NOT NULL OR entry_basis IS NOT NULL)
);
CREATE UNIQUE INDEX technical_measurements_live_uq ON catalog.technical_measurements (configuration_id,condition_id,definition_id,qualifier) WHERE deleted_at IS NULL;
CREATE INDEX technical_measurements_render_idx ON catalog.technical_measurements (sheet_id,configuration_id,section_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_measurements_numeric_idx ON catalog.technical_measurements (definition_id,qualifier,number_value,configuration_id) WHERE deleted_at IS NULL AND value_state = 'KNOWN';
CREATE INDEX technical_measurements_condition_idx ON catalog.technical_measurements (condition_id,configuration_id) WHERE deleted_at IS NULL;
CREATE INDEX technical_measurements_source_idx ON catalog.technical_measurements (source_observation_id) WHERE deleted_at IS NULL AND source_observation_id IS NOT NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_measurements
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_measurements
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_measurements
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id','configuration_id','condition_id','definition_id','value_type','qualifier');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_measurements
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_measurements
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  section_id uuid,
  configuration_id uuid,
  condition_id uuid,
  measurement_id uuid,
  source_observation_id uuid,
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (sheet_id,section_id) REFERENCES catalog.technical_sections (sheet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (sheet_id,configuration_id) REFERENCES catalog.technical_configurations (sheet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (sheet_id,condition_id) REFERENCES catalog.technical_conditions (sheet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (sheet_id,measurement_id) REFERENCES catalog.technical_measurements (sheet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (sheet_id,source_observation_id) REFERENCES catalog.technical_source_observations (sheet_id,id) ON DELETE RESTRICT,
  CHECK (measurement_id IS NULL OR (section_id IS NULL AND configuration_id IS NULL AND condition_id IS NULL))
);
CREATE INDEX technical_notes_order_idx ON catalog.technical_notes (sheet_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX technical_notes_measurement_idx ON catalog.technical_notes (measurement_id) WHERE deleted_at IS NULL AND measurement_id IS NOT NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_notes
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_notes
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_notes
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_notes
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_notes
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.technical_note_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES catalog.technical_notes(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX technical_note_translations_live_uq ON catalog.technical_note_translations (note_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.technical_note_translations
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.technical_note_translations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.technical_note_translations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('note_id','locale');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.technical_note_translations
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.technical_note_translations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.category_technical_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX category_technical_sheets_live_uq ON catalog.category_technical_sheets (category_id,sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX category_technical_sheets_order_idx ON catalog.category_technical_sheets (category_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX category_technical_sheets_reverse_idx ON catalog.category_technical_sheets (sheet_id,category_id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.category_technical_sheets
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.category_technical_sheets
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.category_technical_sheets
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('category_id','sheet_id');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.category_technical_sheets
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.category_technical_sheets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.product_technical_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  relation_kind text NOT NULL DEFAULT 'REFERENCE' CHECK (relation_kind IN ('REFERENCE','PRODUCT_SPECIFICATION')),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (sheet_id,id)
);
CREATE UNIQUE INDEX product_technical_sheets_live_uq ON catalog.product_technical_sheets (product_id,sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX product_technical_sheets_order_idx ON catalog.product_technical_sheets (product_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX product_technical_sheets_reverse_idx ON catalog.product_technical_sheets (sheet_id,product_id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_technical_sheets
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_technical_sheets
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.product_technical_sheets
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('product_id','sheet_id');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.product_technical_sheets
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.product_technical_sheets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

CREATE TABLE catalog.product_technical_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES catalog.technical_sheets(id) ON DELETE RESTRICT,
  product_sheet_id uuid NOT NULL,
  configuration_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (sheet_id,product_sheet_id) REFERENCES catalog.product_technical_sheets (sheet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (sheet_id,configuration_id) REFERENCES catalog.technical_configurations (sheet_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX product_technical_configurations_live_uq ON catalog.product_technical_configurations (product_sheet_id,configuration_id) WHERE deleted_at IS NULL;
CREATE INDEX product_technical_configurations_reverse_idx ON catalog.product_technical_configurations (configuration_id,product_sheet_id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_technical_configurations
FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_technical_configurations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.product_technical_configurations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('sheet_id','product_sheet_id','configuration_id');
CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.product_technical_configurations
FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();
CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.product_technical_configurations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();

\ir 09_technical_integrity.sql
