\set ON_ERROR_STOP on
-- Reviewed expansion: no existing business records or columns are removed.
ALTER TABLE catalog.products ADD COLUMN deletion_pending boolean NOT NULL DEFAULT false;
ALTER TABLE catalog.categories ADD COLUMN deletion_pending boolean NOT NULL DEFAULT false;
ALTER TABLE catalog.media_asset_refs ADD COLUMN deletion_pending boolean NOT NULL DEFAULT false;
CREATE TABLE ops.deletion_operations (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL CHECK(entity_type IN ('PRODUCT','MEDIA','ATTRIBUTE','ATTRIBUTE_GROUP','UNIT','CATEGORY')),
  entity_id text NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL CHECK(status IN ('MEDIA_CLEANUP','COMPLETED','RETRYABLE')),
  failure_code text,
  retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count>=0),
  completed_at timestamptz,
  asset_ids uuid[] NOT NULL DEFAULT '{}',
  owner_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX deletion_operation_pending ON ops.deletion_operations(entity_type,entity_id) WHERE completed_at IS NULL;
CREATE TRIGGER deletion_operations_no_delete BEFORE DELETE OR TRUNCATE ON ops.deletion_operations
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Pending business owners are operationally unavailable, not soft-deleted.
DO $$ DECLARE name text; query text; BEGIN
  FOREACH name IN ARRAY ARRAY['categories','products'] LOOP
    SELECT pg_get_viewdef(('catalog.live_'||name)::regclass,true) INTO query;
    EXECUTE format('CREATE OR REPLACE VIEW catalog.live_%I AS SELECT existing.* FROM (%s) existing JOIN catalog.%I pending ON pending.id=existing.id WHERE NOT pending.deletion_pending',name,rtrim(query,';'),name);
  END LOOP;
END; $$;

-- Retired type tables remain inaccessible to runtime. Reveal only FK impact counts
-- and an opaque version fingerprint, not historical configuration rows.
CREATE FUNCTION catalog.retained_deletion_dependencies(kind text, entity uuid)
RETURNS TABLE(dependency_count bigint,dependency_revision text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$ BEGIN
  IF kind='ATTRIBUTE' THEN
    RETURN QUERY SELECT count(*),md5(coalesce(string_agg(id::text||':'||version::text,',' ORDER BY id),'')) FROM catalog.product_type_specifications WHERE definition_id=entity;
  ELSIF kind='ATTRIBUTE_GROUP' THEN
    RETURN QUERY SELECT count(*),md5(coalesce(string_agg(id::text||':'||version::text,',' ORDER BY id),'')) FROM catalog.product_type_groups WHERE group_id=entity;
  ELSE RAISE EXCEPTION 'Unsupported retained dependency scope' USING ERRCODE='23514'; END IF;
END; $$;

CREATE FUNCTION catalog.guard_pending_deletion() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.deletion_pending AND pg_trigger_depth()=1 THEN RAISE EXCEPTION 'Deletion is already in progress' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER b_pending_deletion BEFORE UPDATE ON catalog.products FOR EACH ROW EXECUTE FUNCTION catalog.guard_pending_deletion();
CREATE TRIGGER b_pending_deletion BEFORE UPDATE ON catalog.categories FOR EACH ROW EXECUTE FUNCTION catalog.guard_pending_deletion();

CREATE FUNCTION catalog.guard_pending_owner_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
DECLARE row_data jsonb:=to_jsonb(NEW); owner uuid; BEGIN
  IF TG_TABLE_NAME='products' THEN
    IF TG_OP='UPDATE' AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN RETURN NEW; END IF;
    owner:=NEW.category_id;
  ELSIF TG_TABLE_NAME='categories' THEN
    IF TG_OP='UPDATE' AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN RETURN NEW; END IF;
    owner:=NEW.parent_id;
  ELSIF row_data ? 'product_id' OR row_data ? 'product_media_id' OR row_data ? 'value_id' OR row_data ? 'product_sheet_id' THEN
    IF row_data ? 'product_id' THEN owner:=(row_data->>'product_id')::uuid;
    ELSIF row_data ? 'product_media_id' THEN SELECT product_id INTO owner FROM catalog.product_media WHERE id=(row_data->>'product_media_id')::uuid;
    ELSIF row_data ? 'value_id' THEN SELECT product_id INTO owner FROM catalog.product_specification_values WHERE id=(row_data->>'value_id')::uuid;
    ELSE SELECT product_id INTO owner FROM catalog.product_technical_sheets WHERE id=(row_data->>'product_sheet_id')::uuid; END IF;
    IF EXISTS(SELECT 1 FROM catalog.products WHERE id=owner AND deletion_pending) THEN
      RAISE EXCEPTION 'Pending Product cannot acquire or change owned records' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  ELSE owner:=(row_data->>'category_id')::uuid; END IF;
  IF owner IS NOT NULL AND EXISTS(SELECT 1 FROM catalog.categories WHERE id=owner AND deletion_pending) THEN
    RAISE EXCEPTION 'Pending Category cannot acquire or change descendants or owned records' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['products','categories','product_translations','product_media','product_media_translations','product_specification_values','product_specification_texts','product_specification_choices','product_code_reservations','product_technical_sheets','product_technical_configurations','category_translations','category_attribute_groups','category_specifications','category_technical_sheets'] LOOP
    EXECUTE format('CREATE TRIGGER pending_owner_reference BEFORE INSERT OR UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.guard_pending_owner_reference()',name);
  END LOOP;
END; $$;

-- Only owned tables covered by explicit deletion use cases can be physically deleted.
-- RESTRICT FKs remain intact; no broad cascades or grant to operational/evidence tables.
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['products','product_translations','product_code_reservations','product_media','product_media_translations','product_specification_values','product_specification_texts','product_specification_choices','product_technical_sheets','product_technical_configurations','categories','category_translations','category_specifications','category_technical_sheets','category_attribute_groups','attribute_group_attributes','specification_definitions','specification_translations','specification_options','specification_option_translations','specification_groups','specification_group_translations','units','unit_translations','media_asset_refs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS no_physical_delete ON catalog.%I',name);
    -- Serialize DELETE with the same private write gate as INSERT/UPDATE.
    EXECUTE format('CREATE TRIGGER deletion_write_guard BEFORE DELETE ON catalog.%I FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement()',name);
  END LOOP;
END; $$;
