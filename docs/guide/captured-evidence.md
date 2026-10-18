# Project snapshots and aggregate value scans

The **Import** page has a native **Project snapshot and value scans** section.
It accepts the project scanner ZIP (`snapshot.json`, contract 3.5.0 / normalization
3), event-values JSON (an array of scope groups), and customer-property-values
JSON (one group object or an array). This is distinct from the existing QA sampler
ZIP, which contains individual customer events.

## Workflow

1. Select the destination project, enter the source Bloomreach project UUID, and
   upload the snapshot ZIP. Preview checks every asset identity and payload hash,
   member paths, duplicate entries, archive sizes and the project binding.
2. Confirm the exact preview. A changed file or binding requires a fresh preview.
   Reimporting identical bytes returns the existing record without duplication.
3. Upload the event and customer value scans against that same binding. These
   standalone formats usually omit a project UUID, so an imported matching
   snapshot and an explicit operator binding are required. Filename similarity
   does not establish identity.
4. Browse imported assets, scenario triggers and schema/property rows in the
   same panel. Asset links point back to Bloomreach; no source scripts or HTML
   are executed and no remote source is fetched by the importer.
5. Run captured-evidence checks and filter their grouped results. Counts represent
   affected source records, not independent business defects. Latest *imported*
   sources are used; inspect their capture times when comparing snapshots.

## Evidence and QA boundaries

- Configuration/aggregate imports never manufacture event instances, certify a
  requirement, change expected definitions or record business acceptance.
- Evidence is stored in existing project-scoped QA-run storage with a typed
  `e3-captured-evidence-v1` manifest. The record is archived immediately to exclude
  it from event-observation comparisons. It remains visible in the Import panel
  and survives the existing project backup/restore path.
- The original source remains with the operator. The native record retains the
  original file SHA-256, binding, capture metadata, asset inventory, schema
  inventory, selected technical scenario filters and sanitized aggregate facts.
  Raw personal values, customer IDs and arbitrary top-N strings are not stored.
  Only a small explicit allowlist of non-personal business discriminator domains
  retains values. This is a summary import, not an embedded raw ZIP backup.
- Source buckets distinguish `null`, `empty`, truncated distributions and failed
  reads. Multiple null-labelled buckets do not establish a null rate. Missing
  value buckets on a failed read are retained as a failed read.
- Scenario filter checks compare supported literal conditions with complete,
  readable reported value lists. A value not seen in that capture is a review
  candidate, not proof a scenario never executes. Separate marginal aggregates
  cannot establish joined order/payment payloads or delivery latency.
- JSON representation checks compare reported field types with bucket value
  shapes, without changing the expected plan. Masked values do not become type
  errors. Representation findings may originate in the exporter.

## API

Authenticated, project-scoped routes:

- `GET /api/projects/:projectId/captured-evidence`
- `GET /api/projects/:projectId/captured-evidence/checks`
- `POST .../preview` multipart `file`, `source_project_id`
- `POST .../apply` same file/binding plus the returned `payload_hash`

No database migration or new dependency is introduced by this feature. It uses
existing QA-run manifest fields; installations older than migration 0041 must
upgrade the application normally before using it.

The implementation was exercised against the actual owner-supplied project ZIP
and both scan formats, and against regression cases for preview immutability,
project mismatch, stale hashes, repeated imports, corrupt asset payloads, partial
scans, privacy filtering and unsupported archive content. These checks do not
constitute end-to-end campaign delivery QA.


## Reviewed UC/asset links

Migration 0048 adds `asset_link_imports` and `use_case_asset_links`. They retain exact reviewed relationship packages and receipts; observed configuration is derived from captured-evidence manifests rather than an editable status register. Keep whole-volume backups before migration and verify row/lineage preservation separately from campaign delivery QA.

The existing Import page accepts `e3-reviewed-asset-links-v1` JSON through a preview and explicit mapping-confirmation checkbox. Its strict shared schema is `src/domain/assetLinks.ts`: source project UUID, review record/revision/hash reference, and link rows with exact UC ID/code/name, source asset type/ID, relation, evidence package hash, mapping basis and `coverage: unverified`. Review references are operator supplied, not independently authenticated business/client approval. Server actor fields cannot be supplied by the package. Relations come from the shared domain definition.

Staff-only endpoints under `/api/projects/:id/captured-evidence`:
- `POST /links/preview` with `{package}` returns exact additions/existing rows and `payload_hash`.
- `POST /links/apply` requires the unchanged package, `payload_hash` and `human_confirmed: true`. The transaction retains one receipt and adds links only; replay reuses the original receipt. Foreign/missing identifiers, stale UC/source baselines and silent mapping replacement are refused.
- `GET /implementation` returns one canonical projection for staff use-case list/detail views. Public/shared routes do not expose it.

The projection orders evidence by source observation time, never import order. A newer partial capture cannot erase earlier facts or prove deactivation; the UI labels omitted assets as last known. Equal-time conflicting evidence is unknown, undated captures expose freshness uncertainty, and unknown raw statuses stay unknown. Per-asset raw state, source links/hashes, capture time and coverage remain visible. Supporting/variant assets do not by themselves establish a whole-UC implementation.

Lifecycle/approved scope, mapped configuration and observed data/QA are separate columns. Active configuration is not proof of sends, acceptance, complete UC coverage or successful delivery QA. Existing requirement coverage is shown as observed data coverage, never relabelled as campaign certification. Native documents, approvals, requirements, lifecycle, observations and QA conclusions are not mutated by link import.

Backup/restore includes both new tables. Raw packages/review hashes remain immutable, relational IDs are remapped, and restored links remain read-only history without current authority. A fresh destination review is required for a new current link. Preserve the entire volume before a real schema upgrade; image rollback alone is insufficient.

This feature does not add remote collection, automatic discrepancy findings/decision handoffs, scheduling, notifications, paid processing or campaign execution. Mutation POSTs require verified staff and an exact same-origin request.
