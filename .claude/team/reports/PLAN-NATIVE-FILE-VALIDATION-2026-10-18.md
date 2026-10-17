# Native historical-file validation: smallest integration proposal

Date: 2026-10-18. Status: inspection/proposal only; no client-file ingestion or validation executed. Separate from T-5-52 OAuth compatibility.

## Existing authority and gaps

The committed hosted baseline e6d398f has project-scoped QA runs, import preview/apply with payload hashes, deterministic comparison/rule services, immutable numbered QA reports, finding discussions/history, and authenticated MCP actor/scoping. `src/backend/services/customerEventsExportImport.service.ts` accepts actual timestamped event exports; `src/mcp/tools/observations.ts` defaults a missing single-observation timestamp to capture time. That latter convenience must never be used to turn undated historical CSV rows into live observations.

`src/backend/dal/qa-report.dal.ts` freezes finding diagnostics and priority, but its snapshot_version is a format version, not a revision of the definitions/rules used. Existing participating-run metadata does not provide a full source-file/check/definition revision receipt. Current MCP tools have no generic historical CSV intake.

The dirty local ODO branch also has `capturedEvidence.service.ts` and captured-evidence preview/apply routes. Those store hashed configuration/aggregate captures in archived QA-run records without observations or certification changes. This is useful native precedent, but it is uncommitted local work and is not included in the hosted OAuth release. Its accepted projection/checks must be retained if the file adapter is integrated later.

## Recommended bounded addition

1. Add one historical-source-file adapter to the existing native import/service layer. Preview accepts exact destination project, source references and uploaded bytes; hashes raw bytes, checks headers/encoding/delimiter and declared column-to-event/property mappings, and shows row counts plus unsupported checks. Do not automatically fetch arbitrary URLs. Record original source URL/file identifier as provenance, excluding expiring access tokens from public output. Apply binds the exact preview hash, project, files, mapping and definition/rule revision. Reject changed bytes/revisions rather than quietly applying a stale preview.
2. Run a bounded deterministic validation inside Tracking against a frozen canonical snapshot/hash of the selected definitions and applicable rules, plus engine/build revision. Preserve declared raw values: report numeric strings/apostrophe prefixes rather than silently coercing them. Reuse existing pure type/format/enum/value checks where semantics match. Explicitly separate per-row checks, cross-file joins/aggregates and checks that are unsupported without timestamps or original payload context. Document timezone/currency/join-key/rounding assumptions before cross-file checks. Report checked, failed and skipped counts with source file hash and row/column references; no unnecessary personal values in summaries.
3. Persist one immutable native file-validation run/report with source references/hashes, source capture/export times when available, ingestion time separately, mapping, definition/rule snapshot/hash, engine revision, check outcomes/limitations, verified OAuth actor and grant audit reference. Reuse existing numbered report/discussion/history infrastructure with an explicit historical-file kind. Do not invent live FindingRow/observation records merely to fit the current report renderer, and do not let a file-only run resolve unrelated runtime findings or change event certification. Repeat requests use an idempotency key derived from exact input/revision/mapping; a different revision is a new report.
4. Expose thin MCP preview/apply/read wrappers over those same native services, with project isolation, existing read/write scopes and server-derived actor. Preview returns the concrete proposed write and confirmation/hash; apply cannot bypass that contract. Cortex stores the authoritative Tracking report ID/link/hash and limitations, rather than maintaining another validation engine or treating a chat answer as the report.

## Acceptance before client use

- Synthetic CSV fixture with quoted commas, blank/null, literal apostrophe-prefixed numbers, invalid types and mismatched joins; preserve row references and raw representation.
- Missing event timestamps explicitly skip temporal/freshness/order/live-coverage checks; zero observations added and no certification/status/approval changes.
- Hash/project/revision mismatch rejected; replay idempotent; foreign project references denied; actor supplied by the client ignored.
- Exact checks, result counts and limitations survive export/restore and appear on the immutable report with separate discussions; historical reports do not change when definitions change.
- Existing event intake/comparison results remain unchanged. Review/QA precede an explicitly scoped implementation and rollout, independent of the OAuth compatibility release.

## Inputs still needed at implementation

Select the authoritative destination (local ODO pilot versus hosted project), approve explicit source column mappings and cross-file check semantics, and confirm the concrete preview. No original event timestamp may be inferred from download time, filename, ingestion time or order identifier. The known CSV filenames/counts from the source chat are prior external claims, not verified native results from this inspection.
