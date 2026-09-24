-- Fix round T-1-05 ERROR 1: `variants.name` alone was not a canonical identity for a condition
-- list (submission order, duplicate/unsorted `in` values and a contradictory duplicate property
-- all produced distinct names for what should be the same variant, so `UNIQUE(event_id, name)`
-- never caught them). `variant.dal.ts` now normalizes conditions (dedupe/sort values, collapse a
-- one-value `in` to `equals`, sort conditions by property name, reject a property used twice)
-- before building both `name` and this new deterministic `conditions_key`
-- (`domain/variants.ts` buildConditionsKey), and enforces uniqueness of `conditions_key` per
-- event here at the database, independent of whatever separators the display name happens to use.
--
-- Existing rows (if any) get their own `id` as a placeholder key: it is trivially unique, so the
-- index below always succeeds, and the DAL overwrites this column with the real canonical key the
-- next time each row's conditions are touched. Recomputing the true canonical key here would need
-- the property-name lookups `variant.dal.ts` does in JS, which plain SQL cannot do.
ALTER TABLE variants ADD COLUMN conditions_key TEXT NOT NULL DEFAULT '';

UPDATE variants SET conditions_key = id WHERE conditions_key = '';

CREATE UNIQUE INDEX idx_variants_event_conditions_key ON variants(event_id, conditions_key);
