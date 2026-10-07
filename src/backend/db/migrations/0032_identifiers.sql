-- T-4-35 (D-69): the project-level identifiers registry (Bloomreach "hard ids" / "soft ids" /
-- cookie). Identity rules become identification acts that reference one identifier.
CREATE TABLE identifiers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hard', 'soft')),
  description TEXT,
  is_cookie INTEGER NOT NULL DEFAULT 0 CHECK (is_cookie IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, name)
);
CREATE INDEX idx_identifiers_project_id ON identifiers(project_id);

ALTER TABLE identity_rules ADD COLUMN identifier_id TEXT REFERENCES identifiers(id) ON DELETE SET NULL;
CREATE INDEX idx_identity_rules_identifier_id ON identity_rules(identifier_id);

-- Backfill: one identifier per distinct (project, lower(name)); the first rule names it, hard wins
-- on a type conflict, the identifier called 'cookie' is flagged.
INSERT INTO identifiers (id, project_id, name, type, description, is_cookie, sort_order, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  g.project_id,
  (SELECT r.identifier_name FROM identity_rules r
    WHERE r.project_id = g.project_id AND lower(r.identifier_name) = g.lname
    ORDER BY r.sort_order, r.created_at LIMIT 1),
  g.type,
  NULL,
  CASE WHEN g.lname = 'cookie' THEN 1 ELSE 0 END,
  g.first_order,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT project_id, lower(identifier_name) AS lname,
         CASE WHEN SUM(identity_type = 'hard') > 0 THEN 'hard' ELSE 'soft' END AS type,
         MIN(sort_order) AS first_order
  FROM identity_rules
  GROUP BY project_id, lower(identifier_name)
) g;

UPDATE identity_rules SET identifier_id = (
  SELECT i.id FROM identifiers i
  WHERE i.project_id = identity_rules.project_id AND lower(i.name) = lower(identity_rules.identifier_name)
);
-- identity_type stays populated for old readers, now derived from the identifier.
UPDATE identity_rules SET
  identifier_name = (SELECT i.name FROM identifiers i WHERE i.id = identity_rules.identifier_id),
  identity_type = (SELECT i.type FROM identifiers i WHERE i.id = identity_rules.identifier_id)
WHERE identifier_id IS NOT NULL;

-- change_log: add 'identifier' to the entity_type CHECK (table rebuild, as in 0021)
CREATE TABLE change_log_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'project', 'source', 'property', 'event', 'event_property', 'variant',
    'standard_event_mapping', 'identity_rule', 'consent_category', 'catalog', 'catalog_field',
    'use_case', 'requirement', 'rule', 'property_bundle', 'property_definition', 'identifier'
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
