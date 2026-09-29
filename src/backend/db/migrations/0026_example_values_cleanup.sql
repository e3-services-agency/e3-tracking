-- 0026_example_values_cleanup (T-4-19, D-53 amendment 7).
-- The Data Manager import stored Bloomreach's quoted/bracketed example text verbatim
-- (`"2023"]`, `"yes"`), which the views then printed as escaped JSON. This unwraps a single quoted
-- token (optionally with a leading `[` and/or trailing `]`) in every stored example value of
-- `properties` and `property_definitions`. Values that are not a single quoted token are untouched.
-- Same rule as `parseBloomreachExample` in src/domain/examples.ts.

UPDATE properties
SET example_values_json = (
  SELECT json_group_array(json_object('value',
    CASE
      WHEN v LIKE '"%"' AND length(v) >= 2 AND instr(substr(v, 2, length(v) - 2), '"') = 0 THEN substr(v, 2, length(v) - 2)
      WHEN v LIKE '"%"]' AND length(v) >= 3 AND instr(substr(v, 2, length(v) - 3), '"') = 0 THEN substr(v, 2, length(v) - 3)
      WHEN v LIKE '["%"]' AND length(v) >= 4 AND instr(substr(v, 3, length(v) - 4), '"') = 0 THEN substr(v, 3, length(v) - 4)
      ELSE v
    END))
  FROM (SELECT json_extract(value, '$.value') AS v FROM json_each(properties.example_values_json))
)
WHERE example_values_json IS NOT NULL
  AND json_valid(example_values_json)
  AND json_type(example_values_json) = 'array'
  AND json_array_length(example_values_json) > 0
  AND NOT EXISTS (SELECT 1 FROM json_each(properties.example_values_json) WHERE json_type(value) <> 'object' OR json_type(value, '$.value') <> 'text')
  AND (example_values_json LIKE '%\"%' OR example_values_json LIKE '%"value":"[%');

UPDATE property_definitions
SET example_values_json = (
  SELECT json_group_array(json_object('value',
    CASE
      WHEN v LIKE '"%"' AND length(v) >= 2 AND instr(substr(v, 2, length(v) - 2), '"') = 0 THEN substr(v, 2, length(v) - 2)
      WHEN v LIKE '"%"]' AND length(v) >= 3 AND instr(substr(v, 2, length(v) - 3), '"') = 0 THEN substr(v, 2, length(v) - 3)
      WHEN v LIKE '["%"]' AND length(v) >= 4 AND instr(substr(v, 3, length(v) - 4), '"') = 0 THEN substr(v, 3, length(v) - 4)
      ELSE v
    END))
  FROM (SELECT json_extract(value, '$.value') AS v FROM json_each(property_definitions.example_values_json))
)
WHERE example_values_json IS NOT NULL
  AND json_valid(example_values_json)
  AND json_type(example_values_json) = 'array'
  AND json_array_length(example_values_json) > 0
  AND NOT EXISTS (SELECT 1 FROM json_each(property_definitions.example_values_json) WHERE json_type(value) <> 'object' OR json_type(value, '$.value') <> 'text')
  AND (example_values_json LIKE '%\"%' OR example_values_json LIKE '%"value":"[%');
