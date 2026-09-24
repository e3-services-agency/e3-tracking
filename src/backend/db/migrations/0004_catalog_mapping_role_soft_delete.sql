-- Fix round 2 on T-1-02 (reviewer WARNING, ca49334): uq_catalogs_project_mapping_role (0001_core.sql)
-- was partial on `mapping_role IS NOT NULL` only, not `deleted_at IS NULL`, while catalog.dal.ts
-- soft-deletes catalogs. Soft-deleting the "main" catalog and creating a new one with
-- mapping_role='main' therefore still hit the old index and surfaced as a 409 with no visible
-- catalog holding the role. This is a plain index (not an inline table constraint), so unlike
-- 0003_unique_soft_delete.sql no table rebuild is needed: drop and recreate the index.
DROP INDEX uq_catalogs_project_mapping_role;

CREATE UNIQUE INDEX uq_catalogs_project_mapping_role
  ON catalogs(project_id, mapping_role)
  WHERE mapping_role IS NOT NULL AND deleted_at IS NULL;
