# Collaboration follow-up acceptance — 2026-10-08

Approved scope: D-78..80 and PLAN-COLLABORATION-2026-10-08.md. All T21..T24 stages are complete and production is released on52f986a-dirty/schema0040. Earlier pending paragraphs are historical checkpoints; the final release record is COLLABORATION-RELEASE-2026-10-08.md.

## T-5-21 accepted

Source commit155e0fc2e2912570d07a02bf01a11f3c42c749b3, integrated into agent-setup. Owner77focusedtests/9files, lint/build/diff PASS. Independent reviewer41tests/3files PASS, including selection guards and legacy reaction handling. Independent QA API checks and image review PASS; root performed actual browser interactions because the QA agent had no browser surface.

Browser proof on isolated compiled localhost3011 fixture: event and property descriptions expand their summary row, copy-link controls leave expansion unchanged, Enter remains available, internal row still opens its editor, and role-aware How it works renders beside Add a comment. Custom certification tooltip explains current blockers/fix/rerun; SDK n/a explains custom-only certification. Active reactions are Seen/Like; In progress is a thread status, not assignment. Shared reopening remains denied while internal reopening succeeds.

Long-body sticky summary stays below the56px brand header, within content width and only while the expanded entity is active. Desktop width920px; narrow390px viewport gives343px summary. Collapse closes the real entity and restores disclosure focus/row position (~96px top). End beyond the entity removes the summary. Narrow body375px; wide nested content remains accessible in a native overflow-x:auto container342px wide/720px scroll extent. Viewport override reset after testing.

Fresh OS-temp disposable fixture/schema0038 is separate from staging, production and prior read-only fixtures. Independent guest root/reply, private suppression and public JSON/HTML export checks passed. Root PID44884 owns the local compiled server; no production comments posted. Temporary share tokens and fixture contents remain outside Git.

## Remaining stages

T-5-22 comments/history targets is accepted. T-5-23 immutable reports and finding discussions is undergoing final independent acceptance. T-5-24 integrated release gates remain pending. Production remains240efde-dirty/schema0038; public health read confirms writable database and last upload success.

Read-only operational review accepts existing0038 helper for a fresh pre-upgrade snapshot and complete rollback0040->0038, provided the saved/restored database is0038 and the current old digest is freshly captured. A separately reviewed0040 helper is required for future current-schema snapshots. Old snapshots are retained; they are not substitutes for a fresh release checkpoint. Full off-site restores and pre-pulled images precede downtime; only IMAGE may change in private configuration comparison.

## Fresh pre-upgrade project backup gate
04-backup dry-run and actual completed:2026-10-08T16-39-17-553Z,2written/2uploaded/0failures, SDK and remote exit0. Both off-site objects independently downloaded outsideGit and restored with0warnings. Airshoppen1068608bytes:23events/194properties/250definitions/1comment. Sandbox699716bytes:15events/50properties/53definitions/11comments/2attachments. User activity means current source counts must be freshly captured again at downtime. Complete quiescent data/config snapshot is still pending; these portable project backups complement it.

## T-5-22 accepted
Source0db69d92b740fb96060a8e39d632c0cfe3155d7e (22files) integrated into agent-setup. Owner160focusedtests/12files plus34document/export/label tests,16existingrestore tests,81correctiontests and genuine foreign-record rerun passed; lint/build/diff PASS. Separate review46broad +27correctiontests PASS/no skips. Independent94initial API/restore checks identified six uniform-error mismatches, all corrected;42boundary reruns PASS. Actual0039 integrityok/FK0; genuine old/new backups restore0warnings, including exact target anchors/replies/filebytes/legacyon_it. Root browser exact identity/catalog/definition sheets/counts/posts/history/Markdown/deep-link reload/internalreuse PASS; separate read-only has no composers/status and disabled reactions. QA image review desktop/internal/narrow PASS. No production test comments or configuration changes. T23 begins next.

## T-5-23 final acceptance evidence
Owner47tests/5files plus4UIcorrectiontests, lint/build/diff PASS. Independent40tests/6files and4UIcorrectiontests/2files PASS/no skips. IndependentAPI/restore117checksPASS: immutable evidence and currentstate/recurrence/distinctnumbers/run deletion, private/foreign/missing targetfiles/read-only restrictions, publiccountfiltering, genuine report/finding replies/images/typedreferences/rawUUID restoration, no fabricated restore reports; both prior production0038backups0warnings. Actual0040readonlyaudit integrityok/FK0/countersPASS.
Root actualdesktop internal/shared UI: realcomparison createsnumberedreport, uniquecounts/canonicallabels, reportroot+staffreply+guestreply count3 distinct from findingroot count1, copiedMarkdown/deeplinkthreadfocus, retainedRecordedopen versusCurrentresolved(acknowledged), appearancehistory. Separateread-only report/finding sheets displayimages with noeditor/reply/status and disabledreactions; errorlogs empty. QA independentdesktopimageinspectionPASS. Viewport API did not apply390 (actual1280), so newT23narrowproof is NOTclaimed; reusedpanel earlierT21/T22 actual390 passed. Temporary viewport reset. Production unchanged; acceptedcommit/integration and T24fullrelease remainpending.

## T-5-24 integrated correction gate
Accepted correction79a1eb8 is integrated into agent-setup via52f986a. The full integrated run initially exposed14 failures (2152 passing): stale migration/run-deletion expectations, endpoint mocks, finding-number snapshot and missing QA-report header hints. Eight scoped files corrected the contracts without skipping tests or weakening assertions. Owner and independent reviewer each passed59/59 across seven files; lint/build/diff passed. Root actual keyboard focus displays Recorded results and Actions help. Final complete-suite rerun is pending; production remains0038.

Latest portable pre-upgrade backups2026-10-08T18-25-49-873Z uploaded both projects with zero failures. Root restored both downloaded objects through integrated0040 service: zero warnings, sandbox11comments/2attachments and Airshoppen1comment preserved, no historical QA reports fabricated. A new quiescent complete0038 snapshot is still required immediately before deployment.

Immediately before release, read-only VM baseline: app39c015dbf520 healthy, backupbe2560936908, Caddy7e2ca33b1548 and oauth2-proxy71ebcf191013. SHA256 of private.env with IMAGE line excluded is3f9d6821d201e6aa1a4d95ba2ef833557966487a49c71bb9e18bfc243c1e8c59 (no credential content recorded). Root/data free13GB/20GB. Require post-upgrade equality and unchanged edge identities.

Final integrated full suite PASS:2166/2166 tests,223/223 files,519.79seconds; no skipped tests in summary. Final lint/build and production gates follow.

Final integrated lint/build/diff PASS; frontend index-cBQYvaiw.js/index-BT0JI166.css. Required02 dry-run passed; actual build/push started from52f986a integrated source.


## T-5-24 release complete
All final gates passed:2166tests/223files, lint/build/diff, fresh complete0038 snapshot and candidate/current image cache, deployed exact0040 integrity/FK/sequences/counts/config/edge checks, actual live UI/privacy, both downloaded final off-site restores0warnings, MCP29tools and monitoring configuration. Authoritative final record: COLLABORATION-RELEASE-2026-10-08.md. Temporary QA cleanup is recorded on BOARD.md.
