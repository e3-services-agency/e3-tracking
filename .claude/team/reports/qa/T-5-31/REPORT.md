# QA T-5-31 population-aware QA runs, task/T-5-31-population-qa-runs @ cff55a7 (worktree C:/t/t531)

Overall: PASS with 1 spec discrepancy, 1 console error, 1 note. API 3014, Vite 3011 (throwaway config, HMR off so WebSocket errors in console are my config artefact). Servers stopped by PID; QA db, config and synthetic archives deleted. Archives driven through the real import endpoints with curl multipart (file chooser not drivable); QA runs, Findings and Edit Event checked in the browser.

## 1. qa_scope: PASS
Sandbox document: cart_update true; page_visit (sdk, sdk_auto) false; banner/campaign/consent (platform) false; search set to status ignored false. Edit Event shows "QA scope" select Automatic / In scope / Out of scope; hint text exists in fieldHints ("Whether the QA sampler samples this event..."; tooltip itself not hovered). page_visit set to In scope and saved: document true, History row diff qa_scope_override null to true. Reset to Automatic: false, History row true to null. Public share tracking-document.json carries qa_scope on every event with the same values.

## 2. Import archive A: PASS
Preview warning: "manifest.samples[2] is malformed (needs event, ...); skipped." Confirm: run source extension, samples_json has two rows. QA runs panel shows the table (cart_update / cart_update[action=add] 120/10/14; purchase - 0/0/0), sample line and redaction note. Findings page QA report shows the table per run plus sample method, build and redaction note.

## 3. Findings after A: PASS with one discrepancy
Note: the sandbox's own manual run observes purchase and view_item, so it was deleted first to make them unobserved. purchase missing_event reads exactly "No customer matched the filter for purchase: either the variant never fires or the discriminator values drifted (see unknown_variant)." cart_update (observed, sampled) produced no missing_event. Re-running the comparison kept the finding id (edfac6f9..., not duplicated or reopened).
DISCREPANCY: for purchase (filter_matched 0) actual_json is null, not {population}. Code (definitionVsObservations.ts) and docs/QA-LOCAL.md only add population when filter_matched and customers_read are above 0, so this matches the implementation; the task text expected population on the purchase finding. Positive case verified with archive C (view_item 50/5/7): message "0 of 50 matched customers carried view_item (5 read)." and actual_json.population {filter_matched 50, customers_read 5, events_read 7}.

## 4. Archive B and archiving: PASS
After A + B: "Event "view_item" was not found in a sample of 35 customers (population not checked)." (N = 35 = 25 + A's 10; both runs count). Archived A via PATCH archived true and re-ran the comparison: N = 25. The purchase finding then used the generic wording (sample entry gone with the archived run), same finding id. Un-archiving A and adding C: N = 45 on the report.

## 5. Exports: PASS
events CSV header has qa_scope_override (column 8). backup.json carries events.qa_scope_override (1) and qa_runs.samples_json; restore into key qa-restored: page_visit qa_scope true, the three runs keep source extension and their samples. Public documentation.html (and internal export): 0 occurrences of filter_matched/customers_read/events_read.
NOTE (not in spec): the public share tracking-document.json DOES contain "population":{"filter_matched":50,"customers_read":5,...} inside the missing_event finding's actual (and the message carries the numbers). Findings were already public; flagging in case sampler counts should stay internal.

## 6. Regression: PASS with 1 console error
Events, Properties, Findings, QA runs, Import load (200, content rendered); API log has no 500s.
FAIL (minor, console): React error "In HTML, <table> cannot be a descendant of <p>" on the Findings page, QA report section: QaReports.tsx renders <QaSamplesTable> (a <table data-testid="qa-samples-table">) inside a <p className="text-sm">. Repro: run archive A import, Findings, open the latest report, check browser console. Expected: no DOM-nesting error; actual: hydration/nesting error logged (rendering still works).

## Failures summary
1. Console DOM nesting error (table inside p) in QaReports.tsx report sample section.
2. Spec mismatch only: purchase missing_event with filter_matched 0 has actual_json null (by design in code/docs).
