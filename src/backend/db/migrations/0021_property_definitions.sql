-- T-4-00 (D-58, migration number 0021 per the D-53 amendment 2 2026-09-28): property definitions.
-- A property keeps its shared identity (name, payload key stays on the link, data_type, pii,
-- source); a new table `property_definitions` holds one or more *named* meanings per property
-- (name, description, allowed_values_json, format, example_values_json). `event_properties` gets
-- a nullable `definition_id` (the default definition when null) and loses its two per-link
-- override columns (`description_override`, `example_values_override_json`), which this migration
-- backfills into definitions first.
--
-- Backfill: every property gets one "general" definition seeded from its own
-- description/allowed_values_json/data_formats_json[0]/example_values_json. Every distinct
-- (description_override, example_values_override_json) combination still in use on that
-- property's links becomes a second (or further) definition, named after the first event that
-- link was attached to (by `event_properties.created_at`, then event name as a tiebreak) --
-- `description` from the override, `example_values_json` from the override when set else the
-- property's own, `allowed_values_json`/`format` carried from the property (overrides never
-- covered those). Links without an override point at the property's "general" definition; links
-- with one point at their group's definition.
--
-- Ids are generated in SQL (`lower(hex(randomblob(16)))`, 32 hex chars) since a migration file is
-- plain SQL with no access to the app's `newId()` -- `id` is never assumed to be a v4 UUID
-- elsewhere in the codebase, just a unique TEXT primary key.
--
-- Table-rebuild pattern for `event_properties` (see `0009_event_class.sql`'s header comment) and
-- for `change_log` (its `entity_type` CHECK needs `property_definition` added; SQLite cannot
-- ALTER a CHECK constraint in place). `db/index.ts` disables `foreign_keys` for the whole
-- migration run, so neither rebuild needs to touch the pragma itself.

-- ---------------------------------------------------------------------------
-- property_definitions
-- ---------------------------------------------------------------------------
CREATE TABLE property_definitions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  allowed_values_json TEXT,
  format TEXT,
  example_values_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_property_definitions_property_id ON property_definitions(property_id);
CREATE UNIQUE INDEX uq_property_definitions_property_name
  ON property_definitions(property_id, name) WHERE deleted_at IS NULL;

-- ---- Backfill: one "general" definition per property ----
CREATE TEMP TABLE tmp_general_defs AS
SELECT id AS property_id, project_id, lower(hex(randomblob(16))) AS definition_id
FROM properties;

INSERT INTO property_definitions (
  id, project_id, property_id, name, description, allowed_values_json, format,
  example_values_json, sort_order, created_at, updated_at, deleted_at
)
SELECT
  g.definition_id, p.project_id, p.id, 'general', p.description, p.allowed_values_json,
  json_extract(p.data_formats_json, '$[0]'), p.example_values_json, 0, p.created_at, p.updated_at, NULL
FROM properties p
JOIN tmp_general_defs g ON g.property_id = p.id;

-- ---- Backfill: one definition per distinct (description_override, example_values_override_json)
-- combination still referenced by a link ----
CREATE TEMP TABLE tmp_override_groups AS
SELECT property_id, description_override, example_values_override_json,
       lower(hex(randomblob(16))) AS definition_id
FROM event_properties
WHERE description_override IS NOT NULL OR example_values_override_json IS NOT NULL
GROUP BY property_id, description_override, example_values_override_json;

CREATE TEMP TABLE tmp_group_first_event AS
SELECT g.property_id, g.description_override, g.example_values_override_json, g.definition_id,
  (
    SELECT e.name FROM event_properties ep
    JOIN events e ON e.id = ep.event_id
    WHERE ep.property_id = g.property_id
      AND ep.description_override IS g.description_override
      AND ep.example_values_override_json IS g.example_values_override_json
    ORDER BY ep.created_at, e.name
    LIMIT 1
  ) AS first_event_name
FROM tmp_override_groups g;

INSERT INTO property_definitions (
  id, project_id, property_id, name, description, allowed_values_json, format,
  example_values_json, sort_order, created_at, updated_at, deleted_at
)
SELECT
  gfe.definition_id,
  p.project_id,
  gfe.property_id,
  COALESCE(gfe.first_event_name, 'general (' || substr(gfe.definition_id, 1, 8) || ')'),
  gfe.description_override,
  p.allowed_values_json,
  json_extract(p.data_formats_json, '$[0]'),
  COALESCE(gfe.example_values_override_json, p.example_values_json),
  1,
  p.updated_at,
  p.updated_at,
  NULL
FROM tmp_group_first_event gfe
JOIN properties p ON p.id = gfe.property_id;

-- ---------------------------------------------------------------------------
-- event_properties: definition_id replaces description_override/example_values_override_json
-- ---------------------------------------------------------------------------
CREATE TABLE event_properties_new (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  required INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'normal',
  priority TEXT,
  status TEXT,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  payload_key TEXT,
  definition_id TEXT REFERENCES property_definitions(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  bloomreach_meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, property_id)
);

INSERT INTO event_properties_new (
  event_id, property_id, required, role, priority, status, source_id, payload_key,
  definition_id, sort_order, bloomreach_meta_json, created_at, updated_at
)
SELECT
  ep.event_id, ep.property_id, ep.required, ep.role, ep.priority, ep.status, ep.source_id,
  ep.payload_key,
  COALESCE(
    (
      SELECT g.definition_id FROM tmp_override_groups g
      WHERE g.property_id = ep.property_id
        AND g.description_override IS ep.description_override
        AND g.example_values_override_json IS ep.example_values_override_json
    ),
    (SELECT gd.definition_id FROM tmp_general_defs gd WHERE gd.property_id = ep.property_id)
  ),
  ep.sort_order, ep.bloomreach_meta_json, ep.created_at, ep.updated_at
FROM event_properties ep;

DROP TABLE event_properties;
ALTER TABLE event_properties_new RENAME TO event_properties;

CREATE INDEX idx_event_properties_property_id ON event_properties(property_id);
CREATE INDEX idx_event_properties_definition_id ON event_properties(definition_id);

DROP TABLE tmp_general_defs;
DROP TABLE tmp_group_first_event;
DROP TABLE tmp_override_groups;

-- ---------------------------------------------------------------------------
-- change_log: add 'property_definition' to the entity_type CHECK (table rebuild, see header)
-- ---------------------------------------------------------------------------
CREATE TABLE change_log_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'project', 'source', 'property', 'event', 'event_property', 'variant',
    'standard_event_mapping', 'identity_rule', 'consent_category', 'catalog', 'catalog_field',
    'use_case', 'requirement', 'rule', 'property_bundle', 'property_definition'
  )),
  entity_id TEXT NOT NULL,
  entity_label TEXT,
  parent_entity_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  actor TEXT NOT NULL,
  source TEXT NOT NULL,
  batch_id TEXT,
  changed_at TEXT NOT NULL,
  diff_json TEXT
);

INSERT INTO change_log_new SELECT * FROM change_log;

DROP TABLE change_log;
ALTER TABLE change_log_new RENAME TO change_log;

CREATE INDEX idx_change_log_entity ON change_log (project_id, entity_type, entity_id, changed_at DESC);
CREATE INDEX idx_change_log_parent ON change_log (project_id, parent_entity_id, changed_at DESC);
CREATE INDEX idx_change_log_project ON change_log (project_id, changed_at DESC);
