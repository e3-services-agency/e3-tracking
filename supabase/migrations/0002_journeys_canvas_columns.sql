-- Journeys: Document-Relational Hybrid — canvas state as JSONB, relational journey_events for triggers.
-- Add canvas_nodes_json, canvas_edges_json, testing_instructions_markdown.

ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS canvas_nodes_json JSONB,
  ADD COLUMN IF NOT EXISTS canvas_edges_json JSONB,
  ADD COLUMN IF NOT EXISTS testing_instructions_markdown TEXT;

COMMENT ON COLUMN journeys.canvas_nodes_json IS 'React Flow nodes array (JSON). Persisted on Save Layout.';
COMMENT ON COLUMN journeys.canvas_edges_json IS 'React Flow edges array (JSON). Persisted on Save Layout.';
COMMENT ON COLUMN journeys.testing_instructions_markdown IS 'Global testing instructions for AI/human testers.';
