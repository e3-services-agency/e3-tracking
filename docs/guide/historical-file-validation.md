# Historical source-file validation

Historical CSV checks are native Tracking evidence. They are separate from observed-event QA, event certification and customer acceptance. CSV transport cells are text: the declared lexical policy assesses compatibility with the current native definitions without claiming the original event JSON types or approving the business meaning of a draft definition.

## Upload, preview and apply

Verified staff upload each CSV through `POST /api/projects/:projectId/historical-files/sources`, multipart field `file`, with `source_ref` and optional explicit `source_captured_at`. The request needs the existing staff session and exact same-origin Origin header. Maximum file size is 32 MiB. Original bytes remain private. A reference is an opaque file identifier or an HTTPS URL without credentials, query or fragment; URLs are never fetched. Source capture/upload time is separate from original event time.

The upload returns an opaque project-scoped source ID, exact raw-byte SHA256, headers and record count. Review a manifest containing the exact current event/property/linked-definition IDs, every mapped column, explicit source-only columns, optional trailing-empty suffix and any explicit one-to-many join. No interior cells shift. Missing optional trailing category cells are assessed only under the declared policy.

Use `preview_historical_validation` with the manifest. It returns the concrete report write, input mapping, definition/rule and engine hashes, limitations and exact `payload_hash`. Preview is read-only. After reviewing it, call `apply_historical_validation` with the same manifest, hash and `confirmed: true`. Apply requires project read/write scopes and is attributed to the verified OAuth identity. Changed bytes, mapping, project, definition/rule revision or engine reject the stale preview. Exact replay returns the same immutable report.

## Read the report

Open Findings → QA reports → **Open historical report** on the numbered **Historical source files** row, or use the returned permanent link. Both open the authenticated native report view; its Back link returns to Tracking QA reports. The staff report shows reviewed filenames/source links, mapped event context, passed/failed/skipped check-instance counts, unmapped columns, limitations and bounded CSV record/column diagnostics. The source cell values are not copied into diagnostics. `get_historical_validation` provides the same evidence with bounded pagination. Existing report discussions remain separate from runtime findings; historical reports and discussions are excluded from public shares.

No observations, runtime findings, certification, event statuses, approvals or unrelated finding resolution are changed. Missing timestamps explicitly prevent temporal, freshness, ordering and live-coverage assertions. Unsupported nested/item-schema, arithmetic, discount-sign and cross-file business checks remain unassessed. One-to-many joins require unique nonempty purchase keys on the left; repeated item keys on the right are expected. Ambiguous left keys or structurally invalid sources skip join interpretation.

Native project backups retain the raw source artifacts and exact immutable report snapshots/hashes. Portable restore remaps only live linkage IDs and file paths, preserving original provenance and marking the restored report. Readback rehashes the current artifacts separately; missing or changed bytes do not rewrite the original report and cannot be applied as current evidence. Restored original event IDs remain recorded context rather than guessed operational links.
