-- T-2-06 (D-30, D-31, D-39 pre-assigns this task migration number 0011). Adds the rules layer:
-- a new `rules` table, `properties.item_schema_json` (D-30 ItemSchema, only meaningful when
-- `data_type = 'array'`), and `projects.money_tolerance_percent`/`money_tolerance_floor` (D-30
-- money tolerance, used by `tolerance_mode = 'money'` rules). All three additive: `ALTER TABLE
-- ... ADD COLUMN` needs no table rebuild in SQLite as long as the default is a constant, and
-- `rules` is a brand-new table, so this migration (unlike 0003/0009) never drops/recreates an
-- existing table.

-- ---------------------------------------------------------------------------
-- properties.item_schema_json (D-30): `[{field, data_type, data_formats[], required}]`.
-- ---------------------------------------------------------------------------
ALTER TABLE properties ADD COLUMN item_schema_json TEXT;

-- ---------------------------------------------------------------------------
-- projects money tolerance (D-30): percent with an absolute floor, applied to every
-- `tolerance_mode = 'money'` rule.
-- ---------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN money_tolerance_percent REAL NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN money_tolerance_floor REAL NOT NULL DEFAULT 0.01;

-- ---------------------------------------------------------------------------
-- Rule (new table, D-30, D-31): attaches to an event, optionally scoped to one of its variants.
-- `expression_json` is typed JSON (`src/domain/rules/types.ts`), validated against the operator
-- registry on write (`src/domain/rules/validate.ts`), never a string DSL.
-- ---------------------------------------------------------------------------
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- A rule scoped to a variant has no meaning once that variant is gone; CASCADE (unlike
  -- `findings.variant_id`, which is a historical audit trail and uses SET NULL).
  variant_id TEXT REFERENCES variants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  expression_json TEXT NOT NULL,
  tolerance_mode TEXT NOT NULL DEFAULT 'none',
  tolerance_value REAL,
  report_kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  template_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_rules_project_id ON rules(project_id);
CREATE INDEX idx_rules_event_id ON rules(event_id);

-- `UNIQUE(event_id, variant_id, name)`: SQLite's own UNIQUE index already treats every NULL as
-- distinct, so a *plain* `UNIQUE(event_id, variant_id, name)` would let two event-scoped rules
-- (`variant_id IS NULL`) share a name — the opposite of what's wanted. Two partial indexes instead
-- (same pattern as 0003/0004/0007's soft-delete partials): one enforces uniqueness among
-- event-scoped rules by treating `variant_id` as constant NULL, the other enforces it among
-- variant-scoped rules where `variant_id` really does distinguish rows.
CREATE UNIQUE INDEX uq_rules_event_name_unscoped ON rules(event_id, name) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX uq_rules_event_variant_name ON rules(event_id, variant_id, name) WHERE variant_id IS NOT NULL;
