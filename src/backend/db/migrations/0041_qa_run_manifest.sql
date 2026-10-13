-- T-5-30: QA sample archive import. `source` names where a run came from ('extension' for an
-- archive from the QA sampler), `manifest_json` keeps the archive's manifest.json verbatim, and
-- `samples_json` is reserved for T-5-31. Plain ADD COLUMNs, no table rebuild.
ALTER TABLE qa_runs ADD COLUMN source TEXT CHECK (source IS NULL OR source IN ('manual','export_paste','extension','mcp'));
ALTER TABLE qa_runs ADD COLUMN manifest_json TEXT;
ALTER TABLE qa_runs ADD COLUMN samples_json TEXT;
