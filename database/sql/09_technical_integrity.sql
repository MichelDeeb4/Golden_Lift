-- Behavioral part of the v1.1 migration. Included by 09_technical_sheets.sql.
CREATE FUNCTION catalog.assert_valid_technical_sheets() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, catalog, ops AS $$
DECLARE pair text[]; child text; parent text; owner_key text; root text;
BEGIN
  -- Every active sheet child needs an active owning sheet, even private evidence.
  FOREACH child IN ARRAY ARRAY[
    'technical_sheet_translations','technical_sheet_sources','technical_source_observations',
    'technical_sections','technical_configurations','technical_conditions','technical_measurements',
    'technical_notes','category_technical_sheets','product_technical_sheets','product_technical_configurations'
  ] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM catalog.%I c JOIN catalog.technical_sheets s ON s.id=c.sheet_id WHERE c.deleted_at IS NULL AND s.deleted_at IS NOT NULL)', child) INTO STRICT root;
    IF root::boolean THEN
      RAISE EXCEPTION 'Active % rows require an active sheet', child USING ERRCODE='23514';
    END IF;
  END LOOP;

  -- Translations need active owners; all translated technical identities need Arabic.
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['technical_sheet_translations','technical_sheets','sheet_id'],
    ARRAY['technical_section_translations','technical_sections','section_id'],
    ARRAY['technical_configuration_translations','technical_configurations','configuration_id'],
    ARRAY['technical_condition_translations','technical_conditions','condition_id'],
    ARRAY['technical_note_translations','technical_notes','note_id']
  ] LOOP
    child:=pair[1]; parent:=pair[2]; owner_key:=pair[3];
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM catalog.%I t JOIN catalog.%I p ON p.id=t.%I WHERE t.deleted_at IS NULL AND p.deleted_at IS NOT NULL) OR EXISTS (SELECT 1 FROM catalog.%I p WHERE p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM catalog.%I t WHERE t.%I=p.id AND t.locale=''ar'' AND t.deleted_at IS NULL))',child,parent,owner_key,parent,child,owner_key) INTO STRICT root;
    IF root::boolean THEN
      RAISE EXCEPTION 'Technical translations need active owners and Arabic fallback: %', parent USING ERRCODE='23514';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM catalog.technical_sheet_sources s JOIN catalog.media_asset_refs a ON a.id=s.asset_id
    WHERE s.deleted_at IS NULL AND (a.deleted_at IS NOT NULL OR a.ready_at IS NULL OR a.media_kind<>'PDF')
  ) THEN RAISE EXCEPTION 'Technical sources require active verified READY PDF assets' USING ERRCODE='23514'; END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.technical_source_observations o JOIN catalog.technical_sheet_sources s ON s.id=o.source_id
    WHERE o.deleted_at IS NULL AND (s.deleted_at IS NOT NULL OR o.page_number NOT BETWEEN s.page_from AND s.page_to)
  ) THEN RAISE EXCEPTION 'Source observations require an active source and a page within its range' USING ERRCODE='23514'; END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.technical_measurements m
    JOIN catalog.technical_configurations c ON c.id=m.configuration_id
    JOIN catalog.technical_conditions k ON k.id=m.condition_id
    JOIN catalog.technical_sections g ON g.id=m.section_id
    JOIN catalog.specification_definitions d ON d.id=m.definition_id
    LEFT JOIN catalog.technical_source_observations o ON o.id=m.source_observation_id
    WHERE m.deleted_at IS NULL AND (
      c.deleted_at IS NOT NULL OR k.deleted_at IS NOT NULL OR g.deleted_at IS NOT NULL
      OR d.deleted_at IS NOT NULL OR d.value_type<>'NUMBER'
      OR (m.value_state='KNOWN' AND ((d.minimum_value IS NOT NULL AND m.number_value<d.minimum_value)
        OR (d.maximum_value IS NOT NULL AND m.number_value>d.maximum_value)))
      OR (o.id IS NOT NULL AND (o.deleted_at IS NOT NULL
        OR (o.requires_clarification AND o.resolution_note IS NULL)
        OR (btrim(o.raw_value_text)='' AND m.value_state<>'NOT_SPECIFIED')))
    )
  ) THEN RAISE EXCEPTION 'Invalid technical measurement ownership, bounds, source ambiguity or blank-cell interpretation' USING ERRCODE='23514'; END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.technical_measurements WHERE deleted_at IS NULL AND value_state='KNOWN'
    GROUP BY configuration_id,condition_id,definition_id
    HAVING max(number_value) FILTER (WHERE qualifier='MINIMUM') > min(number_value) FILTER (WHERE qualifier='MAXIMUM')
       OR max(number_value) FILTER (WHERE qualifier='MINIMUM') > max(number_value) FILTER (WHERE qualifier='EXACT')
       OR max(number_value) FILTER (WHERE qualifier='EXACT') > min(number_value) FILTER (WHERE qualifier='MAXIMUM')
  ) THEN RAISE EXCEPTION 'Technical minimum/exact/maximum values are inconsistent for this configuration and condition' USING ERRCODE='23514'; END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.technical_notes n
    LEFT JOIN catalog.technical_sections g ON g.id=n.section_id
    LEFT JOIN catalog.technical_configurations c ON c.id=n.configuration_id
    LEFT JOIN catalog.technical_conditions k ON k.id=n.condition_id
    LEFT JOIN catalog.technical_measurements m ON m.id=n.measurement_id
    LEFT JOIN catalog.technical_source_observations o ON o.id=n.source_observation_id
    WHERE n.deleted_at IS NULL AND (g.deleted_at IS NOT NULL OR c.deleted_at IS NOT NULL
      OR k.deleted_at IS NOT NULL OR m.deleted_at IS NOT NULL OR o.deleted_at IS NOT NULL
      OR (o.requires_clarification AND o.resolution_note IS NULL))
  ) THEN RAISE EXCEPTION 'Technical notes require active targets and resolved source observations' USING ERRCODE='23514'; END IF;

  IF EXISTS (
    SELECT 1 FROM catalog.category_technical_sheets l JOIN catalog.categories c ON c.id=l.category_id
    WHERE l.deleted_at IS NULL AND c.deleted_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM catalog.product_technical_sheets l JOIN catalog.products p ON p.id=l.product_id
    WHERE l.deleted_at IS NULL AND (p.deleted_at IS NOT NULL
      OR (l.relation_kind='PRODUCT_SPECIFICATION' AND NOT EXISTS (
        SELECT 1 FROM catalog.product_technical_configurations x WHERE x.product_sheet_id=l.id AND x.deleted_at IS NULL))
      OR (l.relation_kind='REFERENCE' AND EXISTS (
        SELECT 1 FROM catalog.product_technical_configurations x WHERE x.product_sheet_id=l.id AND x.deleted_at IS NULL)))
  ) OR EXISTS (
    SELECT 1 FROM catalog.product_technical_configurations x
    JOIN catalog.product_technical_sheets l ON l.id=x.product_sheet_id
    JOIN catalog.technical_configurations c ON c.id=x.configuration_id
    WHERE x.deleted_at IS NULL AND (l.deleted_at IS NOT NULL OR c.deleted_at IS NOT NULL OR l.relation_kind<>'PRODUCT_SPECIFICATION')
  ) THEN RAISE EXCEPTION 'Invalid technical attachment owner, mode or configuration selection' USING ERRCODE='23514'; END IF;
END;
$$;

ALTER FUNCTION catalog.assert_valid_catalog() RENAME TO assert_valid_base_catalog;
CREATE FUNCTION catalog.assert_valid_catalog() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  PERFORM catalog.assert_valid_base_catalog();
  PERFORM catalog.assert_valid_technical_sheets();
END;
$$;

CREATE OR REPLACE FUNCTION catalog.guard_definition_semantics() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  IF (NEW.value_type IS DISTINCT FROM OLD.value_type OR NEW.unit_code IS DISTINCT FROM OLD.unit_code)
    AND (EXISTS (SELECT 1 FROM catalog.product_specification_values WHERE definition_id=OLD.id)
      OR EXISTS (SELECT 1 FROM catalog.technical_measurements WHERE definition_id=OLD.id)) THEN
    RAISE EXCEPTION 'Type/unit cannot change once any product or technical values exist, including deleted values' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Keep the branch-deletion routine compatible without duplicating its implementation.
CREATE FUNCTION catalog.soft_delete_owner_technical_links() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF TG_TABLE_NAME='products' THEN
      UPDATE catalog.product_technical_configurations SET deleted_at=NEW.deleted_at
      WHERE deleted_at IS NULL AND product_sheet_id IN (
        SELECT id FROM catalog.product_technical_sheets WHERE product_id=NEW.id);
      UPDATE catalog.product_technical_sheets SET deleted_at=NEW.deleted_at
      WHERE deleted_at IS NULL AND product_id=NEW.id;
    ELSE
      UPDATE catalog.category_technical_sheets SET deleted_at=NEW.deleted_at
      WHERE deleted_at IS NULL AND category_id=NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER technical_owner_deletion AFTER UPDATE ON catalog.products
FOR EACH ROW EXECUTE FUNCTION catalog.soft_delete_owner_technical_links();
CREATE TRIGGER technical_owner_deletion AFTER UPDATE ON catalog.categories
FOR EACH ROW EXECUTE FUNCTION catalog.soft_delete_owner_technical_links();

CREATE FUNCTION catalog.soft_delete_technical_sheet(p_sheet uuid,p_expected_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
DECLARE current_version bigint; stamp timestamptz:=clock_timestamp(); child text;
BEGIN
  PERFORM catalog.lock_write();
  SELECT version INTO current_version FROM catalog.technical_sheets WHERE id=p_sheet AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Technical sheet not found' USING ERRCODE='P0002'; END IF;
  IF current_version<>p_expected_version THEN RAISE EXCEPTION 'Technical sheet edit conflict' USING ERRCODE='P0001'; END IF;
  -- Invalidate edit tokens of all affected owners before detaching shared information.
  UPDATE catalog.products SET sort_order=sort_order WHERE deleted_at IS NULL AND id IN (
    SELECT product_id FROM catalog.product_technical_sheets WHERE sheet_id=p_sheet AND deleted_at IS NULL);
  UPDATE catalog.categories SET sort_order=sort_order WHERE deleted_at IS NULL AND id IN (
    SELECT category_id FROM catalog.category_technical_sheets WHERE sheet_id=p_sheet AND deleted_at IS NULL);
  UPDATE catalog.technical_section_translations SET deleted_at=stamp WHERE deleted_at IS NULL AND section_id IN (
    SELECT id FROM catalog.technical_sections WHERE sheet_id=p_sheet);
  UPDATE catalog.technical_configuration_translations SET deleted_at=stamp WHERE deleted_at IS NULL AND configuration_id IN (
    SELECT id FROM catalog.technical_configurations WHERE sheet_id=p_sheet);
  UPDATE catalog.technical_condition_translations SET deleted_at=stamp WHERE deleted_at IS NULL AND condition_id IN (
    SELECT id FROM catalog.technical_conditions WHERE sheet_id=p_sheet);
  UPDATE catalog.technical_note_translations SET deleted_at=stamp WHERE deleted_at IS NULL AND note_id IN (
    SELECT id FROM catalog.technical_notes WHERE sheet_id=p_sheet);
  FOREACH child IN ARRAY ARRAY['technical_sheet_translations','technical_sheet_sources','technical_source_observations',
    'technical_sections','technical_configurations','technical_conditions','technical_measurements','technical_notes',
    'category_technical_sheets','product_technical_sheets','product_technical_configurations'] LOOP
    EXECUTE format('UPDATE catalog.%I SET deleted_at=$1 WHERE sheet_id=$2 AND deleted_at IS NULL',child) USING stamp,p_sheet;
  END LOOP;
  UPDATE catalog.technical_sheets SET deleted_at=stamp WHERE id=p_sheet;
  INSERT INTO ops.outbox_events(aggregate_type,aggregate_id,aggregate_version,event_type,payload)
  VALUES('TechnicalSheet',p_sheet,current_version+1,'TechnicalSheetSoftDeleted',jsonb_build_object('sheet_id',p_sheet));
  RETURN jsonb_build_object('sheet_id',p_sheet,'version',current_version+1);
END;
$$;

CREATE VIEW catalog.live_category_technical_sheets AS
SELECT l.* FROM catalog.category_technical_sheets l
JOIN catalog.live_categories c ON c.id=l.category_id
JOIN catalog.technical_sheets s ON s.id=l.sheet_id
WHERE l.deleted_at IS NULL AND s.deleted_at IS NULL;
CREATE VIEW catalog.live_product_technical_sheets AS
SELECT l.* FROM catalog.product_technical_sheets l
JOIN catalog.live_products p ON p.id=l.product_id
JOIN catalog.technical_sheets s ON s.id=l.sheet_id
WHERE l.deleted_at IS NULL AND s.deleted_at IS NULL;

CREATE OR REPLACE VIEW catalog.active_asset_usage AS
SELECT m.asset_id,'PRODUCT'::text AS owner_type,m.product_id AS owner_id FROM catalog.live_product_media m
UNION ALL SELECT cover_asset_id,'CATEGORY',id FROM catalog.live_categories WHERE cover_asset_id IS NOT NULL
UNION ALL SELECT cover_asset_id,'PAGE',id FROM catalog.pages WHERE deleted_at IS NULL AND cover_asset_id IS NOT NULL
UNION ALL SELECT logo_asset_id,'SITE_LOGO',NULL::uuid FROM catalog.site_settings WHERE deleted_at IS NULL AND logo_asset_id IS NOT NULL
UNION ALL SELECT x.asset_id,'TECHNICAL_SOURCE',x.sheet_id FROM catalog.technical_sheet_sources x
JOIN catalog.technical_sheets s ON s.id=x.sheet_id WHERE x.deleted_at IS NULL AND s.deleted_at IS NULL;

CREATE VIEW catalog.public_asset_usage AS
SELECT u.* FROM catalog.active_asset_usage u JOIN catalog.media_asset_refs a ON a.id=u.asset_id
WHERE u.owner_type<>'TECHNICAL_SOURCE' AND a.deleted_at IS NULL AND a.ready_at IS NOT NULL
UNION ALL
SELECT x.asset_id,'TECHNICAL_SOURCE',x.sheet_id FROM catalog.technical_sheet_sources x
JOIN catalog.technical_sheets s ON s.id=x.sheet_id JOIN catalog.media_asset_refs a ON a.id=x.asset_id
WHERE x.deleted_at IS NULL AND s.deleted_at IS NULL AND x.download_enabled
  AND a.deleted_at IS NULL AND a.ready_at IS NOT NULL AND a.media_kind='PDF'
  AND (EXISTS (SELECT 1 FROM catalog.live_category_technical_sheets l WHERE l.sheet_id=x.sheet_id)
    OR EXISTS (SELECT 1 FROM catalog.live_product_technical_sheets l WHERE l.sheet_id=x.sheet_id));

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog FROM PUBLIC;
