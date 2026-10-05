-- T-4-11B (D-61, D-62, D-53 amendment 10): catalogs per market and language, source system and
-- collection method, project default source. Plain ADD COLUMNs, no table rebuild; the allowed values
-- are enforced with CHECKs here and in the DAL (the lists live in `src/domain/enums.ts`).
--
-- catalogs.kind: product | variant | other. Backfilled from the Bloomreach mapping role first
-- (main -> product, variant -> variant), then from a free-text `catalog_type` that names the kind;
-- everything else stays `other`.
ALTER TABLE catalogs ADD COLUMN kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('product', 'variant', 'other'));
ALTER TABLE catalogs ADD COLUMN market TEXT;
ALTER TABLE catalogs ADD COLUMN language TEXT;
ALTER TABLE catalogs ADD COLUMN version TEXT NOT NULL DEFAULT 'v1' CHECK (version IN ('v1', 'v2'));
-- Set when the catalog is marked live; `searchable_snapshot_json` is the sorted list of searchable
-- field names at that moment (the v1 rule: the searchable set is fixed once the catalog is live).
ALTER TABLE catalogs ADD COLUMN live_at TEXT;
ALTER TABLE catalogs ADD COLUMN searchable_snapshot_json TEXT;

UPDATE catalogs SET kind = CASE
  WHEN mapping_role = 'main' THEN 'product'
  WHEN mapping_role = 'variant' THEN 'variant'
  WHEN lower(coalesce(catalog_type, '')) LIKE '%variant%' THEN 'variant'
  WHEN lower(coalesce(catalog_type, '')) LIKE '%product%' THEN 'product'
  ELSE 'other'
END;

ALTER TABLE sources ADD COLUMN system TEXT NOT NULL DEFAULT 'other' CHECK (system IN ('shopify', 'magento', 'salesforce_commerce_cloud', 'custom_backend', 'mobile_app', 'crm', 'erp', 'other'));
ALTER TABLE sources ADD COLUMN method TEXT CHECK (method IS NULL OR method IN ('web_sdk_gtm_datalayer', 'web_sdk_direct', 'tracking_api', 'bloomreach_integration', 'file_import'));

-- Applied to new events (D-62); SET NULL when the source is deleted.
ALTER TABLE projects ADD COLUMN default_source_id TEXT REFERENCES sources(id) ON DELETE SET NULL;
