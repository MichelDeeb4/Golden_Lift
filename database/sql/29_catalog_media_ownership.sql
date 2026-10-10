\set ON_ERROR_STOP on
-- Enforce only after verified owner-copy switching; expansion does not silently remap data.
CREATE FUNCTION catalog.assert_exclusive_media_owners() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$ BEGIN
  IF EXISTS(WITH owners AS(
    SELECT DISTINCT asset_id,'PRODUCT' kind,product_id owner FROM catalog.product_media WHERE deleted_at IS NULL
    UNION SELECT cover_asset_id,'CATEGORY',id FROM catalog.categories WHERE deleted_at IS NULL AND cover_asset_id IS NOT NULL
    UNION SELECT asset_id,owner_type,owner_id FROM catalog.active_asset_usage WHERE owner_type NOT IN ('PRODUCT','CATEGORY'))
    SELECT 1 FROM owners GROUP BY asset_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Media must have one exclusive owner; run reviewed owner-copy migration first' USING ERRCODE='23514';
  END IF;
END; $$;
SELECT catalog.assert_exclusive_media_owners();
CREATE FUNCTION catalog.validate_exclusive_media_owners() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$ BEGIN
  PERFORM catalog.assert_exclusive_media_owners();RETURN NULL;
END; $$;
CREATE FUNCTION catalog.prevent_pending_media_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
DECLARE asset uuid; BEGIN
  IF TG_TABLE_NAME='product_media' THEN asset:=NEW.asset_id;
  ELSIF TG_TABLE_NAME='site_settings' THEN asset:=NEW.logo_asset_id;
  ELSIF TG_TABLE_NAME='technical_sheet_sources' THEN asset:=NEW.asset_id;
  ELSE asset:=NEW.cover_asset_id; END IF;
  IF asset IS NOT NULL AND EXISTS(SELECT 1 FROM catalog.media_asset_refs WHERE id=asset AND deletion_pending) THEN RAISE EXCEPTION 'Pending Media cannot be assigned' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['product_media','categories','pages','site_settings','technical_sheet_sources'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER exclusive_media_owner AFTER INSERT OR UPDATE OR DELETE ON catalog.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_exclusive_media_owners()',name);
    EXECUTE format('CREATE TRIGGER pending_media_assignment BEFORE INSERT OR UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.prevent_pending_media_assignment()',name);
  END LOOP;
END; $$;
