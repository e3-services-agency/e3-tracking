-- T-3-10 (D-57, migration number 0017 per the D-53 amendment 2026-09-28): project industry (used
-- as the templates page's default facet filter) and the two new requirement target-kind columns
-- (`catalog_attribute` -> `catalog_field_id`, `consent` -> `consent_category_id`), alongside the
-- existing `property_id`/`event_id`/`variant_id`. Plain nullable `ADD COLUMN`s, no table rebuild.
ALTER TABLE projects ADD COLUMN industry TEXT;

ALTER TABLE requirements ADD COLUMN catalog_field_id TEXT REFERENCES catalog_fields(id) ON DELETE SET NULL;
ALTER TABLE requirements ADD COLUMN consent_category_id TEXT REFERENCES consent_categories(id) ON DELETE SET NULL;
