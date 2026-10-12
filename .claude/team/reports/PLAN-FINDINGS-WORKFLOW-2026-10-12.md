# T-5-29 approved UI organization plan — 2026-10-12

D-85, user-approved proposal plus Use case preview addition. Current source baseline7bb68a4; live f1edc1c-dirty/a1c6b459/schema0040. Implementation isolated, coordinator alone writes team records.

Shared top toolbar: Expand all, Collapse all, QA reports, JSON and HTML share40px height/14px text/padding/border/radius. SectionExpandToggles uses same text control styling. Retain native button/link semantics, labels and keyboard focus; labels determine width.

Findings: one primary five-column working table (Number/Severity/Event/Message/Actions). Compact current totals above search and severity/event/comparison filters. Default Error, Warning, Info then stable sequence; no renumbering. Full wrapping message gets most width. Redundant Open column removed from public open-only list. Expand a finding for original comparison/context and existing family recommendation only. Detailed summary groups stay intact inside closed-by-default accordion. QA reports remain a separate immutable historical section.

Findings sidebar/hash routes filter the primary list and scroll to the first matching row/table, replacing repeated individual lists. Preserve current-finding/report/comment anchors and legacy comparison/event group anchors as aliases; copied row/comment links reveal their target even when prior filters differ. Reset filters/empty results accessible. No additional API/status/private-data fetches or permission changes.

Use case collapsed description: readable plain text derived through existing Markdown parser, <=200Unicode characters including ellipsis. No heading/list layout in table summary. Original full Markdown available once in expanded body and unchanged copy/JSON/HTML exports. No stored truncation or data edits; no new dependency or DOM/HTML parsing.

Verification: meaningful mounted tests for filter combinations/reset/no results, stable severity/sequence ordering, navigation/deep links/target isolation, header+section controls, context disclosure and summary accordion, Unicode/short/long Markdown previews and original expanded/export text. Separate source reviewer and QA, serial heavy checks, type/lint/build. Existing authorized SDK release follows dry runs, fresh off-site backup/restore, complete0040snapshot, config/count audit, health/new assets/MCP/final backup. Preserve main/staging/preexisting.mcp and all live data.

Agent CUA initialization still fails Windows sandbox setup refresh; do not claim actual browser geometry or screenshots unless it becomes available. User already directed proceeding with SDK release despite agent-only visual tool failure. Source/mounted acceptance and live HTTP/data checks are distinct from visual proof.

Approved final amendments: unqualified Findings navigation reveals section heading/totals/search; qualified and exact targets preserve existing behavior. D86 supersedes40px controls with32px h-8/px-3/py-0/text-sm throughout shared text toolbar, per latest user screenshot. Filter inputs and row icon Actions unchanged. T30 independent review/QA each22tests/2files PASS.
