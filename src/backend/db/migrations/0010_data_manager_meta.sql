-- T-2-02 (D-28, D-35, D-37): columns for the Bloomreach Data Manager customers/events formats.
-- Every new column is nullable, so a plain `ALTER TABLE ... ADD COLUMN` is enough (no table
-- rebuild like 0003/0009 needed — those were needed for NOT NULL/dropped columns).
--
-- `properties.bloomreach_meta_json`: customer-scope flags the app has no concept of
-- (`{source, used, deleting, locked_for_contact_migration, dm_index, raw: {description,
-- example_values, type?}}`); event-scope properties keep only `raw` here, per-event flags live on
-- `event_properties.bloomreach_meta_json` instead (D-28, D-35).
-- `events.category` / `events.bloomreach_meta_json`: Data Manager group name and event-level flags
-- (`{source, used, forbidden, deleting, real_time_analytics, are_all_used, dm_index, raw:
-- {description}}`), symmetrical with `Property.category` (T-2-03 populates these; the columns are
-- added now so both tasks' migrations stay in their pre-assigned order, D-39).
-- `event_properties.bloomreach_meta_json`: per (event, property) Data Manager flags (`{dm_type,
-- private, source, used, deleting, group, dm_index, raw: {description, example_values}}`).
-- `projects.data_manager_meta_json`: `{customers: {are_all_used, default_private, group_order[]},
-- events: {default_forbidden, default_private, group_order[]}}`.
-- `projects.data_manager_customers_json` / `data_manager_events_json`: the last applied payloads
-- verbatim plus `applied_at`, the Data Manager snapshot for comparison 4 and export passthrough
-- (D-35).

ALTER TABLE properties ADD COLUMN bloomreach_meta_json TEXT;

ALTER TABLE events ADD COLUMN category TEXT;
ALTER TABLE events ADD COLUMN bloomreach_meta_json TEXT;

ALTER TABLE event_properties ADD COLUMN bloomreach_meta_json TEXT;

ALTER TABLE projects ADD COLUMN data_manager_meta_json TEXT;
ALTER TABLE projects ADD COLUMN data_manager_customers_json TEXT;
ALTER TABLE projects ADD COLUMN data_manager_events_json TEXT;
