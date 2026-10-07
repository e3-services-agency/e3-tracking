# QA T-4-29 + T-4-31 (branch task/T-4-29-field-hints @ 93f095a) — FAIL

Written by the supervisor from the qa-tester's report (its Write tool was disabled). Sandbox project, API 3012, Vite 3010, servers stopped and QA db removed. Browser pane had no OS focus: hover/focus driven by dispatched events plus real Esc presses; layout judged from bounding boxes.

| # | Scenario | Result |
|---|---|---|
| 1 | Hint affordance (icon counts: Events 10, Properties 9, Catalogs 7, Identity rules 10, Use cases 7, Settings 14, Edit Event drawer 50 on 39 labels, event card 34, shared view 69 collapsed / 483 expanded; opens within one frame, role=tooltip, aria-describedby, focus opens, Esc closes, not clipped in drawer/modal, flips at the bottom; Esc closes tooltip first, second Esc the dialog) | PASS |
| 2 | Hint text (20 read) | FAIL: Properties "Kind" uses the catalog text; Use cases "Status" lists planned/implemented/ignored instead of Proposed/Approved/In progress/Live/Dropped; "Share access" has no hint; "Definition" ~170 chars and no example; "Level" says R/O while the select says Required/Optional; "Method" example "file import" not in the list; "Priority" and "Description" examples are event-specific but reused on Catalogs/Identity rules/Use cases; Identity rules and Sources "Name" example lists events; Identity rules table "Type" says personalisation/retention instead of hard/soft; "Actions" generic |
| 3 | Checkbox labels | FAIL (F1): clicking the "?" toggles the checkbox it sits in (Edit Event "Expiration", all "Required" linked-property rows, comments "Internal only"); label text toggles correctly |
| 4 | Icons (Split for variants on Events sub-rows, editor, card, matrix, shared view; others consistent) | PASS; note: a catalog of kind "variant" also uses Split |
| 5 | Enum selects (labels, order, badge, raw values stored, Findings filters) | PASS with notes: Events create "Automatic" stores client_web (server default), could not confirm null was sent; still raw selects: Property type, Scope, Data type, Mapping role, Identity type, SDK call, Use case type |
| 6 | Badge labels | partial FAIL: Status/Priority/Severity capitalised consistently; Implementation method raw (`server_api`) on the event card and the shared view; HTML export (internal and shared) uses raw values throughout (`implemented`, `server_api`, `in_review`) |
| 7 | Regression (header sort by mouse/keyboard with aria-sort, Sheet maximize/Esc, no console errors, no 500s) | PASS |

Also noted: decision codes visible in user-facing labels ("Share link (D-48)", "Money tolerance (rules, D-30)", Properties subtitle "(D-24)").

Reproduction F1: Events > cart_update > click the "?" next to "Expiration" > checkbox toggles. Fix: stop propagation / preventDefault on the icon or render it outside the label.
Reproduction F2: hover the listed labels and compare with the real options.

## Re-check 0a50ef3

Sandbox project, API 3014, Vite 3011 (throwaway config), servers stopped and QA db removed. Browser pane intermittently could not screenshot or resize; the "Internal only" icon click was a dispatched click (real clicks used for Expiration and Required), hovers via dispatched pointer/focus events plus real Tab/Enter/Esc keys. Downloads saved here as recheck-*.html/json.

Overall: PASS with 3 minor findings.

| # | Item | Result |
|---|---|---|
| 1 | F1 "?" no longer toggles the checkbox (Expiration real click: stays unchecked, tooltip opens; linked-property Required real click: stays checked, tooltip opens; comments "Internal only" icon click: stays unchecked); label text click toggles; Tab to icon opens tooltip, Enter keeps it and the checkbox, Esc closes the tooltip first and leaves the drawer open | PASS |
| 2 | F2 hints (read from the rendered tooltips) | PASS with 1 minor |
| 3 | Enum labels | PASS |
| 4 | Selects with labels, raw values; "Automatic" sends null | PASS |
| 5 | No "(D-" text | FAIL (minor, 2 pages outside the listed ones) |

Item 2 detail. Rendered text matches the real options: Properties "Type" (kind: event, item, state list, context, example item), Scope, Data type; Use cases "Status" (Proposed, Approved, In progress, Live or Dropped, example), "Type", "Name"; Identity rules "Type" (hard/soft with example), "Name", "Status"; Sources "Name" (and "Collection method" label in the form); Settings "Share access" (read/comment, example); requirement row "Level" (Required (R)/Optional (O), example). "Definition" is only in the Properties "Used by" sub-table, which I could not open in the pane; its dictionary text (about 100 chars, with example) was checked in src/domain/fieldHints.ts only.
- MINOR F2a: the "Status" column header in the use case requirements table (values open, resolved, gap) shows the use case status hint (Proposed, Approved, ...). Repro: Use cases, open a use case, hover "Status" in the Requirements table. Expected: open/resolved/gap hint. Actual: use case lifecycle list.

Item 3 detail. Event card (purchase): "Server API", "Implemented", no raw values. Shared view (all events expanded): "Server API" / "Client web (dataLayer)" only. documentation.html internal (200) and shared via force link (200): zero occurrences of `server_api`, `in_review`, `client_web`, `sdk_auto`, `in_progress`; "Implemented", "In progress", "Proposed", "Server API", "Client web (dataLayer)" present. Only `state_list` remains, in a finding-kind title attribute (`state_list_mismatch`) and a DOM anchor id: acceptable.

Item 4 detail. Properties dialog: Scope Event/Customer, Data type String..Array, Property type Event/Item/State list/Context, Priority/Status labelled. Catalogs: Main catalog/Variant catalog, Product/Variant/Other. Identity rules: "Hard (known customer)"/"Soft (cookie or device)", SDK call Identify/Update/Anonymize. Use cases: Marketing/Transactional. Option values are raw (hard, identify, marketing, state_list, ...). Create event "qa_auto_event" with Automatic: POST body had `"implementation_method":null`; the saved value is `client_web` (derived for a custom event).

Item 5 detail. No "(D-" in Settings, Comments, History, Import, Properties, Use case templates, Events, Catalogs, Identity rules, Sources, QA runs, Getting started, Requirements matrix, Consent categories, Use cases, Clients. Remaining:
- MINOR F5a: Findings page intro text: "... definition vs Data Manager (4, D-21/D-28)."
- MINOR F5b: Standard events page subtitle: "Bloomreach standard events (seed + project additions, D-26) mapped to a project event and variant."

Console: no errors. Failed network requests: none.
