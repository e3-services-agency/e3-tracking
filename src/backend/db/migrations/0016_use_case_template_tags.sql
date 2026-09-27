-- T-3-06 (D-47, D-57): adds the use case library's tag facets and new/popular flags to
-- `use_case_templates`, plain nullable `ADD COLUMN`s (no table rebuild needed).
--
-- Migration number note for the supervisor/merge sequencing: D-53 pre-assigns 0015 to T-3-01
-- (change_log), 0016 to T-4-01 and 0017 to T-4-02 (both phase 4, not yet started). T-3-06 had no
-- pre-assigned number (D-53's list stops at 0015; the phase 3 group A parallel set is
-- T-3-01/T-3-03/T-3-06/T-3-07 and only T-3-01 needs a migration per that plan). This file uses
-- 0016 provisionally because it is the next free number in the *phase 3* sequence; if T-4-01 has
-- already claimed 0016 by the time this merges, please renumber this file (and T-4-01's, whichever
-- is easier) so the two never collide -- there is no ordering dependency between them.
ALTER TABLE use_case_templates ADD COLUMN tags_json TEXT;
ALTER TABLE use_case_templates ADD COLUMN flags_json TEXT;
