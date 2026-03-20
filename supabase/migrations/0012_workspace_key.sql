-- Reset-ready workspace URL key support for /w/<workspace_key>/... routing.

CREATE OR REPLACE FUNCTION public.generate_workspace_key(input_uuid UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(replace(input_uuid::text, '-', ''));
$$;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS workspace_key TEXT;

CREATE OR REPLACE FUNCTION public.assign_workspace_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF NEW.workspace_key IS NULL OR btrim(NEW.workspace_key) = '' THEN
    NEW.workspace_key := public.generate_workspace_key(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_assign_workspace_key ON workspaces;

CREATE TRIGGER workspaces_assign_workspace_key
BEFORE INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION public.assign_workspace_key();

UPDATE workspaces
SET workspace_key = public.generate_workspace_key(id)
WHERE workspace_key IS NULL OR btrim(workspace_key) = '';

ALTER TABLE workspaces
  ALTER COLUMN workspace_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspaces_workspace_key_not_blank'
  ) THEN
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_workspace_key_not_blank
      CHECK (btrim(workspace_key) <> '');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_workspace_key
  ON workspaces(workspace_key);
