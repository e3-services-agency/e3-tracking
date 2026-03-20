-- Canonical Property v1 model.
-- Dev-mode expectation: reset and re-run migrations so legacy columns are removed.

CREATE OR REPLACE FUNCTION try_parse_jsonb(input_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF input_text IS NULL OR btrim(input_text) = '' THEN
    RETURN NULL;
  END IF;

  RETURN input_text::jsonb;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS pii BOOLEAN,
  ADD COLUMN IF NOT EXISTS data_formats_json JSONB,
  ADD COLUMN IF NOT EXISTS value_schema_json JSONB;

ALTER TABLE properties
  ALTER COLUMN example_values_json TYPE JSONB USING try_parse_jsonb(example_values_json),
  ALTER COLUMN name_mappings_json TYPE JSONB USING try_parse_jsonb(name_mappings_json);

ALTER TABLE properties
  ALTER COLUMN data_type TYPE TEXT USING (
    CASE
      WHEN COALESCE(is_list, FALSE) = TRUE THEN 'array'
      WHEN data_type::text IN ('integer', 'float') THEN 'number'
      WHEN data_type::text = 'list' THEN 'array'
      ELSE data_type::text
    END
  );

UPDATE properties
SET pii = CASE
  WHEN pii_status = 'none' THEN FALSE
  ELSE TRUE
END
WHERE pii IS NULL;

UPDATE properties
SET data_formats_json = CASE
  WHEN data_format IS NULL OR btrim(data_format) = '' THEN NULL
  WHEN data_format IN (
    'uuid',
    'iso8601_datetime',
    'iso8601_date',
    'unix_seconds',
    'unix_milliseconds',
    'email',
    'uri',
    'currency_code',
    'country_code',
    'language_code'
  ) THEN jsonb_build_array(data_format)
  ELSE NULL
END
WHERE data_formats_json IS NULL;

UPDATE properties
SET value_schema_json = CASE
  WHEN value_schema_json IS NOT NULL THEN value_schema_json
  WHEN COALESCE(is_list, FALSE) = FALSE THEN NULL
  WHEN data_type::text = 'string' THEN jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
  WHEN data_type::text IN ('integer', 'float') THEN jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'number'))
  WHEN data_type::text = 'boolean' THEN jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'boolean'))
  WHEN data_type::text = 'object' THEN jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'object'))
  ELSE NULL
END
WHERE value_schema_json IS NULL;

UPDATE properties
SET example_values_json = jsonb_build_array(jsonb_build_object('value', example_values_json))
WHERE example_values_json IS NOT NULL
  AND jsonb_typeof(example_values_json) <> 'array';

ALTER TABLE properties
  ALTER COLUMN pii SET DEFAULT FALSE;

UPDATE properties
SET pii = FALSE
WHERE pii IS NULL;

ALTER TABLE properties
  ALTER COLUMN pii SET NOT NULL;

ALTER TABLE properties
  DROP COLUMN IF EXISTS pii_status,
  DROP COLUMN IF EXISTS data_format,
  DROP COLUMN IF EXISTS is_list;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_data_type_v1_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_data_type_v1_check
      CHECK (data_type::text IN ('string', 'number', 'boolean', 'timestamp', 'object', 'array'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_data_formats_json_array_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_data_formats_json_array_check
      CHECK (data_formats_json IS NULL OR jsonb_typeof(data_formats_json) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_value_schema_json_object_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_value_schema_json_object_check
      CHECK (value_schema_json IS NULL OR jsonb_typeof(value_schema_json) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_example_values_json_array_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_example_values_json_array_check
      CHECK (example_values_json IS NULL OR jsonb_typeof(example_values_json) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_name_mappings_json_array_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_name_mappings_json_array_check
      CHECK (name_mappings_json IS NULL OR jsonb_typeof(name_mappings_json) = 'array');
  END IF;
END $$;

DROP FUNCTION try_parse_jsonb(TEXT);
DROP TYPE IF EXISTS pii_status;
DROP TYPE IF EXISTS property_data_type;
