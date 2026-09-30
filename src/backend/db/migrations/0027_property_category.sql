-- T-4-20 (D-64, D-53 amendment 8): optional property category override.
--
-- properties.category_override: NULL = derive the category at read time (classifyProperty in
-- src/domain/propertyCategory.ts: system_customer | customer | sdk_default | event); a value is a
-- manual override and wins. No backfill. The column is NOT named `category`: `properties.category`
-- has existed since 0001 and holds the Bloomreach Data Manager group name (round-tripped by the
-- Data Manager customers import/export), a different thing. Plain ADD COLUMN, no table rebuild.
ALTER TABLE properties ADD COLUMN category_override TEXT
  CHECK (category_override IS NULL OR category_override IN ('system_customer', 'customer', 'sdk_default', 'event'));
