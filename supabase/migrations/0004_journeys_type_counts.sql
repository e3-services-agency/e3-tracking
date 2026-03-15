-- Add type_counts JSONB to journeys for implementation scope summary (new / enrichment / fix).
ALTER TABLE journeys
ADD COLUMN IF NOT EXISTS type_counts JSONB DEFAULT NULL;

COMMENT ON COLUMN journeys.type_counts IS 'Counts of step implementation types: { "new": n, "enrichment": n, "fix": n }';
