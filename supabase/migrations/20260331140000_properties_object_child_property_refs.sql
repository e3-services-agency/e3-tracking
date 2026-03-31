-- Maps object schema field keys to workspace property UUIDs for nested docs/codegen (registry stays flat).
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS object_child_property_refs_json JSONB DEFAULT NULL;

COMMENT ON COLUMN properties.object_child_property_refs_json IS
  'For data_type object: maps value_schema_json field keys to existing property ids (same workspace).';
