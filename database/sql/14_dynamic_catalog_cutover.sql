\set ON_ERROR_STOP on
-- Coordinated v1.2 cutover: requires explicit reviewed backfill and validation.
-- This replaces only legacy category applicability; all unrelated v1.1 rules remain.
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
    WHERE p.deleted_at IS NULL AND (
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
      d.deleted_at IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM catalog.product_type_specifications m
        WHERE m.product_type_id = p.product_type_id AND m.definition_id = v.definition_id AND m.deleted_at IS NULL)
      OR (v.value_type = 'NUMBER' AND (
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

ALTER TABLE catalog.specification_definitions ADD CONSTRAINT definition_finite_bounds CHECK (
  (minimum_value IS NULL OR minimum_value::text NOT IN ('NaN','Infinity','-Infinity')) AND
  (maximum_value IS NULL OR maximum_value::text NOT IN ('NaN','Infinity','-Infinity')));
CREATE FUNCTION catalog.assert_valid_dynamic_catalog() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
DECLARE pair text[]; invalid boolean;
BEGIN
  IF EXISTS(SELECT 1 FROM catalog.products p LEFT JOIN catalog.product_types t ON t.id=p.product_type_id WHERE p.deleted_at IS NULL AND (t.id IS NULL OR t.deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Every active product requires an active product type' USING ERRCODE='23514';
  END IF;
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['product_type_translations','product_types','product_type_id','name'],
    ARRAY['specification_group_translations','specification_groups','group_id','name'],
    ARRAY['unit_translations','units','unit_code','label']
  ] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM catalog.%I t JOIN catalog.%I o ON o.%I=t.%I WHERE t.deleted_at IS NULL AND o.deleted_at IS NOT NULL) OR EXISTS(SELECT 1 FROM catalog.%I o WHERE o.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM catalog.%I t WHERE t.%I=o.%I AND t.locale=''ar'' AND t.deleted_at IS NULL))',pair[1],pair[2],CASE WHEN pair[2]='units' THEN 'code' ELSE 'id' END,pair[3],pair[2],pair[1],pair[3],CASE WHEN pair[2]='units' THEN 'code' ELSE 'id' END) INTO invalid;
    IF invalid THEN RAISE EXCEPTION 'Configuration needs active owners and Arabic labels' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM catalog.product_type_groups g JOIN catalog.product_types t ON t.id=g.product_type_id JOIN catalog.specification_groups s ON s.id=g.group_id WHERE g.deleted_at IS NULL AND (t.deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL)) OR EXISTS(
    SELECT 1 FROM catalog.product_type_specifications a JOIN catalog.product_types t ON t.id=a.product_type_id JOIN catalog.specification_definitions d ON d.id=a.definition_id LEFT JOIN catalog.product_type_groups g ON g.id=a.type_group_id WHERE a.deleted_at IS NULL AND (t.deleted_at IS NOT NULL OR d.deleted_at IS NOT NULL OR (a.type_group_id IS NOT NULL AND g.deleted_at IS NOT NULL))) THEN
    RAISE EXCEPTION 'Type memberships require active owners, definitions and same-type groups' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM catalog.products p JOIN catalog.product_type_specifications a ON a.product_type_id=p.product_type_id AND a.deleted_at IS NULL AND a.is_required WHERE p.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM catalog.product_specification_values v WHERE v.product_id=p.id AND v.definition_id=a.definition_id AND v.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Active products require all required type attributes' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM catalog.product_specification_values v JOIN catalog.products p ON p.id=v.product_id JOIN catalog.specification_definitions d ON d.id=v.definition_id WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.value_type='NUMBER' AND v.number_value::text IN ('NaN','Infinity','-Infinity')) OR EXISTS(
    SELECT 1 FROM catalog.product_specification_texts x JOIN catalog.product_specification_values v ON v.id=x.value_id JOIN catalog.products p ON p.id=v.product_id JOIN catalog.specification_definitions d ON d.id=v.definition_id WHERE x.deleted_at IS NULL AND v.deleted_at IS NULL AND p.deleted_at IS NULL AND (length(x.text_value)>d.text_max_length OR (NOT d.text_multiline AND x.text_value ~ E'[\r\n]'))) THEN
    RAISE EXCEPTION 'Invalid finite number or supported text validation' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM catalog.product_type_specifications a JOIN catalog.specification_definitions d ON d.id=a.definition_id WHERE a.deleted_at IS NULL AND a.is_required AND (d.deprecated_at IS NOT NULL OR (d.value_type='CHOICE' AND NOT EXISTS(SELECT 1 FROM catalog.specification_options o WHERE o.definition_id=d.id AND o.deleted_at IS NULL AND o.deprecated_at IS NULL)))) THEN
    RAISE EXCEPTION 'A required field must remain available for new values' USING ERRCODE='23514';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION catalog.assert_valid_catalog() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  PERFORM catalog.assert_valid_base_catalog();
  PERFORM catalog.assert_valid_technical_sheets();
  PERFORM catalog.assert_valid_dynamic_catalog();
END;
$$;
CREATE FUNCTION catalog.guard_dynamic_new_use() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  IF TG_TABLE_NAME='products' THEN
    IF TG_OP='INSERT' OR NEW.product_type_id IS DISTINCT FROM OLD.product_type_id THEN
      IF EXISTS(SELECT 1 FROM catalog.product_types WHERE id=NEW.product_type_id AND deprecated_at IS NOT NULL) THEN RAISE EXCEPTION 'Deprecated type cannot receive new products' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('product_type_specifications','product_type_groups') THEN
    IF TG_OP='INSERT' THEN
      IF EXISTS(SELECT 1 FROM catalog.product_types WHERE id=NEW.product_type_id AND deprecated_at IS NOT NULL) THEN RAISE EXCEPTION 'Deprecated type cannot receive new memberships' USING ERRCODE='23514'; END IF;
      IF TG_TABLE_NAME='product_type_specifications' THEN
        IF EXISTS(SELECT 1 FROM catalog.specification_definitions WHERE id=NEW.definition_id AND deprecated_at IS NOT NULL) THEN RAISE EXCEPTION 'Deprecated attribute cannot be newly assigned' USING ERRCODE='23514'; END IF;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='product_specification_values' THEN
    IF TG_OP='INSERT' OR NEW.definition_id IS DISTINCT FROM OLD.definition_id OR NEW.number_value IS DISTINCT FROM OLD.number_value OR NEW.boolean_value IS DISTINCT FROM OLD.boolean_value THEN
      IF EXISTS(SELECT 1 FROM catalog.specification_definitions WHERE id=NEW.definition_id AND deprecated_at IS NOT NULL) THEN RAISE EXCEPTION 'Deprecated attribute cannot receive new values' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='product_specification_choices' THEN
    IF TG_OP='INSERT' OR NEW.option_id IS DISTINCT FROM OLD.option_id THEN
      IF EXISTS(SELECT 1 FROM catalog.specification_options WHERE id=NEW.option_id AND deprecated_at IS NOT NULL) OR EXISTS(SELECT 1 FROM catalog.specification_definitions WHERE id=NEW.definition_id AND deprecated_at IS NOT NULL) THEN RAISE EXCEPTION 'Deprecated option cannot be newly selected' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='product_specification_texts' THEN
    IF TG_OP='INSERT' OR NEW.text_value IS DISTINCT FROM OLD.text_value THEN
      IF EXISTS(SELECT 1 FROM catalog.product_specification_values v JOIN catalog.specification_definitions d ON d.id=v.definition_id WHERE v.id=NEW.value_id AND d.deprecated_at IS NOT NULL) THEN RAISE EXCEPTION 'Deprecated attribute cannot receive new text' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['products','product_type_specifications','product_type_groups','product_specification_values','product_specification_choices','product_specification_texts'] LOOP
    EXECUTE format('CREATE TRIGGER dynamic_new_use BEFORE INSERT OR UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.guard_dynamic_new_use()',name);
  END LOOP;
END; $$;
CREATE FUNCTION catalog.bump_effective_schema() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
DECLARE data jsonb:=to_jsonb(NEW); target uuid; definition uuid; group_key uuid; unit_key text;
BEGIN
  IF TG_TABLE_NAME='product_types' THEN
    IF TG_OP='UPDATE' AND NEW.schema_revision=OLD.schema_revision AND NEW.deleted_at IS NULL THEN UPDATE catalog.product_types SET schema_revision=schema_revision+1 WHERE id=NEW.id; END IF;
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME IN ('product_type_translations','product_type_groups','product_type_specifications') THEN
    target:=(data->>'product_type_id')::uuid;
  ELSIF TG_TABLE_NAME IN ('specification_groups','specification_group_translations') THEN
    group_key:=CASE WHEN TG_TABLE_NAME='specification_groups' THEN (data->>'id')::uuid ELSE (data->>'group_id')::uuid END;
  ELSIF TG_TABLE_NAME IN ('units','unit_translations') THEN
    unit_key:=CASE WHEN TG_TABLE_NAME='units' THEN data->>'code' ELSE data->>'unit_code' END;
  ELSE
    definition:=CASE WHEN TG_TABLE_NAME='specification_definitions' THEN (data->>'id')::uuid WHEN TG_TABLE_NAME='specification_option_translations' THEN (SELECT definition_id FROM catalog.specification_options WHERE id=(data->>'option_id')::uuid) ELSE (data->>'definition_id')::uuid END;
  END IF;
  UPDATE catalog.product_types t SET schema_revision=t.schema_revision+1 WHERE t.deleted_at IS NULL AND (
    t.id=target OR EXISTS(SELECT 1 FROM catalog.product_type_groups g WHERE g.product_type_id=t.id AND g.group_id=group_key AND g.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM catalog.product_type_specifications a JOIN catalog.specification_definitions d ON d.id=a.definition_id WHERE a.product_type_id=t.id AND a.deleted_at IS NULL AND (a.definition_id=definition OR d.unit_code=unit_key)));
  RETURN NULL;
END;
$$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['product_types','product_type_translations','product_type_groups','product_type_specifications','specification_definitions','specification_translations','specification_options','specification_option_translations','specification_groups','specification_group_translations','units','unit_translations'] LOOP
    EXECUTE format('CREATE TRIGGER schema_dependency AFTER INSERT OR UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.bump_effective_schema()',name);
  END LOOP;
END; $$;
CREATE FUNCTION catalog.soft_delete_dynamic_owned_rows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF TG_TABLE_NAME='product_types' THEN
      UPDATE catalog.product_type_specifications SET deleted_at=NEW.deleted_at WHERE product_type_id=NEW.id AND deleted_at IS NULL;
      UPDATE catalog.product_type_groups SET deleted_at=NEW.deleted_at WHERE product_type_id=NEW.id AND deleted_at IS NULL;
      UPDATE catalog.product_type_translations SET deleted_at=NEW.deleted_at WHERE product_type_id=NEW.id AND deleted_at IS NULL;
    ELSIF TG_TABLE_NAME='specification_groups' THEN
      UPDATE catalog.specification_group_translations SET deleted_at=NEW.deleted_at WHERE group_id=NEW.id AND deleted_at IS NULL;
    ELSIF TG_TABLE_NAME='specification_definitions' THEN
      UPDATE catalog.specification_translations SET deleted_at=NEW.deleted_at WHERE definition_id=NEW.id AND deleted_at IS NULL;
      UPDATE catalog.specification_options SET deleted_at=NEW.deleted_at WHERE definition_id=NEW.id AND deleted_at IS NULL;
    ELSIF TG_TABLE_NAME='specification_options' THEN
      UPDATE catalog.specification_option_translations SET deleted_at=NEW.deleted_at WHERE option_id=NEW.id AND deleted_at IS NULL;
    ELSIF TG_TABLE_NAME='units' THEN
      UPDATE catalog.unit_translations SET deleted_at=NEW.deleted_at WHERE unit_code=NEW.code AND deleted_at IS NULL;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['product_types','specification_groups','specification_definitions','specification_options','units'] LOOP
    EXECUTE format('CREATE TRIGGER soft_delete_dynamic_owned AFTER UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.soft_delete_dynamic_owned_rows()',name);
  END LOOP;
END; $$;
CREATE FUNCTION catalog.guard_legacy_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Category assignments are retained migration evidence only' USING ERRCODE='23514'; END IF;
  IF NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.category_id=OLD.category_id AND NEW.definition_id=OLD.definition_id AND NEW.sort_order=OLD.sort_order) THEN RAISE EXCEPTION 'Legacy category eligibility cannot be changed after cutover' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER legacy_configuration_closed BEFORE INSERT OR UPDATE ON catalog.category_specifications FOR EACH ROW EXECUTE FUNCTION catalog.guard_legacy_configuration();
CREATE VIEW catalog.public_product_specification_values AS
SELECT v.* FROM catalog.product_specification_values v JOIN catalog.live_products p ON p.id=v.product_id
JOIN catalog.specification_definitions d ON d.id=v.definition_id AND d.deleted_at IS NULL AND d.is_public
JOIN catalog.product_type_specifications a ON a.product_type_id=p.product_type_id AND a.definition_id=v.definition_id AND a.deleted_at IS NULL AND a.is_public
WHERE v.deleted_at IS NULL;
CREATE VIEW catalog.public_technical_measurements AS
SELECT m.* FROM catalog.technical_measurements m JOIN catalog.specification_definitions d ON d.id=m.definition_id AND d.deleted_at IS NULL AND d.is_public WHERE m.deleted_at IS NULL;
CREATE VIEW catalog.public_technical_notes AS
SELECT n.* FROM catalog.technical_notes n JOIN catalog.public_technical_measurements m ON m.id=n.measurement_id WHERE n.deleted_at IS NULL AND n.source_observation_id IS NULL;
-- Fail cutover before commit if mappings, labels, eligibility or active products are incomplete.
SELECT catalog.assert_valid_catalog();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog FROM PUBLIC;
