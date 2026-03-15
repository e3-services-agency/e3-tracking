-- Catalog Type classification: Product, Variant, General.
ALTER TABLE catalogs
  ADD COLUMN IF NOT EXISTS catalog_type TEXT NOT NULL DEFAULT 'General'
  CHECK (catalog_type IN ('Product', 'Variant', 'General'));
