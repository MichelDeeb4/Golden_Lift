-- B5 additive Catalog upgrade. Apply after the existing Catalog integrity migrations.
ALTER TABLE catalog.media_asset_refs ADD COLUMN security_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE catalog.media_asset_refs DROP CONSTRAINT media_asset_refs_check1;
ALTER TABLE catalog.media_asset_refs ADD CONSTRAINT media_asset_refs_readiness_check
  CHECK (deleted_at IS NOT NULL OR ready_at IS NOT NULL OR security_blocked);
CREATE FUNCTION catalog.protect_new_media_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset uuid; previous uuid;
BEGIN
  asset := (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
  IF TG_OP='UPDATE' THEN previous := (to_jsonb(OLD)->>TG_ARGV[0])::uuid; END IF;
  IF asset IS NOT NULL AND (TG_OP='INSERT' OR asset IS DISTINCT FROM previous) AND
    NOT EXISTS(SELECT 1 FROM catalog.media_asset_refs WHERE id=asset AND deleted_at IS NULL
      AND ready_at IS NOT NULL AND NOT security_blocked) THEN
    RAISE EXCEPTION 'Media is unavailable for attachment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER media_attachment BEFORE INSERT OR UPDATE ON catalog.categories FOR EACH ROW EXECUTE FUNCTION catalog.protect_new_media_attachment('cover_asset_id');
CREATE TRIGGER media_attachment BEFORE INSERT OR UPDATE ON catalog.product_media FOR EACH ROW EXECUTE FUNCTION catalog.protect_new_media_attachment('asset_id');
CREATE TRIGGER media_attachment BEFORE INSERT OR UPDATE ON catalog.pages FOR EACH ROW EXECUTE FUNCTION catalog.protect_new_media_attachment('cover_asset_id');
CREATE TRIGGER media_attachment BEFORE INSERT OR UPDATE ON catalog.site_settings FOR EACH ROW EXECUTE FUNCTION catalog.protect_new_media_attachment('logo_asset_id');
CREATE TRIGGER media_attachment BEFORE INSERT OR UPDATE ON catalog.technical_sheet_sources FOR EACH ROW EXECUTE FUNCTION catalog.protect_new_media_attachment('asset_id');
REVOKE ALL ON FUNCTION catalog.protect_new_media_attachment() FROM PUBLIC;
