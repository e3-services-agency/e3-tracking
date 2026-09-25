# T-1-EXIT re-sweep notes (2026-09-25 02:xx)

Worktree: .claude/worktrees/agent-ac248297fb3c5e764, branch task/T-1-EXIT-fixes, commit 7de9a5b.
Project used: QA Exit Client / QA Exit Project One (id d0ed6d55-dc77-4811-a9f4-874d84c71281), second project QA Exit Project Two (id 560087e2-1b7e-4b21-88b0-d03a86067e36).
DB: data/qa-exit.sqlite (fresh, deleted before each server start).

## Cold boot proxy behavior (scenario 1)
curl loop against http://127.0.0.1:3000/api/clients immediately after `npm run dev`:
- requests 1-12: hit the OS-level port-3000 occupant that predates our vite process during its ~1.5s startup window (environment quirk on this machine: port 3000 is also bound by a Docker Desktop/Dagster proxy at the Windows network layer; unrelated to the app).
- request 13: 503 {"error":"The API server is not reachable yet (still starting up?).","code":"API_UNAVAILABLE","detail":""}
- request 14 onward: 200 [] - recovered automatically, no manual reload needed.
Verdict: PASS. Vite proxy 503 JSON fix confirmed working exactly as intended.

## Standard Events / QA Runs display race (scenarios 2-3)
Reproduced repeatedly: immediately after SPA navigation (sidebar click) to Standard Events or QA Runs, get_page_text shows the empty/dash state (all "-" or "No QA runs yet") even though the network request for standard-event-mappings / qa-runs already returned correct data (verified by inspecting the response body of the exact in-flight request via read_network_requests). A follow-up get_page_text call (no further action) shows the correct data - self-corrects within roughly 1-3 read_page/get_page_text calls, no manual reload needed. Reproduced 3/3 times for Standard Events, 1/1 for QA Runs. Hard reload (navigate with force:true) never showed the stale state in this session - always correct on first check after a hard reload.
This is an improvement over the original FAIL-1/FAIL-2 (no longer requires a manual reload / not permanently stuck), but it still violates the literal "no dashes... at any moment you can observe with read_page" bar from the task brief, since the stale render is observable via read_page/get_page_text before it self-corrects.

## Properties editor frozen order (scenario 5)
Renamed "action" -> "zzz_action" (event scope) with the editor open, clicked Save Property. Network: single PATCH .../properties/<id> -> 200, followed by a GET /properties refetch. The background table's "action" row moved to its new alphabetical position (bottom, under "zzz_action") immediately, while the Edit Property panel was still open (confirmed via get_page_text showing "zzz_action" in the table body plus "Edit Property" heading in the same snapshot). Per the acceptance criterion ("save while the editor stays open: the row stays in place; close the editor: list re-sorts") this is a FAIL - the fix's claimed "Properties list keeps a frozen display order while the editor is open" does not hold for a rename that changes sort position.
Creating a new property (qa_new_property) worked correctly: appeared in sorted position after save.

## Everything else
- Import round trip (data-mapping.json, customer-events-export.json): correct, 19 observations, run created, findings match expected kinds (type_mismatch, shape_inconsistent, unexpected_property, unexpected_event with system types correctly excluded).
- Findings page: rows present immediately, filters (Event) work correctly, no stale-render issue observed here.
- Project isolation (switch to project two, back to project one): PASS both directions, Standard Events/QA Runs correct after switching (allowing for the same transient race noted above).
- Full sidebar sweep (Events, Properties, Catalogs, Identity rules, Consent categories, Use cases, Requirements matrix, Sources, Documentation, Settings, Clients): all render correct empty/populated states, zero app-level console errors (only Vite HMR websocket noise, one HMR "server connection lost, polling for restart" blip with no user-visible impact, and stale console-buffer entries from an unrelated Dagster tab that predated this session - not from our app).
- Network: zero supabase requests, zero 500s anywhere after the API was up; the 503 cold-boot response is the only non-2xx before boot completion.
