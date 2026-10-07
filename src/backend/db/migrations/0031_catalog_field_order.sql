-- T-4-33: catalog fields get a user-controlled order (the table editor's drag and drop).
-- Backfilled to the old display order (by name). Plain ADD COLUMN, no table rebuild.
ALTER TABLE catalog_fields ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE catalog_fields SET sort_order = (
  SELECT COUNT(*) FROM catalog_fields o
  WHERE o.catalog_id = catalog_fields.catalog_id AND o.name < catalog_fields.name
);
