-- T-4-28 (D-67, D-68, D-53 amendment 11): which identity-rule identifiers an event sends in
-- `customer_ids`, and a palette colour per source. App-only columns: Bloomreach exports are unchanged.
--
-- events.identifiers_json: JSON array of identity-rule identifier names; NULL = derived default
-- (never stored, computed by src/domain/identity/identifiers.ts).
ALTER TABLE events ADD COLUMN identifiers_json TEXT;

-- sources.color has existed since 0001 as free text (and was never used). It now holds one of the
-- eight palette tokens (`SOURCE_COLORS` in src/domain/enums.ts; `--source-1`..`--source-8` in index.css).
-- A table rebuild is avoided: the CHECK is enforced by the two triggers below instead.
-- Backfill: keep a valid token, else the stable system -> token map.
UPDATE sources SET color = CASE
  WHEN color IN ('source-1','source-2','source-3','source-4','source-5','source-6','source-7','source-8') THEN color
  WHEN system = 'shopify' THEN 'source-1'
  WHEN system = 'magento' THEN 'source-2'
  WHEN system = 'salesforce_commerce_cloud' THEN 'source-3'
  WHEN system = 'custom_backend' THEN 'source-4'
  WHEN system = 'mobile_app' THEN 'source-5'
  WHEN system = 'crm' THEN 'source-6'
  WHEN system = 'erp' THEN 'source-7'
  ELSE 'source-8'
END;

CREATE TRIGGER sources_color_insert_check BEFORE INSERT ON sources
WHEN NEW.color IS NOT NULL AND NEW.color NOT IN ('source-1','source-2','source-3','source-4','source-5','source-6','source-7','source-8')
BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: sources.color'); END;

CREATE TRIGGER sources_color_update_check BEFORE UPDATE OF color ON sources
WHEN NEW.color IS NOT NULL AND NEW.color NOT IN ('source-1','source-2','source-3','source-4','source-5','source-6','source-7','source-8')
BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: sources.color'); END;
