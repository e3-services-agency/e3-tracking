-- T-2-09: manual finding resolution (`PATCH /api/projects/:projectId/findings/:id`, D-21's
-- lifecycle stays "no manual mute" -- this is a manual *resolve*, not a status the recompute
-- engine can produce on its own). `resolved_by` is `NULL` for every finding `upsertFinding`/
-- `resolveStaleFindings` resolves automatically, and `'user'` for one a person resolved by hand
-- through the Findings page. `finding.dal.ts`'s `upsertFinding` checks this column: a fingerprint
-- that still reproduces on a manually-resolved finding does NOT reopen it (stays `resolved`,
-- `resolved_by = 'user'`); only an explicit `PATCH {status: 'open'}` (which clears `resolved_by`)
-- lets the next recompute reopen it again.
ALTER TABLE findings ADD COLUMN resolved_by TEXT;
