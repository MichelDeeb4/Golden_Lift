-- Install after 02_catalog.sql in the Catalog database only.
-- This is a correctness-first reference implementation, NOT a benchmarked migration.

-- Private, transactional write fence. Ordinary readers do not lock it.
CREATE TABLE catalog.write_gate (
  id smallint PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0,
  validated_revision bigint NOT NULL DEFAULT 0
);
INSERT INTO catalog.write_gate (id) VALUES (1);
CREATE TRIGGER gate_no_delete BEFORE DELETE OR TRUNCATE ON catalog.write_gate
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

CREATE FUNCTION catalog.lock_write() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, catalog, ops AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'Catalog writes require an explicit SERIALIZABLE transaction' USING ERRCODE = '25000';
  END IF;
  UPDATE catalog.write_gate SET revision = revision + 1 WHERE id = 1;
END;
$$;

CREATE FUNCTION catalog.guard_write_statement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, catalog, ops AS $$
BEGIN
  PERFORM catalog.lock_write();
  RETURN NULL;
END;
$$;

-- Defensive public visibility also checks ancestors by walking from live roots.
CREATE VIEW catalog.live_categories AS
WITH RECURSIVE visible AS (
  SELECT c.* FROM catalog.categories c
  WHERE c.parent_id IS NULL AND c.deleted_at IS NULL
  UNION ALL
  SELECT c.* FROM catalog.categories c
  JOIN visible p ON c.parent_id = p.id
  WHERE c.deleted_at IS NULL
)
SELECT * FROM visible;

CREATE VIEW catalog.live_products AS
SELECT p.* FROM catalog.products p
JOIN catalog.live_categories c ON c.id = p.category_id
WHERE p.deleted_at IS NULL;

CREATE VIEW catalog.live_category_translations AS
SELECT t.* FROM catalog.category_translations t
JOIN catalog.live_categories c ON c.id = t.category_id
WHERE t.deleted_at IS NULL;

CREATE VIEW catalog.live_product_translations AS
SELECT t.* FROM catalog.product_translations t
JOIN catalog.live_products p ON p.id = t.product_id
WHERE t.deleted_at IS NULL;

CREATE VIEW catalog.live_product_media AS
SELECT m.* FROM catalog.product_media m
JOIN catalog.live_products p ON p.id = m.product_id
JOIN catalog.media_asset_refs a ON a.id = m.asset_id
WHERE m.deleted_at IS NULL AND a.deleted_at IS NULL;

-- Every public asset reference must have an explicit owner represented here.
-- Rich-text schemas must not bypass this registry with embedded object URLs.
CREATE VIEW catalog.active_asset_usage AS
SELECT m.asset_id, 'PRODUCT'::text AS owner_type, m.product_id AS owner_id
FROM catalog.live_product_media m
UNION ALL
SELECT c.cover_asset_id, 'CATEGORY', c.id
FROM catalog.live_categories c WHERE c.cover_asset_id IS NOT NULL
UNION ALL
SELECT p.cover_asset_id, 'PAGE', p.id
FROM catalog.pages p WHERE p.deleted_at IS NULL AND p.cover_asset_id IS NOT NULL
UNION ALL
SELECT s.logo_asset_id, 'SITE_LOGO', NULL::uuid
FROM catalog.site_settings s WHERE s.deleted_at IS NULL AND s.logo_asset_id IS NOT NULL;

CREATE FUNCTION catalog.assert_valid_catalog() RETURNS void
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
    SELECT 1 FROM catalog.category_specifications m
    JOIN catalog.categories c ON c.id = m.category_id
    JOIN catalog.specification_definitions d ON d.id = m.definition_id
    WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL AND d.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Active category assignments cannot refer to deleted definitions' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.product_specification_values v
    JOIN catalog.products p ON p.id = v.product_id
    JOIN catalog.specification_definitions d ON d.id = v.definition_id
    WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND (
      d.deleted_at IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM catalog.category_specifications m
        WHERE m.category_id = p.category_id AND m.definition_id = v.definition_id AND m.deleted_at IS NULL)
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

CREATE FUNCTION catalog.validate_deferred() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, catalog, ops AS $$
DECLARE current_revision bigint; checked_revision bigint;
BEGIN
  SELECT revision, validated_revision INTO current_revision, checked_revision
  FROM catalog.write_gate WHERE id = 1;
  IF current_revision <> checked_revision THEN
    PERFORM catalog.assert_valid_catalog();
    UPDATE catalog.write_gate SET validated_revision = revision WHERE id = 1;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION catalog.guard_definition_semantics() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, catalog, ops AS $$
BEGIN
  IF (NEW.value_type IS DISTINCT FROM OLD.value_type OR NEW.unit_code IS DISTINCT FROM OLD.unit_code)
     AND EXISTS (SELECT 1 FROM catalog.product_specification_values WHERE definition_id = OLD.id) THEN
    RAISE EXCEPTION 'Type/unit cannot change once any values exist, including deleted values' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER definition_semantics BEFORE UPDATE ON catalog.specification_definitions
FOR EACH ROW EXECUTE FUNCTION catalog.guard_definition_semantics();

-- Guard all Catalog business writes, not only the most obvious tree tables.
-- write_gate itself is excluded and is NOT writable by the runtime login.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'catalog' AND tablename <> 'write_gate'
  LOOP
    EXECUTE format('CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.%I FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement()',t.tablename);
    EXECUTE format('CREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred()',t.tablename);
  END LOOP;
END;
$$;

CREATE FUNCTION catalog.soft_delete_branch(p_root uuid, p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, catalog, ops AS $$
DECLARE category_ids uuid[]; product_ids uuid[]; stamp timestamptz := clock_timestamp(); current_version bigint;
BEGIN
  PERFORM catalog.lock_write();
  SELECT version INTO current_version FROM catalog.categories WHERE id = p_root AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002'; END IF;
  IF current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Category edit conflict' USING ERRCODE = 'P0001';
  END IF;
  WITH RECURSIVE subtree AS (
    SELECT id FROM catalog.categories WHERE id = p_root AND deleted_at IS NULL
    UNION ALL
    SELECT c.id FROM catalog.categories c JOIN subtree s ON c.parent_id = s.id WHERE c.deleted_at IS NULL
  ) SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO category_ids FROM subtree;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO product_ids
  FROM catalog.products WHERE category_id = ANY(category_ids) AND deleted_at IS NULL;

  UPDATE catalog.product_media_translations SET deleted_at = stamp
    WHERE deleted_at IS NULL AND product_media_id IN (SELECT id FROM catalog.product_media WHERE product_id = ANY(product_ids));
  UPDATE catalog.product_specification_choices SET deleted_at = stamp
    WHERE deleted_at IS NULL AND value_id IN (SELECT id FROM catalog.product_specification_values WHERE product_id = ANY(product_ids));
  UPDATE catalog.product_specification_texts SET deleted_at = stamp
    WHERE deleted_at IS NULL AND value_id IN (SELECT id FROM catalog.product_specification_values WHERE product_id = ANY(product_ids));
  UPDATE catalog.product_specification_values SET deleted_at = stamp WHERE deleted_at IS NULL AND product_id = ANY(product_ids);
  UPDATE catalog.product_translations SET deleted_at = stamp WHERE deleted_at IS NULL AND product_id = ANY(product_ids);
  UPDATE catalog.product_media SET deleted_at = stamp WHERE deleted_at IS NULL AND product_id = ANY(product_ids);
  UPDATE catalog.product_code_reservations SET deleted_at = stamp WHERE deleted_at IS NULL AND product_id = ANY(product_ids);
  UPDATE catalog.products SET deleted_at = stamp WHERE deleted_at IS NULL AND id = ANY(product_ids);
  UPDATE catalog.category_translations SET deleted_at = stamp WHERE deleted_at IS NULL AND category_id = ANY(category_ids);
  UPDATE catalog.category_specifications SET deleted_at = stamp WHERE deleted_at IS NULL AND category_id = ANY(category_ids);
  UPDATE catalog.categories SET deleted_at = stamp WHERE deleted_at IS NULL AND id = ANY(category_ids);

  INSERT INTO ops.outbox_events(aggregate_type,aggregate_id,aggregate_version,event_type,payload)
  VALUES ('Category',p_root,current_version+1,'CatalogBranchSoftDeleted',
    jsonb_build_object('root_id',p_root,'category_count',cardinality(category_ids),'product_count',cardinality(product_ids)));
  RETURN jsonb_build_object('category_count',cardinality(category_ids),'product_count',cardinality(product_ids));
END;
$$;

CREATE FUNCTION catalog.retire_media_asset(p_asset_id uuid, p_kind text, p_source_version bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, catalog, ops AS $$
DECLARE existing catalog.media_asset_refs%ROWTYPE; event_id uuid := gen_random_uuid(); next_version bigint;
BEGIN
  PERFORM catalog.lock_write();
  SELECT * INTO existing FROM catalog.media_asset_refs WHERE id = p_asset_id;
  IF FOUND AND existing.deleted_at IS NOT NULL THEN RETURN existing.retirement_event_id; END IF;
  IF EXISTS (SELECT 1 FROM catalog.active_asset_usage WHERE asset_id = p_asset_id) THEN
    RAISE EXCEPTION 'Asset still has active references; remove or replace them first' USING ERRCODE = '23514';
  END IF;
  IF existing.id IS NULL THEN
    -- An upload can fail before Catalog ever registers it. Tombstone it now so
    -- a delayed READY event cannot attach it after retirement.
    INSERT INTO catalog.media_asset_refs(id,media_kind,source_version,ready_at,deleted_at,retirement_event_id)
    VALUES(p_asset_id,p_kind,p_source_version,NULL,clock_timestamp(),event_id)
    RETURNING version INTO next_version;
  ELSE
    UPDATE catalog.media_asset_refs SET deleted_at=clock_timestamp(),retirement_event_id=event_id
    WHERE id=p_asset_id RETURNING version INTO next_version;
  END IF;
  INSERT INTO ops.outbox_events(id,aggregate_type,aggregate_id,aggregate_version,event_type,payload)
  VALUES(event_id,'MediaReference',p_asset_id,next_version,'AssetRetirementAccepted',
    jsonb_build_object('asset_id',p_asset_id,'retirement_event_id',event_id));
  RETURN event_id;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog FROM PUBLIC;
