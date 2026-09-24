# Legacy workbook structure (reference only)

Source: "[WIP] - Datacop x ODO __ Data Tracking Document.xlsx", read 2026-09-24. Used to check model coverage. Not a compatibility target (D-02).

## Sheets and header rows
- **README**: purpose text.
- **Use Case List**: USE CASE ID, PRIORITY, USE CASE, TYPE (Transactional/Marketing), STATUS, DESCRIPTION, OWNER, NOTES, REQUIREMENTS (auto). Example IDs UC-ID-01 "Order Placed / Confirmation".
- **Requirement Keys** (hidden, auto): entity_type, event_name, property_name, requirement_key (`event|cart_update|action`), data_requirement (`cart_update.action`), description.
- **Identity**: FIELD IN BLOOMREACH, IDENTITY, TYPE (Hard ID/Soft ID), DESCRIPTION, VALUE, TRIGGER, EXAMPLE, OWNER, SOURCE, TRACKER, PRIORITY, STATUS.
- **Customer Properties**: PROPERTY NAME, PROPERTY CATEGORY, DESCRIPTION, PRIORITY, STATUS, REQUIRED, PII, DATA TYPE, DATA FORMAT, EXAMPLE VALUES, SOURCES, PROPERTY TYPE.
- **Data Requirements Mapping** (hidden, semi-auto): use_case_id, use_case_name, data_requirement, requirement (R/O), requirement_key, mapping_key, source_status (OK / MISSING_SOURCE), notes.
- **Events & Event Attributes** (master view, generated): EVENT_NAME, PROPERTY_NAME, PROPERTY_CATEGORY, DESCRIPTION, PRIORITY, STATUS, REQUIRED, PII, DATA TYPE, DATA FORMAT, EXAMPLE; grouped per event with a header row and summary.
- **Events x Catalogs Properties Matrix**: property rows vs catalog and event columns, marks presence.
- **Data Requirements Matrix**: rows customer/event properties, columns use cases, cells R/O.
- **Events** (master list): EVENT NAME, DESCRIPTION, OWNER, PAGE, TRIGGER, IDENTITY, PURPOSE, EVENT TYPE, SOURCE of LIVE DATA, SOURCE of HISTORICAL DATA, SOURCE of DAILY DATA, PRIORITY.
- **Properties** (master list, 245): PROPERTY NAME, PROPERTY CATEGORY, DESCRIPTION, ODO API MAPPING, PII, DATA TYPE, DATA FORMAT, EXAMPLE VALUES, SOURCES, PRESENCE, PROPERTY TYPE, NOTES.
- **Catalogs**: CATALOG NAME, PROPERTY NAME (Bloomreach), CLIENT CURRENT NAMING, DESCRIPTION, PURPOSE, PRIORITY, STATUS, IS SEARCHABLE?, REQUIRED, ATTRIBUTE TYPE, DATA MAPPING, MAPPING TYPE.
- **Dropdowns**: SOURCES, PRIORITY, IDENTITY, SOURCE TYPE, TRACKING STATUS (planned/implemented/ignored/code review), RELIABILITY, TIMING, EVENT TYPE (custom/system), PRESENCE (Always sent/Sometimes sent), EVENT PROPERTY CATEGORY, CUSTOMER PROPERTY CATEGORY, DATA FORMAT.
- **One sheet per event** (purchase, purchase_item, payment, shipping, gift, voucher, cart_update, view_item, view_category, consent, login, registration, checkout, first_session, session_start, session_end, installation, page_visit): header block (EVENT_NAME, DESCRIPTION, OWNER, PAGE, TRIGGER, IDENTITY, ...) then a PROPERTY_NAME table with the master-view columns.

## Observed weaknesses the app must not inherit
- Broken references (#REF!, #N/A) in event sheets; cancelled sheets kept hidden.
- Variants live only in prose; requirement keys cannot distinguish purchase variants.
- Sources mostly TBD; no per-property source usable by QA.
- Status per property is manual; no history.
