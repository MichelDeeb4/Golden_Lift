\set ON_ERROR_STOP on
-- Run ONLY against golden_lift_catalog, as a migration owner.
\ir 00_common.sql
CREATE SCHEMA catalog;
REVOKE ALL ON SCHEMA catalog FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Local registrations of verified READY assets; also the attachment/deletion coordination boundary.
CREATE TABLE catalog.media_asset_refs (
  id uuid PRIMARY KEY,
  media_kind text NOT NULL CHECK (media_kind IN ('IMAGE','VIDEO','PDF')),
  source_version bigint NOT NULL CHECK (source_version > 0),
  ready_at timestamptz,
  retirement_event_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (deleted_at IS NULL OR retirement_event_id IS NOT NULL),
  CHECK (deleted_at IS NOT NULL OR ready_at IS NOT NULL)
);

CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.media_asset_refs FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.media_asset_refs FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- One adjacency-list table represents roots and subcategories at every depth.
CREATE TABLE catalog.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  cover_asset_id uuid REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT,
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX categories_children_live_idx ON catalog.categories (parent_id, sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX categories_cover_live_idx ON catalog.categories (cover_asset_id) WHERE deleted_at IS NULL AND cover_asset_id IS NOT NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.categories FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.categories FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- One active translation per category and supported locale.
CREATE TABLE catalog.category_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  slug text,
  search_text text GENERATED ALWAYS AS (lower(name || ' ' || coalesce(description,''))) STORED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX category_translation_live_uq ON catalog.category_translations (category_id, locale) WHERE deleted_at IS NULL;
CREATE INDEX category_translation_search_idx ON catalog.category_translations USING gin (search_text gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.category_translations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.category_translations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- A product/design belongs to exactly one active leaf category.
CREATE TABLE catalog.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  cover_media_id uuid NOT NULL,
  current_model_code_id uuid,
  sort_order bigint NOT NULL DEFAULT 1024,
  is_featured boolean NOT NULL DEFAULT false,
  featured_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX products_category_live_idx ON catalog.products (category_id, sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX products_featured_live_idx ON catalog.products (featured_order, id) WHERE deleted_at IS NULL AND is_featured;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.products FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.products FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Permanent model-code ownership, including replaced codes and deleted products.
CREATE TABLE catalog.product_code_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 128),
  code_key text GENERATED ALWAYS AS (upper(btrim(code))) STORED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (code_key),
  UNIQUE (product_id, id)
);
CREATE INDEX product_code_owner_idx ON catalog.product_code_reservations (product_id);
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_code_reservations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_code_reservations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Translated names/descriptions; active Arabic name required.
CREATE TABLE catalog.product_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  short_description text,
  description text,
  slug text,
  search_text text GENERATED ALWAYS AS (lower(name || ' ' || coalesce(short_description,'') || ' ' || coalesce(description,''))) STORED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX product_translation_live_uq ON catalog.product_translations (product_id, locale) WHERE deleted_at IS NULL;
CREATE INDEX product_translation_search_idx ON catalog.product_translations USING gin (search_text gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_translations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_translations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Ordered product-to-asset associations, independently soft-deletable.
CREATE TABLE catalog.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT,
  content_locale text CHECK (content_locale IN ('ar','en','ckb')),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (product_id, id)
);
CREATE UNIQUE INDEX product_media_live_uq ON catalog.product_media (product_id, asset_id) WHERE deleted_at IS NULL;
CREATE INDEX product_media_order_live_idx ON catalog.product_media (product_id, sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX product_media_asset_live_idx ON catalog.product_media (asset_id, product_id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_media FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_media FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Translated display titles, captions, and image alternative text.
CREATE TABLE catalog.product_media_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_media_id uuid NOT NULL REFERENCES catalog.product_media(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  title text,
  caption text,
  alt_text text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX product_media_translation_live_uq ON catalog.product_media_translations (product_media_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_media_translations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_media_translations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Canonical engineering units, not per-product unit strings.
CREATE TABLE catalog.units (
  code text PRIMARY KEY,
  symbol text NOT NULL,
  dimension text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.units FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.units FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Typed, reusable attribute definitions with canonical units.
CREATE TABLE catalog.specification_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
  value_type text NOT NULL CHECK (value_type IN ('NUMBER','BOOLEAN','TEXT','CHOICE')),
  unit_code text REFERENCES catalog.units(code) ON DELETE RESTRICT,
  minimum_value numeric(20,6),
  maximum_value numeric(20,6),
  allow_multiple boolean NOT NULL DEFAULT false,
  is_filterable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (id, value_type),
  CHECK (value_type = 'NUMBER' OR (unit_code IS NULL AND minimum_value IS NULL AND maximum_value IS NULL)),
  CHECK (value_type = 'CHOICE' OR allow_multiple = false),
  CHECK (minimum_value IS NULL OR maximum_value IS NULL OR minimum_value <= maximum_value)
);

CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.specification_definitions FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.specification_definitions FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Translated specification labels.
CREATE TABLE catalog.specification_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES catalog.specification_definitions(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX specification_translation_live_uq ON catalog.specification_translations (definition_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.specification_translations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.specification_translations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Controlled option values, such as stainless steel or bronze.
CREATE TABLE catalog.specification_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES catalog.specification_definitions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (definition_id, code),
  UNIQUE (id, definition_id)
);
CREATE INDEX specification_options_live_idx ON catalog.specification_options (definition_id, sort_order, id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.specification_options FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.specification_options FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Translated option labels; option IDs drive filtering.
CREATE TABLE catalog.specification_option_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id uuid NOT NULL REFERENCES catalog.specification_options(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX specification_option_translation_live_uq ON catalog.specification_option_translations (option_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.specification_option_translations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.specification_option_translations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Explicit category-to-definition assignments, with no implicit inheritance in V1.
CREATE TABLE catalog.category_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  definition_id uuid NOT NULL REFERENCES catalog.specification_definitions(id) ON DELETE RESTRICT,
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX category_specification_live_uq ON catalog.category_specifications (category_id, definition_id) WHERE deleted_at IS NULL;
CREATE INDEX category_specification_definition_idx ON catalog.category_specifications (definition_id, category_id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.category_specifications FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.category_specifications FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- One active typed value container per product/definition.
CREATE TABLE catalog.product_specification_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  definition_id uuid NOT NULL,
  value_type text NOT NULL CHECK (value_type IN ('NUMBER','BOOLEAN','TEXT','CHOICE')),
  number_value numeric(20,6),
  boolean_value boolean,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (definition_id, value_type) REFERENCES catalog.specification_definitions(id, value_type) ON DELETE RESTRICT,
  UNIQUE (id, definition_id),
  CHECK ((value_type = 'NUMBER' AND number_value IS NOT NULL AND number_value <> 'NaN'::numeric AND boolean_value IS NULL) OR (value_type = 'BOOLEAN' AND boolean_value IS NOT NULL AND number_value IS NULL) OR (value_type IN ('TEXT','CHOICE') AND number_value IS NULL AND boolean_value IS NULL))
);
CREATE UNIQUE INDEX product_specification_live_uq ON catalog.product_specification_values (product_id, definition_id) WHERE deleted_at IS NULL;
CREATE INDEX specification_number_filter_idx ON catalog.product_specification_values (definition_id, number_value, product_id) WHERE deleted_at IS NULL AND value_type = 'NUMBER';
CREATE INDEX specification_boolean_filter_idx ON catalog.product_specification_values (definition_id, boolean_value, product_id) WHERE deleted_at IS NULL AND value_type = 'BOOLEAN';
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_specification_values FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_specification_values FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Language-specific values for TEXT specifications.
CREATE TABLE catalog.product_specification_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value_id uuid NOT NULL REFERENCES catalog.product_specification_values(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  text_value text NOT NULL CHECK (length(btrim(text_value)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX specification_text_live_uq ON catalog.product_specification_texts (value_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_specification_texts FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_specification_texts FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- One or more selected controlled options for a CHOICE value.
CREATE TABLE catalog.product_specification_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  option_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (value_id, definition_id) REFERENCES catalog.product_specification_values(id, definition_id) ON DELETE RESTRICT,
  FOREIGN KEY (option_id, definition_id) REFERENCES catalog.specification_options(id, definition_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX specification_choice_live_uq ON catalog.product_specification_choices (value_id, option_id) WHERE deleted_at IS NULL;
CREATE INDEX specification_choice_filter_idx ON catalog.product_specification_choices (option_id, value_id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.product_specification_choices FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.product_specification_choices FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Company/Home/About/Contact page identities, independent of translations.
CREATE TABLE catalog.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key text NOT NULL UNIQUE CHECK (length(btrim(page_key)) > 0),
  cover_asset_id uuid REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX page_cover_live_idx ON catalog.pages (cover_asset_id) WHERE deleted_at IS NULL AND cover_asset_id IS NOT NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.pages FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.pages FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Translated company-page content.
CREATE TABLE catalog.page_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES catalog.pages(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  body jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(body) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX page_translation_live_uq ON catalog.page_translations (page_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.page_translations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.page_translations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Ordered FAQ entries.
CREATE TABLE catalog.faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX faq_order_live_idx ON catalog.faq_items (sort_order, id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.faq_items FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.faq_items FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Translated FAQ questions and answers.
CREATE TABLE catalog.faq_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_id uuid NOT NULL REFERENCES catalog.faq_items(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  question text NOT NULL CHECK (length(btrim(question)) > 0),
  answer text NOT NULL CHECK (length(btrim(answer)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX faq_translation_live_uq ON catalog.faq_translations (faq_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.faq_translations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.faq_translations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- One current company configuration record.
CREATE TABLE catalog.site_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  logo_asset_id uuid REFERENCES catalog.media_asset_refs(id) ON DELETE RESTRICT,
  public_email text,
  sales_notification_email text,
  phone text,
  whatsapp text,
  map_url text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.site_settings FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.site_settings FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Company name, address, and short branding copy by language.
CREATE TABLE catalog.site_setting_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id smallint NOT NULL REFERENCES catalog.site_settings(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  company_name text NOT NULL CHECK (length(btrim(company_name)) > 0),
  tagline text,
  address text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX site_translation_live_uq ON catalog.site_setting_translations (settings_id, locale) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.site_setting_translations FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.site_setting_translations FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Editable company social links.
CREATE TABLE catalog.social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (length(btrim(platform)) > 0),
  url text NOT NULL CHECK (url ~ '^https://'),
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX social_links_order_live_idx ON catalog.social_links (sort_order, id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.social_links FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.social_links FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Deliberately deferred cycles: insert product, translation, code, and gallery
-- in one transaction. The final committed product must have its own cover.
ALTER TABLE catalog.products ADD CONSTRAINT products_own_cover_fk
  FOREIGN KEY (id, cover_media_id) REFERENCES catalog.product_media(product_id, id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catalog.products ADD CONSTRAINT products_own_code_fk
  FOREIGN KEY (id, current_model_code_id) REFERENCES catalog.product_code_reservations(product_id, id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE TRIGGER code_ownership_immutable BEFORE UPDATE ON catalog.product_code_reservations
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('product_id','code');
CREATE TRIGGER registered_asset_kind_immutable BEFORE UPDATE ON catalog.media_asset_refs
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('media_kind');
CREATE TRIGGER unit_semantics_immutable BEFORE UPDATE ON catalog.units
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('code','symbol','dimension');

\ir 05_catalog_integrity.sql

\ir 09_technical_sheets.sql
