\set ON_ERROR_STOP on
-- Coordinated authority switch after reviewed backfill, parity validation and writer shutdown.
-- Retire classification metadata as immutable evidence; retain all typed values and media.
ALTER TABLE catalog.products ALTER COLUMN cover_media_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION catalog.assert_valid_base_catalog() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, catalog, ops AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM catalog.categories c
    LEFT JOIN catalog.categories p ON p.id = c.parent_id
    WHERE c.deleted_at IS NULL AND c.parent_id IS NOT NULL
      AND (p.id IS NULL OR p.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Active categories require active parents' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id AS origin_id, id, parent_id, ARRAY[id] AS path, false AS is_cycle
      FROM catalog.categories WHERE deleted_at IS NULL
      UNION ALL
      SELECT w.origin_id, c.id, c.parent_id, w.path || c.id, c.id = ANY(w.path)
      FROM chain w JOIN catalog.categories c ON c.id = w.parent_id
      WHERE NOT w.is_cycle AND c.deleted_at IS NULL
    ) SELECT 1 FROM chain WHERE is_cycle
  ) THEN
    RAISE EXCEPTION 'Category cycles are prohibited' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.categories c
    WHERE c.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM catalog.categories ch WHERE ch.parent_id = c.id AND ch.deleted_at IS NULL)
      AND EXISTS (SELECT 1 FROM catalog.products p WHERE p.category_id = c.id AND p.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'A category cannot contain both active children and active products' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.products p LEFT JOIN catalog.categories c ON c.id = p.category_id
    WHERE p.deleted_at IS NULL AND (c.id IS NULL OR c.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'An active product requires an active category' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.categories c WHERE c.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM catalog.category_translations t
      WHERE t.category_id = c.id AND t.locale = 'ar' AND t.deleted_at IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM catalog.products p WHERE p.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM catalog.product_translations t
      WHERE t.product_id = p.id AND t.locale = 'ar' AND t.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Active categories and products require an Arabic name' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.products p
    LEFT JOIN catalog.product_media m ON m.id = p.cover_media_id AND m.product_id = p.id
    LEFT JOIN catalog.media_asset_refs a ON a.id = m.asset_id
    WHERE p.deleted_at IS NULL AND (p.is_active OR p.cover_media_id IS NOT NULL) AND (
      m.id IS NULL OR m.deleted_at IS NOT NULL OR a.id IS NULL
      OR a.deleted_at IS NOT NULL OR a.ready_at IS NULL OR a.media_kind <> 'IMAGE')
  ) THEN
    RAISE EXCEPTION 'Every active product requires its own active, verified IMAGE cover' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.product_media m
    JOIN catalog.products p ON p.id = m.product_id
    LEFT JOIN catalog.media_asset_refs a ON a.id = m.asset_id
    WHERE p.deleted_at IS NULL AND m.deleted_at IS NULL
      AND (a.id IS NULL OR a.deleted_at IS NOT NULL OR a.ready_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Active product media requires an attachable verified asset' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT cover_asset_id AS asset_id FROM catalog.categories WHERE deleted_at IS NULL
      UNION ALL SELECT cover_asset_id FROM catalog.pages WHERE deleted_at IS NULL
      UNION ALL SELECT logo_asset_id FROM catalog.site_settings WHERE deleted_at IS NULL
    ) refs LEFT JOIN catalog.media_asset_refs a ON a.id = refs.asset_id
    WHERE refs.asset_id IS NOT NULL AND
      (a.id IS NULL OR a.deleted_at IS NOT NULL OR a.ready_at IS NULL OR a.media_kind <> 'IMAGE')
  ) THEN
    RAISE EXCEPTION 'Category/page covers and logo require active verified IMAGE assets' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.products p
    LEFT JOIN catalog.product_code_reservations r ON r.id = p.current_model_code_id AND r.product_id = p.id
    WHERE p.deleted_at IS NULL AND p.current_model_code_id IS NOT NULL
      AND (r.id IS NULL OR r.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Current model code must be a live reservation owned by the product' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.specification_definitions d
    LEFT JOIN catalog.units u ON u.code = d.unit_code
    WHERE d.deleted_at IS NULL AND (
      (d.unit_code IS NOT NULL AND (u.code IS NULL OR u.deleted_at IS NOT NULL))
      OR NOT EXISTS (SELECT 1 FROM catalog.specification_translations t
        WHERE t.definition_id = d.id AND t.locale = 'ar' AND t.deleted_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'Specifications require active units and Arabic labels' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.specification_options o
    JOIN catalog.specification_definitions d ON d.id = o.definition_id
    WHERE o.deleted_at IS NULL AND (
      d.deleted_at IS NOT NULL OR d.value_type <> 'CHOICE'
      OR NOT EXISTS (SELECT 1 FROM catalog.specification_option_translations t
        WHERE t.option_id = o.id AND t.locale = 'ar' AND t.deleted_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'Options require an active CHOICE definition and Arabic label' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.product_specification_values v
    JOIN catalog.products p ON p.id = v.product_id
    JOIN catalog.specification_definitions d ON d.id = v.definition_id
    WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND (
      d.deleted_at IS NOT NULL OR (v.value_type = 'NUMBER' AND (
        (d.minimum_value IS NOT NULL AND v.number_value < d.minimum_value)
        OR (d.maximum_value IS NOT NULL AND v.number_value > d.maximum_value)))
      OR (v.value_type = 'TEXT' AND NOT EXISTS (
        SELECT 1 FROM catalog.product_specification_texts t
        WHERE t.value_id = v.id AND t.locale = 'ar' AND t.deleted_at IS NULL))
      OR (v.value_type = 'CHOICE' AND (
        (SELECT count(*) FROM catalog.product_specification_choices ch WHERE ch.value_id = v.id AND ch.deleted_at IS NULL) = 0
        OR (NOT d.allow_multiple AND
          (SELECT count(*) FROM catalog.product_specification_choices ch WHERE ch.value_id = v.id AND ch.deleted_at IS NULL) <> 1)))
    )
  ) THEN
    RAISE EXCEPTION 'Invalid product specification value, applicability, bounds, or choice count' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.product_specification_texts t
    JOIN catalog.product_specification_values v ON v.id = t.value_id
    JOIN catalog.products p ON p.id = v.product_id
    WHERE t.deleted_at IS NULL AND v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.value_type <> 'TEXT'
  ) OR EXISTS (
    SELECT 1 FROM catalog.product_specification_choices ch
    JOIN catalog.product_specification_values v ON v.id = ch.value_id
    JOIN catalog.products p ON p.id = v.product_id
    JOIN catalog.specification_options o ON o.id = ch.option_id
    WHERE ch.deleted_at IS NULL AND v.deleted_at IS NULL AND p.deleted_at IS NULL
      AND (v.value_type <> 'CHOICE' OR o.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Specification detail rows must match type and active option' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.pages p WHERE p.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM catalog.page_translations t
      WHERE t.page_id = p.id AND t.locale = 'ar' AND t.deleted_at IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM catalog.faq_items f WHERE f.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM catalog.faq_translations t
      WHERE t.faq_id = f.id AND t.locale = 'ar' AND t.deleted_at IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM catalog.site_settings s WHERE s.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM catalog.site_setting_translations t
      WHERE t.settings_id = s.id AND t.locale = 'ar' AND t.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Public company content requires Arabic fallback content' USING ERRCODE = '23514';
  END IF;
END;
$$;


CREATE FUNCTION catalog.assert_valid_category_catalog() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
DECLARE pair text[]; invalid boolean;
BEGIN
  PERFORM catalog.assert_valid_category_relationships();
  IF EXISTS(SELECT 1 FROM catalog.products p JOIN catalog.product_specification_values v ON v.product_id=p.id AND v.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND p.is_active AND NOT EXISTS(SELECT 1 FROM catalog.category_effective_attributes a WHERE a.category_id=p.category_id AND a.definition_id=v.definition_id)) THEN
    RAISE EXCEPTION 'Published products require explicit resolution of retained attributes outside the category schema' USING ERRCODE='23514';
  END IF;
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['specification_group_translations','specification_groups','group_id','name'],
    ARRAY['unit_translations','units','unit_code','label']
  ] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM catalog.%I t JOIN catalog.%I o ON o.%I=t.%I WHERE t.deleted_at IS NULL AND o.deleted_at IS NOT NULL) OR EXISTS(SELECT 1 FROM catalog.%I o WHERE o.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM catalog.%I t WHERE t.%I=o.%I AND t.locale=''ar'' AND t.deleted_at IS NULL))',pair[1],pair[2],CASE WHEN pair[2]='units' THEN 'code' ELSE 'id' END,pair[3],pair[2],pair[1],pair[3],CASE WHEN pair[2]='units' THEN 'code' ELSE 'id' END) INTO invalid;
    IF invalid THEN RAISE EXCEPTION 'Configuration needs live owners and Arabic labels' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM catalog.products p JOIN catalog.category_effective_attributes a ON a.category_id=p.category_id AND a.is_required
    WHERE p.deleted_at IS NULL AND p.is_active AND NOT EXISTS(SELECT 1 FROM catalog.product_specification_values v WHERE v.product_id=p.id AND v.definition_id=a.definition_id AND v.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Published products require all required category attributes' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM catalog.product_specification_values v JOIN catalog.products p ON p.id=v.product_id WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.value_type='NUMBER' AND v.number_value::text IN ('NaN','Infinity','-Infinity')) OR EXISTS(
    SELECT 1 FROM catalog.product_specification_texts x JOIN catalog.product_specification_values v ON v.id=x.value_id JOIN catalog.products p ON p.id=v.product_id JOIN catalog.specification_definitions d ON d.id=v.definition_id WHERE x.deleted_at IS NULL AND v.deleted_at IS NULL AND p.deleted_at IS NULL AND (length(x.text_value)>d.text_max_length OR (NOT d.text_multiline AND x.text_value ~ E'[\r\n]'))) THEN
    RAISE EXCEPTION 'Invalid finite number or supported text validation' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM catalog.attribute_group_attributes a JOIN catalog.specification_definitions d ON d.id=a.definition_id WHERE a.deleted_at IS NULL AND a.is_required AND (d.deprecated_at IS NOT NULL OR (d.value_type='CHOICE' AND NOT EXISTS(SELECT 1 FROM catalog.specification_options o WHERE o.definition_id=d.id AND o.deleted_at IS NULL AND o.deprecated_at IS NULL)))) THEN
    RAISE EXCEPTION 'A required field must remain available for new values' USING ERRCODE='23514';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION catalog.assert_valid_catalog() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  PERFORM catalog.assert_valid_base_catalog();
  PERFORM catalog.assert_valid_technical_sheets();
  PERFORM catalog.assert_valid_category_catalog();
END;
$$;

-- Old service binaries must fail their stage check, rather than keep editing retired types.
DROP FUNCTION catalog.assert_valid_dynamic_catalog();
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['product_types','product_type_translations','product_type_groups','product_type_specifications','specification_definitions','specification_translations','specification_options','specification_option_translations','specification_groups','specification_group_translations','units','unit_translations'] LOOP
    EXECUTE format('DROP TRIGGER schema_dependency ON catalog.%I',name);
  END LOOP;
  FOREACH name IN ARRAY ARRAY['products','product_type_specifications','product_type_groups','product_specification_values','product_specification_choices','product_specification_texts'] LOOP
    EXECUTE format('DROP TRIGGER dynamic_new_use ON catalog.%I',name);
  END LOOP;
END; $$;
DROP FUNCTION catalog.bump_effective_schema();
DROP FUNCTION catalog.guard_dynamic_new_use();
DROP TRIGGER soft_delete_dynamic_owned ON catalog.product_types;

CREATE FUNCTION catalog.guard_category_new_use() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
DECLARE product_key uuid; definition_key uuid; changed boolean;
BEGIN
  IF TG_TABLE_NAME='attribute_group_attributes' THEN
    IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM catalog.specification_definitions WHERE id=NEW.definition_id AND deprecated_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Deprecated attribute cannot be newly assigned' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME='product_specification_values' THEN
    product_key:=NEW.product_id; definition_key:=NEW.definition_id;
    changed:=TG_OP='INSERT';
    IF TG_OP='UPDATE' THEN changed:=NEW.number_value IS DISTINCT FROM OLD.number_value OR NEW.boolean_value IS DISTINCT FROM OLD.boolean_value; END IF;
  ELSIF TG_TABLE_NAME='product_specification_texts' THEN
    SELECT product_id,definition_id INTO product_key,definition_key FROM catalog.product_specification_values WHERE id=NEW.value_id;
    changed:=TG_OP='INSERT';
    IF TG_OP='UPDATE' THEN changed:=NEW.text_value IS DISTINCT FROM OLD.text_value; END IF;
  ELSE
    SELECT product_id,definition_id INTO product_key,definition_key FROM catalog.product_specification_values WHERE id=NEW.value_id;
    changed:=TG_OP='INSERT';
    IF TG_OP='UPDATE' THEN changed:=NEW.option_id IS DISTINCT FROM OLD.option_id; END IF;
    IF changed AND EXISTS(SELECT 1 FROM catalog.specification_options WHERE id=NEW.option_id AND deprecated_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Deprecated option cannot be newly selected' USING ERRCODE='23514';
    END IF;
  END IF;
  IF changed THEN
    IF EXISTS(SELECT 1 FROM catalog.specification_definitions WHERE id=definition_key AND deprecated_at IS NOT NULL) OR NOT EXISTS(
      SELECT 1 FROM catalog.products p JOIN catalog.category_effective_attributes a ON a.category_id=p.category_id AND a.definition_id=definition_key
      WHERE p.id=product_key AND p.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'New values require an available category attribute' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['attribute_group_attributes','product_specification_values','product_specification_choices','product_specification_texts'] LOOP
    EXECUTE format('CREATE TRIGGER category_new_use BEFORE INSERT OR UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.guard_category_new_use()',name);
  END LOOP;
END; $$;

CREATE FUNCTION catalog.bump_category_schema() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
DECLARE data jsonb:=to_jsonb(NEW); target uuid; definition uuid; group_key uuid; unit_key text;
BEGIN
  IF TG_TABLE_NAME='categories' THEN
    IF TG_OP='UPDATE' AND NEW.schema_revision=OLD.schema_revision AND NEW.deleted_at IS NULL THEN
      UPDATE catalog.categories SET schema_revision=schema_revision+1 WHERE id=NEW.id;
    END IF;
    RETURN NULL;
  ELSIF TG_TABLE_NAME IN ('category_translations','category_attribute_groups') THEN
    target:=(data->>'category_id')::uuid;
  ELSIF TG_TABLE_NAME IN ('specification_groups','specification_group_translations','attribute_group_attributes') THEN
    group_key:=CASE WHEN TG_TABLE_NAME='specification_groups' THEN (data->>'id')::uuid ELSE (data->>'group_id')::uuid END;
    IF TG_TABLE_NAME='attribute_group_attributes' THEN
      -- Group optimistic versions include membership edits made from either direction.
      UPDATE catalog.specification_groups SET updated_at=clock_timestamp() WHERE id=group_key AND deleted_at IS NULL;
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME IN ('units','unit_translations') THEN
    unit_key:=CASE WHEN TG_TABLE_NAME='units' THEN data->>'code' ELSE data->>'unit_code' END;
  ELSE
    definition:=CASE WHEN TG_TABLE_NAME='specification_definitions' THEN (data->>'id')::uuid WHEN TG_TABLE_NAME='specification_option_translations' THEN (SELECT definition_id FROM catalog.specification_options WHERE id=(data->>'option_id')::uuid) ELSE (data->>'definition_id')::uuid END;
  END IF;
  UPDATE catalog.categories c SET schema_revision=c.schema_revision+1 WHERE c.deleted_at IS NULL AND (
    c.id=target OR EXISTS(SELECT 1 FROM catalog.category_attribute_groups g WHERE g.category_id=c.id AND g.deleted_at IS NULL AND (
      g.group_id=group_key OR EXISTS(SELECT 1 FROM catalog.attribute_group_attributes a JOIN catalog.specification_definitions d ON d.id=a.definition_id WHERE a.group_id=g.group_id AND a.deleted_at IS NULL AND (a.definition_id=definition OR d.unit_code=unit_key))
    )));
  RETURN NULL;
END;
$$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['categories','category_translations','category_attribute_groups','attribute_group_attributes','specification_definitions','specification_translations','specification_options','specification_option_translations','specification_groups','specification_group_translations','units','unit_translations'] LOOP
    EXECUTE format('CREATE TRIGGER category_schema_dependency AFTER INSERT OR UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.bump_category_schema()',name);
  END LOOP;
END; $$;

CREATE FUNCTION catalog.guard_retired_type_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  RAISE EXCEPTION 'Product Type is retired; use category and reusable group relationships' USING ERRCODE='23514';
END;
$$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['product_types','product_type_translations','product_type_groups','product_type_specifications'] LOOP
    EXECUTE format('CREATE TRIGGER retired_type_configuration BEFORE INSERT OR UPDATE ON catalog.%I FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_retired_type_configuration()',name);
  END LOOP;
END; $$;
CREATE OR REPLACE VIEW catalog.public_product_specification_values AS
SELECT v.* FROM catalog.product_specification_values v JOIN catalog.live_products p ON p.id=v.product_id
JOIN catalog.category_effective_attributes a ON a.category_id=p.category_id AND a.definition_id=v.definition_id AND a.is_public
WHERE v.deleted_at IS NULL AND p.is_active;
-- Existing bindings are retained historical evidence. New products have no type binding.
CREATE FUNCTION catalog.guard_retired_product_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.product_type_id IS NOT NULL) OR
     (TG_OP='UPDATE' AND NEW.product_type_id IS DISTINCT FROM OLD.product_type_id) THEN
    RAISE EXCEPTION 'Product Type binding is retired' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER retired_product_binding BEFORE INSERT OR UPDATE ON catalog.products
FOR EACH ROW EXECUTE FUNCTION catalog.guard_retired_product_binding();
ALTER TABLE catalog.products ALTER COLUMN is_active SET DEFAULT false;
SELECT catalog.assert_valid_catalog();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog FROM PUBLIC;
