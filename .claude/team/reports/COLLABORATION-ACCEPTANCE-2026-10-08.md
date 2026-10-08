# Collaboration follow-up acceptance — 2026-10-08

Approved scope: D-78..80 and PLAN-COLLABORATION-2026-10-08.md. This report accumulates actual stage evidence; it does not claim the pending schema upgrade is released.

## T-5-21 accepted

Source commit155e0fc2e2912570d07a02bf01a11f3c42c749b3, integrated into agent-setup. Owner77focusedtests/9files, lint/build/diff PASS. Independent reviewer41tests/3files PASS, including selection guards and legacy reaction handling. Independent QA API checks and image review PASS; root performed actual browser interactions because the QA agent had no browser surface.

Browser proof on isolated compiled localhost3011 fixture: event and property descriptions expand their summary row, copy-link controls leave expansion unchanged, Enter remains available, internal row still opens its editor, and role-aware How it works renders beside Add a comment. Custom certification tooltip explains current blockers/fix/rerun; SDK n/a explains custom-only certification. Active reactions are Seen/Like; In progress is a thread status, not assignment. Shared reopening remains denied while internal reopening succeeds.

Long-body sticky summary stays below the56px brand header, within content width and only while the expanded entity is active. Desktop width920px; narrow390px viewport gives343px summary. Collapse closes the real entity and restores disclosure focus/row position (~96px top). End beyond the entity removes the summary. Narrow body375px; wide nested content remains accessible in a native overflow-x:auto container342px wide/720px scroll extent. Viewport override reset after testing.

Fresh OS-temp disposable fixture/schema0038 is separate from staging, production and prior read-only fixtures. Independent guest root/reply, private suppression and public JSON/HTML export checks passed. Root PID44884 owns the local compiled server; no production comments posted. Temporary share tokens and fixture contents remain outside Git.

## Remaining stages

T-5-22 comments/history targets is in progress. T-5-23 immutable reports and finding discussions follows its acceptance. T-5-24 integrated release gates remain pending. Production remains240efde-dirty/schema0038; public health read confirms writable database and last upload success.

Read-only operational review accepts existing0038 helper for a fresh pre-upgrade snapshot and complete rollback0040->0038, provided the saved/restored database is0038 and the current old digest is freshly captured. A separately reviewed0040 helper is required for future current-schema snapshots. Old snapshots are retained; they are not substitutes for a fresh release checkpoint. Full off-site restores and pre-pulled images precede downtime; only IMAGE may change in private configuration comparison.

## Fresh pre-upgrade project backup gate
04-backup dry-run and actual completed:2026-10-08T16-39-17-553Z,2written/2uploaded/0failures, SDK and remote exit0. Both off-site objects independently downloaded outsideGit and restored with0warnings. Airshoppen1068608bytes:23events/194properties/250definitions/1comment. Sandbox699716bytes:15events/50properties/53definitions/11comments/2attachments. User activity means current source counts must be freshly captured again at downtime. Complete quiescent data/config snapshot is still pending; these portable project backups complement it.

## T-5-22 accepted
Source0db69d92b740fb96060a8e39d632c0cfe3155d7e (22files) integrated into agent-setup. Owner160focusedtests/12files plus34document/export/label tests,16existingrestore tests,81correctiontests and genuine foreign-record rerun passed; lint/build/diff PASS. Separate review46broad +27correctiontests PASS/no skips. Independent94initial API/restore checks identified six uniform-error mismatches, all corrected;42boundary reruns PASS. Actual0039 integrityok/FK0; genuine old/new backups restore0warnings, including exact target anchors/replies/filebytes/legacyon_it. Root browser exact identity/catalog/definition sheets/counts/posts/history/Markdown/deep-link reload/internalreuse PASS; separate read-only has no composers/status and disabled reactions. QA image review desktop/internal/narrow PASS. No production test comments or configuration changes. T23 begins next.
