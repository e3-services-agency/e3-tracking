# QA T-5-37 QA sample archive import, task/T-5-30-qa-sample-import @ ee299db (worktree C:/t/t530)

Overall: PASS with 4 minor findings and 2 limitations. API 3014, Vite 3011 (throwaway config), servers stopped by PID, QA db/config/generated zips deleted. Counts only; no archive ids or values quoted.

Limitations: (a) the branch tip does not contain T-5-32 (no dm_* kinds in FINDING_KINDS), so the dm_auto_declared / dm_unused / pii_not_declared / pii_not_private counts could not be measured (0 of each, kinds absent). (b) The real zip cannot be handed to the browser file chooser from this harness; the UI scenarios (preview facts, pagination, confirm) were driven in the browser with a synthetic zip (60 events, 180 properties, 421 diff rows); the real archive was exercised through the same endpoints with curl multipart.

## 1. Preview: PASS
Real archive, sandbox: 10 customers, 150 events, 23 event types, DM events 61 / properties 1020, 1575 diff items (sandbox overlap), 0 warnings. Facts: QA Sampler qa-sampler/11, spaced_clusters, requested 10 / read 10, matched 105968, redacted, 27 values masked, redaction note present. UI (synthetic zip): box present on Import page; facts line, Sample line, Redaction line shown; table 100 rows per page ("Page 1 of 5; 421 of 421 selected"), Previous/Next work; unticking 3 rows on page 2 gave "418 of 421 selected", kept after Previous/Next.

## 2. Confirm: PASS (one note)
Apply (default selected 805 ids on the real archive): inserted 150, run created source "extension", manifest_json object, observations 150, History shows one batch source `import:data-manager-events` (200 rows). QA runs page panel (UI) shows "Extension sample (extension)", sample line, tool build, redaction note, Observations (150). Run name "QA sample 2026-10-12T20:25:49.454Z" is stored in notes; the run list shows kind `export_paste` only (no name, no source column).
- Second Preview of the same zip: 812 items (the 770-odd previously unselected default-off items remain; 811 create + 1 update), duplicate_count 150. Apply of the same observations again: 200, inserted 150, skipped 0, a SECOND run created (not refused). Dedupe does not apply across runs. Open findings rose 63 -> 66 warnings; deleting the extra runs restored 54/63.
- Note (minor): UI apply of 418 selected reported "applied 415" (3 dependent event_property rows of the unticked properties presumably dropped); stale diff table stays visible after confirm.

## 3. Findings (sandbox, after first apply): PASS
Open 117 (54 error, 63 warning, 0 info). By comparison: definition_vs_observations 57, data_manager 43, definition_vs_mapping 13, mapping_vs_observations 3, catalogs 1. Kinds: type_mismatch 41 (error; 30 data_manager, 11 observations), missing_event 29, unmapped_property 11, naming_violation 8, shape_inconsistent 6, rounding_drift 5, rename_mismatch 5, item_schema_violation 3, state_list_mismatch 2, unknown_variant 3 (1 error, 2 warning), rule_violation 1, format_violation 1, catalog_schema_drift 1, unmapped_catalog 1. Masked values: zero type_mismatch/format_violation/enum_violation on first_session latitude/longitude/ip/city or consent identification. type_mismatch present for cart_update total_price (string vs number) and product_ids (string vs array; the archive has product_ids, not product_id). dm_* kinds: not available on this branch (see limitations). Certification: cart_update no (open_errors: 10), purchase no (open_errors: 5). One rule_violation (total_price sum of product_list, actual values 0) was raised; not verified whether it is a masked/empty-list artifact.

## 4. API hardening: PARTIAL (3 minor)
- Non-zip file: 400 BAD_REQUEST "not a readable zip archive". PASS.
- Zip without data-manager-events.json: 400. PASS.
- Archive with content changed (an event type renamed): 409 PAYLOAD_CHANGED; wrong hash: 409. PASS. (A trailing newline added to customer-events-export.json is not a change: hash covers parsed payload, apply 200.)
- 26 MB manifest.json entry (zip 26 KB compressed, and 26 MB random stored zip): 400 ARCHIVE_TOO_LARGE both. PASS.
- selected_item_ids not JSON: 400. PASS. FAIL (minor): `{"a":1}` (not an array) and unknown ids (`["nope:1"]`) are accepted with 200 and silently treated as empty / ignored. Expected 400.
- QA run source "bogus": FAIL as specified, N/A in practice: there is no REST create route for qa-runs, and PATCH /qa-runs/:id ignores `source` (200). Validation exists only in the DAL (createQaRun ValidationError, plus DB CHECK per the fix round); not exercised over HTTP.

## 5. Empty project: PASS
Preview same counts (10/150/23, 61 events / 1020 properties, 1647 items, all create). Apply 150 inserted, default-selected 805. Open findings 63 (27 error, 36 warning): type_mismatch 26, missing_event 28, naming_violation 8, shape_inconsistent 1 (no unexpected_event; events are created from the Data Manager schema). By comparison: observations 39, data_manager 16, mapping 8. No crash.

## 6. Exports and shared view: PASS
backup.json (3.4 MB) carries qa_runs with source "extension" and manifest_json as an object (null for the manual run). Restore (preview then apply) into key restored-qa: both runs present, extension run keeps source and manifest (sample method). QA report (GET /qa-reports/:id) scope.participating_runs carries source "extension" and the sample facts incl. redaction note. Shared view (read, force): public tracking-document.json and documentation.html: 0 occurrences of spaced_clusters, qa-sampler, 105968, manifest, QA Sampler, extension; /shared/<token>/qa-reports also has none, /shared/<token>/qa-runs is 404.

## 7. Regression: PASS
Events, Properties, Catalogs, Comments, History, Findings, Import load with content in the browser; no console errors reported; API log: no 500s (provoked 400/409 only).

## Failures summary
1. selected_item_ids that is valid JSON but not an array, or lists unknown ids, is accepted (200) instead of 400. Repro: POST /api/projects/<id>/import/qa-sample/apply with the zip, a valid payload_hash and selected_item_ids={"a":1}.
2. Re-applying the same archive creates a second extension run with duplicate observations (not refused, no warning).
3. Run source "bogus" cannot be tested over REST (no route accepts it; PATCH silently ignores it).
4. QA runs list shows only kind `export_paste`; the run name and source are only visible in the detail panel/notes. Applied-count (415 vs 418 selected) and stale diff after confirm are cosmetic.
