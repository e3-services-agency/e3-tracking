-- 0036_enum_examples_cleanup (T-5-11, D-53 pattern, data-only).
-- Examples of an enum come from its allowed values (src/domain/examples.ts#exampleValuesFor). For
-- every property / property definition with a non-empty allowed_values_json, drop the entries of
-- example_values_json that are not an allowed value, keeping order. Both stored shapes are
-- handled: plain string elements (["silver"]) and {value} objects, on both the example and the
-- allowed side; comparison is on the TEXT of the value. json_each's `type` column is used, never
-- json_type(value) on an element (a bare string element is not valid JSON text). An emptied list
-- is stored as '[]'. Rows with no allowed values, no examples, or a non-array/malformed column
-- are untouched; a second run is a no-op.
-- Edited in place after a failed first version (malformed JSON on string elements); that version
-- never applied anywhere persistent.

UPDATE properties
SET example_values_json = COALESCE((
  SELECT json_group_array(CASE WHEN e.type = 'object' THEN json(e.value) ELSE e.value END)
  FROM (SELECT key, value, type FROM json_each(properties.example_values_json) ORDER BY key) e
  WHERE CASE WHEN e.type = 'object' THEN CAST(json_extract(e.value, '$.value') AS TEXT)
             WHEN e.type IN ('text', 'integer', 'real') THEN CAST(e.value AS TEXT) END
    IN (SELECT CASE WHEN a.type = 'object' THEN CAST(json_extract(a.value, '$.value') AS TEXT)
                    WHEN a.type IN ('text', 'integer', 'real') THEN CAST(a.value AS TEXT) END
        FROM json_each(properties.allowed_values_json) a)
), '[]')
WHERE json_valid(example_values_json) AND json_type(example_values_json) = 'array'
  AND json_array_length(example_values_json) > 0
  AND json_valid(allowed_values_json) AND json_type(allowed_values_json) = 'array'
  AND json_array_length(allowed_values_json) > 0;

UPDATE property_definitions
SET example_values_json = COALESCE((
  SELECT json_group_array(CASE WHEN e.type = 'object' THEN json(e.value) ELSE e.value END)
  FROM (SELECT key, value, type FROM json_each(property_definitions.example_values_json) ORDER BY key) e
  WHERE CASE WHEN e.type = 'object' THEN CAST(json_extract(e.value, '$.value') AS TEXT)
             WHEN e.type IN ('text', 'integer', 'real') THEN CAST(e.value AS TEXT) END
    IN (SELECT CASE WHEN a.type = 'object' THEN CAST(json_extract(a.value, '$.value') AS TEXT)
                    WHEN a.type IN ('text', 'integer', 'real') THEN CAST(a.value AS TEXT) END
        FROM json_each(property_definitions.allowed_values_json) a)
), '[]')
WHERE json_valid(example_values_json) AND json_type(example_values_json) = 'array'
  AND json_array_length(example_values_json) > 0
  AND json_valid(allowed_values_json) AND json_type(allowed_values_json) = 'array'
  AND json_array_length(allowed_values_json) > 0;
