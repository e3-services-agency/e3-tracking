-- Journey-level preferred codegen method for trigger/docs rendering.
ALTER TABLE journeys
ADD COLUMN IF NOT EXISTS codegen_preferred_style TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'journeys_codegen_preferred_style_check'
  ) THEN
    ALTER TABLE journeys
    ADD CONSTRAINT journeys_codegen_preferred_style_check
    CHECK (
      codegen_preferred_style IS NULL OR
      codegen_preferred_style IN ('dataLayer', 'bloomreachSdk', 'bloomreachApi')
    );
  END IF;
END $$;
