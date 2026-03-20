-- Catalog v1 field refinement: canonical field metadata without ingestion-engine complexity.

ALTER TABLE catalog_fields
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS data_type TEXT,
  ADD COLUMN IF NOT EXISTS field_family TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS item_level TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS source_mapping_json JSONB;

UPDATE catalog_fields
SET data_type = type
WHERE data_type IS NULL;

UPDATE catalog_fields cf
SET item_level = CASE
  WHEN c.catalog_type = 'Product' THEN 'parent'
  WHEN c.catalog_type = 'Variant' THEN 'variant'
  ELSE 'general'
END
FROM catalogs c
WHERE c.id = cf.catalog_id
  AND (cf.item_level IS NULL OR cf.item_level = '');

UPDATE catalog_fields
SET field_family = 'custom'
WHERE field_family IS NULL OR field_family = '';

ALTER TABLE catalog_fields
  ALTER COLUMN data_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'catalog_fields_data_type_check'
  ) THEN
    ALTER TABLE catalog_fields
      ADD CONSTRAINT catalog_fields_data_type_check
      CHECK (data_type IN ('string', 'number', 'boolean'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'catalog_fields_field_family_check'
  ) THEN
    ALTER TABLE catalog_fields
      ADD CONSTRAINT catalog_fields_field_family_check
      CHECK (field_family IN ('system', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'catalog_fields_item_level_check'
  ) THEN
    ALTER TABLE catalog_fields
      ADD CONSTRAINT catalog_fields_item_level_check
      CHECK (item_level IN ('parent', 'variant', 'general'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'catalog_fields_source_mapping_json_object_check'
  ) THEN
    ALTER TABLE catalog_fields
      ADD CONSTRAINT catalog_fields_source_mapping_json_object_check
      CHECK (
        source_mapping_json IS NULL
        OR jsonb_typeof(source_mapping_json) = 'object'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'catalog_fields_source_mapping_type_check'
  ) THEN
    ALTER TABLE catalog_fields
      ADD CONSTRAINT catalog_fields_source_mapping_type_check
      CHECK (
        source_mapping_json IS NULL
        OR (
          source_mapping_json ? 'mapping_type'
          AND source_mapping_json ? 'source_value'
          AND source_mapping_json->>'mapping_type' IN ('json_field', 'json_path', 'alias')
          AND jsonb_typeof(source_mapping_json->'source_value') = 'string'
        )
      );
  END IF;
END $$;
