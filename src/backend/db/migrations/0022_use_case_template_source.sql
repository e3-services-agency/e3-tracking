-- T-4-08 (D-59, migration number 0022 per the D-53 amendment 3): the Use Case Center pnp_usecase
-- converter's extra fields, plus the D-59 amendments (documentation link and internal-only notes).
-- Plain nullable `ADD COLUMN`s, no table rebuild.

-- D-59: prerequisites (free-text notes from main_catalog/integrations/text requirements),
-- expected_assets ({type, headline} from fulfillments) and source ({kind, template_id?,
-- documentation_link?, callout?}) on the global template library.
ALTER TABLE use_case_templates ADD COLUMN prerequisites_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE use_case_templates ADD COLUMN expected_assets_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE use_case_templates ADD COLUMN source_json TEXT;

-- D-59 amendment 1: an external documentation link, copied from the template onto every use case
-- instantiated from it and editable afterwards.
ALTER TABLE use_case_templates ADD COLUMN documentation_url TEXT;
ALTER TABLE use_cases ADD COLUMN documentation_url TEXT;

-- D-59 amendment 2: internal-only notes/link, never surfaced in the tracking document, the
-- documentation HTML export or MCP tool output; editable on the template detail and the use case
-- page under an "Internal" heading, copied from the template on instantiate.
ALTER TABLE use_case_templates ADD COLUMN internal_notes TEXT;
ALTER TABLE use_case_templates ADD COLUMN internal_url TEXT;
ALTER TABLE use_cases ADD COLUMN internal_notes TEXT;
ALTER TABLE use_cases ADD COLUMN internal_url TEXT;
