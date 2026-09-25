-- T-2-12 (D-38, D-40 Q5): aligns `identity_rules` with Bloomreach's identify/update/anonymize
-- vocabulary. `bloomreach_field` (free text) is renamed `identifier_name` (no legacy alias, D-02);
-- `transformations_json` (array from `IDENTITY_TRANSFORMATIONS`, `src/domain/enums.ts`) and
-- `sdk_call` (`identify | update | anonymize`, nullable for policy-only rules) are new. Plain
-- `RENAME COLUMN` / `ADD COLUMN` suffice here (unlike 0009's `events.class`): no CASE-based
-- backfill is needed, so the table-rebuild pattern is not required.

ALTER TABLE identity_rules RENAME COLUMN bloomreach_field TO identifier_name;
ALTER TABLE identity_rules ADD COLUMN transformations_json TEXT;
ALTER TABLE identity_rules ADD COLUMN sdk_call TEXT;
