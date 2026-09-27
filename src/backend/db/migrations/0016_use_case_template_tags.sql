-- T-3-06 (D-47, D-57): adds the use case library's tag facets and new/popular flags to
-- `use_case_templates`, plain nullable `ADD COLUMN`s (no table rebuild needed).
--
-- Migration number 0016 is assigned to T-3-06 per the D-53 amendment (2026-09-27): T-3-06 had no
-- number pre-assigned by the original D-53 list, which stopped at 0015 (T-3-01); the amendment
-- confirms 0016 for this file, moving T-4-01's own migration to 0017 and T-4-02's to 0018.
ALTER TABLE use_case_templates ADD COLUMN tags_json TEXT;
ALTER TABLE use_case_templates ADD COLUMN flags_json TEXT;
