-- T-4-09 (D-60, migration number 0023 per the D-53 numbering, no earlier task claimed it): adds a
-- generic `settings_json` column on `projects` for small per-project flags that don't warrant their
-- own column. The only key today is `is_sandbox` (bool), set on projects restored from the bundled
-- sandbox backup (`sandbox.service.ts`); `project.dal.ts#isSandboxProject` already reads this column
-- defensively (parses it if present, treats a missing/invalid value as "not a sandbox"), so this
-- migration is the only change needed to make that check live. Plain nullable `ADD COLUMN`, no table
-- rebuild.
ALTER TABLE projects ADD COLUMN settings_json TEXT;
