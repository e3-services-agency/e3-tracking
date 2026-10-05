-- T-4-22 (D-65, D-53 amendment 9): per-project naming convention for custom events, their
-- properties and customer properties. System items (sdk/platform events, SDK default properties,
-- reserved system customer properties, standard event keys) are exempt in the domain layer
-- (`src/domain/naming.ts`). Plain ADD COLUMN, no table rebuild; the allowed values are enforced with
-- a CHECK here and in the DAL.
ALTER TABLE projects ADD COLUMN naming_convention TEXT NOT NULL DEFAULT 'snake_case' CHECK (naming_convention IN ('snake_case', 'kebab_case', 'camel_case'));
