-- Reviewed additive Admin product publication upgrade. Apply as owning migration role.
-- Existing products remain active; new Admin UI creations explicitly opt into inactive state.
ALTER TABLE catalog.products ADD COLUMN is_active boolean NOT NULL DEFAULT true;
-- Inactive products remain retained and readable to staff. Public APIs enforce publication separately.
CREATE OR REPLACE VIEW catalog.live_products AS
SELECT p.* FROM catalog.products p JOIN catalog.live_categories c ON c.id=p.category_id WHERE p.deleted_at IS NULL;

-- Publication is distinct from retention: inactive owners still prevent asset retirement,
-- but cannot authorize public product media or a sheet whose only owners are inactive products.
CREATE OR REPLACE VIEW catalog.public_asset_usage AS
SELECT u.* FROM catalog.active_asset_usage u JOIN catalog.media_asset_refs a ON a.id=u.asset_id
WHERE u.owner_type<>'TECHNICAL_SOURCE' AND a.deleted_at IS NULL AND a.ready_at IS NOT NULL
  AND (u.owner_type<>'PRODUCT' OR EXISTS
    (SELECT 1 FROM catalog.live_products p WHERE p.id=u.owner_id AND p.is_active))
UNION ALL
SELECT x.asset_id,'TECHNICAL_SOURCE',x.sheet_id FROM catalog.technical_sheet_sources x
JOIN catalog.technical_sheets s ON s.id=x.sheet_id JOIN catalog.media_asset_refs a ON a.id=x.asset_id
WHERE x.deleted_at IS NULL AND s.deleted_at IS NULL AND x.download_enabled
  AND a.deleted_at IS NULL AND a.ready_at IS NOT NULL AND a.media_kind='PDF'
  AND (EXISTS (SELECT 1 FROM catalog.live_category_technical_sheets l WHERE l.sheet_id=x.sheet_id)
    OR EXISTS (SELECT 1 FROM catalog.live_product_technical_sheets l
      JOIN catalog.live_products p ON p.id=l.product_id WHERE l.sheet_id=x.sheet_id AND p.is_active));
