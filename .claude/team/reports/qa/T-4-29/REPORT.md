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
