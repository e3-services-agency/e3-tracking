-- 0036_enum_examples_cleanup (T-5-11, D-53 pattern, data-only).
-- Examples of an enum come from its allowed values (src/domain/examples.ts#exampleValuesFor). For
-- every property / property definition with a non-empty allowed_values_json, drop the entries of
-- example_values_json that are not an allowed value, keeping order. An emptied list is stored as
-- '[]' (the column convention). Rows with no allowed values or no examples are untouched, and a
-- second run is a no-op. Only well-formed `{value}` entries are considered.

UPDATE properties
SET example_values_json = COALESCE((
  SELECT json_group_array(json(e.value))
  FROM (SELECT value, key FROM json_each(properties.example_values_json) ORDER BY key) e
  WHERE json_type(e.value) = 'object'
    AND json_extract(e.value, '$.value') IN (
      SELECT json_extract(a.value, '$.value') FROM json_each(properties.allowed_values_json) a)
), '[]')
WHERE example_values_json IS NOT NULL AND json_valid(example_values_json) AND json_type(example_values_json) = 'array'
  AND json_array_length(example_values_json) > 0
  AND allowed_values_json IS NOT NULL AND json_valid(allowed_values_json) AND json_type(allowed_values_json) = 'array'
  AND json_array_length(allowed_values_json) > 0
  AND NOT EXISTS (SELECT 1 FROM json_each(properties.example_values_json) WHERE json_type(value) <> 'object');

UPDATE property_definitions
SET example_values_json = COALESCE((
  SELECT json_group_array(json(e.value))
  FROM (SELECT value, key FROM json_each(property_definitions.example_values_json) ORDER BY key) e
  WHERE json_type(e.value) = 'object'
    AND json_extract(e.value, '$.value') IN (
      SELECT json_extract(a.value, '$.value') FROM json_each(property_definitions.allowed_values_json) a)
), '[]')
WHERE example_values_json IS NOT NULL AND json_valid(example_values_json) AND json_type(example_values_json) = 'array'
  AND json_array_length(example_values_json) > 0
  AND allowed_values_json IS NOT NULL AND json_valid(allowed_values_json) AND json_type(allowed_values_json) = 'array'
  AND json_array_length(allowed_values_json) > 0
  AND NOT EXISTS (SELECT 1 FROM json_each(property_definitions.example_values_json) WHERE json_type(value) <> 'object');
