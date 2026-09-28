-- T-3-06 (D-47, D-57): adds the use case library's tag facets and new/popular flags to
-- `use_case_templates`, plain nullable `ADD COLUMN`s (no table rebuild needed).
--
-- Migration number 0016 is assigned to T-3-06 per the D-53 amendment (2026-09-27): T-3-06 had no
-- number pre-assigned by the original D-53 list, which stopped at 0015 (T-3-01); the amendment
-- confirms 0016 for this file, 0017 for T-3-10 (project industry / requirement target columns),
-- 0018 for T-4-01 and 0019 for T-4-02 (fix round, T-3-10: this note previously said 0017/0018 for
-- T-4-01/T-4-02, from before T-3-10 itself needed a number).
ALTER TABLE use_case_templates ADD COLUMN tags_json TEXT;
ALTER TABLE use_case_templates ADD COLUMN flags_json TEXT;
