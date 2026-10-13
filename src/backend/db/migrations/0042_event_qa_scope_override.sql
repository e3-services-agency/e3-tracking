-- T-5-31: per-event override of the derived `qa_scope` (tracking document `events[].qa_scope`).
-- NULL = automatic (derived from status, class and implementation method), 1 = in scope, 0 = out of scope.
-- Plain ADD COLUMN, no table rebuild.
ALTER TABLE events ADD COLUMN qa_scope_override INTEGER CHECK (qa_scope_override IS NULL OR qa_scope_override IN (0,1));
